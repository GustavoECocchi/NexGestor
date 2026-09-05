"""
Benchmark de mercado (fase-2b) — busca via Gemini com grounding de busca.

Ver docs/prds/fase-2b-benchmark-mercado.md e a revisão crítica registrada em
docs/sessions/2026-09-04.md ("(parte 4)"). Reescrito depois dessa revisão —
decisões conservadoras fixadas no prompt de correção (não reabrir):

  1. Benchmark é referência informativa — nunca recalcula status/score.
  2. SÓ `ctr_link` faz busca real agora. CPA/CPL/CPM dependem de país/moeda/
     período, que o contrato ainda não tem — sempre fallback, sem chamar Gemini.
  3. Análise principal nunca espera o benchmark (isso é responsabilidade do
     frontend, ver `NewCampaignModal.tsx`/`App`).
  4. Fonte só é aceita quando SUSTENTA o número: a URL/nome vêm de
     `grounding_metadata.grounding_supports` associado ao trecho exato do
     valor — nunca do texto livre que o modelo "declarou" como fonte.

Grounding e `response_schema` são incompatíveis na mesma chamada do Gemini
(confirmado inspecionando `google.genai` 2.6.0). Por isso este serviço NUNCA
usa `response.parsed` — pede um número em formato fixo (`VALOR: x` ou
`NAO_ENCONTRADO`) e associa a fonte via `grounding_supports`/`grounding_chunks`.

Classificação de resultado (ver `_interpretar_resposta`) — só DOIS desfechos
são cacheáveis por 14 dias:
  • `encontrado=True`  — valor plausível com fonte associada e verificável.
  • `encontrado=False` — resposta EXPLÍCITA `NAO_ENCONTRADO` do modelo.
Qualquer outra coisa (resposta vazia, formato inesperado, valor fora de
faixa, sem suporte de grounding, URL insegura, timeout, exceção do SDK) é
`BenchmarkFalhaTransitoria` — nunca cacheada, nunca disfarçada de "não
encontrado": a rota traduz para 503 acionável.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional, get_args
from urllib.parse import urlparse

from app.core.config import settings
from app.service import storage
from app.service.ai_service import _get_client, _redact_key, is_ai_available
from app.service.labels import NICHE_LABELS, OBJECTIVE_LABELS, PLATFORM_LABELS

logger = logging.getLogger(__name__)

# Vocabulário de métrica aceito pela rota — fonte única, usada também pelo
# schema de entrada da rota (`app/routes/benchmark.py`). Inclui ROAS/Hook
# Rate (viram fallback explícito) para que pedir por elas seja 200 "não
# encontrado", nunca 422 — só um nome fora daqui é "métrica desconhecida".
BenchmarkMetric = Literal["ctr_link", "cpa", "cpl", "cpm", "roas", "hook_rate"]
METRICAS_VALIDAS = frozenset(get_args(BenchmarkMetric))

# Decisão conservadora da revisão Opus (2026-09-04): só CTR Link busca real
# agora. CPA/CPL/CPM são valores monetários — o request não carrega
# país/moeda/período, então comparar com uma fonte em USD/outra região seria
# uma comparação semanticamente inválida disfarçada de benchmark confiável.
_METRICAS_COM_FONTE_REAL = frozenset({"ctr_link"})
_PLATAFORMAS_COM_FONTE_REAL = frozenset({"meta_ads", "google_ads"})

# Faixa plausível por métrica (só métricas com busca real precisam de uma).
# CTR Link é percentual: exclusivo de 0 (um benchmark de mercado "0%" não é
# uma média de indústria plausível, é sinal de erro de leitura) e inclusivo
# de 100.
_FAIXA_PLAUSIVEL: dict[str, tuple[float, float]] = {
    "ctr_link": (0.0, 100.0),
}

_METRIC_LABELS = {
    "ctr_link": "CTR Link", "cpa": "CPA", "cpl": "CPL", "cpm": "CPM",
    "roas": "ROAS", "hook_rate": "Hook Rate",
}

# Motivos de `encontrado=False`, DISTINTOS de propósito (revisão Opus,
# 2026-09-05): antes os dois casos usavam o mesmo texto genérico de
# "não existe benchmark", o que afirmava uma conclusão que a busca nunca
# tirou. Falta de contrato de moeda não prova inexistência de fonte.
MOTIVO_NAO_ELEGIVEL = "nao_elegivel"
MOTIVO_NAO_ENCONTRADO = "nao_encontrado"

_TEXTO_MOTIVO = {
    # Nós não buscamos — não é uma afirmação sobre o mercado.
    "ctr_link": "esta plataforma não tem fonte pública de CTR que possamos citar",
    "_custo": (
        "busca de benchmark de custo ainda não habilitada — depende de contrato "
        "de país/moeda/período, que a API ainda não tem"
    ),
    "_sem_fonte": "sem fonte pública confiável segmentada por indústria para esta métrica",
    # A busca aconteceu e concluiu ausência.
    MOTIVO_NAO_ENCONTRADO: "busca realizada: nenhuma fonte pública citável encontrada para este setor",
}

_METRICAS_DE_CUSTO = frozenset({"cpa", "cpl", "cpm"})

# Fullmatch estrito — texto extra antes/depois, múltiplos valores ou forma
# ambígua caem no `else` (não casam) e viram falha transitória, nunca um
# valor aceito por acidente. Sem "FONTE" no formato esperado de propósito: o
# nome/URL da fonte vêm de `grounding_supports`, nunca do texto livre do
# modelo (ver módulo).
_PADRAO_VALOR = re.compile(r"VALOR:\s*(\d+(?:\.\d+)?)")
_NAO_ENCONTRADO = "NAO_ENCONTRADO"


@dataclass
class BenchmarkResultado:
    metric: str
    encontrado: bool
    value: Optional[float] = None
    fonte: Optional[str] = None
    fonte_url: Optional[str] = None
    capturado_em: Optional[str] = None
    motivo: Optional[str] = None
    # `nao_elegivel` (não buscamos) x `nao_encontrado` (buscamos e não achou).
    motivo_tipo: Optional[str] = None

    def to_dict(self) -> dict:
        if self.encontrado:
            return {
                "metric": self.metric, "encontrado": True, "value": self.value,
                "fonte": self.fonte, "fonte_url": self.fonte_url,
                "capturado_em": self.capturado_em,
            }
        return {
            "metric": self.metric, "encontrado": False,
            "motivo": self.motivo, "motivo_tipo": self.motivo_tipo,
        }


class BenchmarkIndisponivel(RuntimeError):
    """
    Erro de serviço acionável: a métrica exigiria uma chamada ao Gemini, mas
    o cache (persistência desligada) ou a IA (sem chave/toggle) não estão
    disponíveis. Nunca é reportado como "benchmark não encontrado".
    """


class BenchmarkFalhaTransitoria(RuntimeError):
    """
    A métrica é elegível para busca real, mas a fonte não pôde ser
    verificada AGORA — resposta vazia, formato inesperado, valor fora da
    faixa plausível, sem suporte de grounding associado, URL insegura,
    timeout ou exceção do SDK. NUNCA cacheada (não é "o mercado não tem
    benchmark", é "não deu para confirmar desta vez"); a rota traduz para
    503, nunca para `encontrado=false` de 200.
    """


def url_publica_valida(url: object) -> bool:
    """
    HTTP(S) COM host analisável — não basta o prefixo (revisão Opus,
    2026-09-05: `https://` sozinho passava). O host precisa existir e ter ao
    menos um ponto ou ser `localhost`; sem isso a URL não é citável e não
    pode virar link na UI.
    """
    if not isinstance(url, str) or not url.strip():
        return False
    try:
        p = urlparse(url.strip())
    except ValueError:
        return False
    if p.scheme.lower() not in ("http", "https"):
        return False
    host = (p.hostname or "").strip()
    return bool(host) and ("." in host or host == "localhost")


def data_iso_valida(valor: object) -> bool:
    """Timestamp precisa ser uma data ISO real — string não vazia não basta."""
    if not isinstance(valor, str) or not valor.strip():
        return False
    try:
        datetime.fromisoformat(valor.strip())
        return True
    except ValueError:
        return False


def _numero_util(valor: object) -> bool:
    """
    `bool` é subclasse de `int` — `True` viraria `1.0` silenciosamente. Mesma
    armadilha já corrigida no schema de entrada (`_SemBooleanoEmInteiro`).
    """
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return False
    return math.isfinite(valor)


def _elegivel_para_busca_real(metric: str, platform: str) -> bool:
    return metric in _METRICAS_COM_FONTE_REAL and platform in _PLATAFORMAS_COM_FONTE_REAL


def valor_plausivel(metric: str, valor: object) -> bool:
    """Faixa por métrica — usada no parser, na leitura do cache e na escrita."""
    if not _numero_util(valor):
        return False
    faixa = _FAIXA_PLAUSIVEL.get(metric)
    if faixa is None:
        return False  # sem faixa definida = métrica não deveria ter chegado aqui
    minimo, maximo = faixa
    return minimo < float(valor) <= maximo


def _fallback_nao_elegivel(metric: str, platform: str) -> BenchmarkResultado:
    """
    NÃO buscamos — e o motivo diz exatamente isso. Nunca afirma que o
    benchmark não existe (revisão Opus, 2026-09-05): falta de contrato de
    moeda é limitação NOSSA, não uma conclusão sobre o mercado.
    """
    if metric in _METRICAS_DE_CUSTO:
        texto = _TEXTO_MOTIVO["_custo"]
    elif metric not in _METRICAS_COM_FONTE_REAL:
        texto = _TEXTO_MOTIVO["_sem_fonte"]
    else:
        texto = _TEXTO_MOTIVO["ctr_link"]  # métrica ok, plataforma sem fonte
    return BenchmarkResultado(
        metric=metric, encontrado=False, motivo=texto, motivo_tipo=MOTIVO_NAO_ELEGIVEL
    )


def _ausencia_confirmada(metric: str) -> BenchmarkResultado:
    """A busca ACONTECEU e o modelo respondeu `NAO_ENCONTRADO` — cacheável."""
    return BenchmarkResultado(
        metric=metric, encontrado=False,
        motivo=_TEXTO_MOTIVO[MOTIVO_NAO_ENCONTRADO], motivo_tipo=MOTIVO_NAO_ENCONTRADO,
    )


def _cache_e_valido(cache: Optional[dict], metric: str) -> bool:
    """
    Linha inválida (bit-rot, escrita de versão antiga, regra de atribuição
    diferente) vira MISS seguro — nunca dado confiável, nunca exceção
    (revisão Opus, 2026-09-05: um `valor` textual levantava `TypeError` em
    vez de virar miss, e CTR 999 / data inválida passavam).
    """
    if cache is None:
        return False
    # Linhas gravadas antes da regra atual de atribuição de fonte (cobertura
    # integral do trecho + host válido) não podem ser reaproveitadas: um
    # positivo pode ter vindo de fonte parcialmente coberta, e um negativo,
    # de falha transitória cacheada indevidamente.
    if cache.get("regra_versao") != storage.REGRA_BENCHMARK_VERSAO:
        return False
    if not cache["encontrado"]:
        return True
    if not valor_plausivel(metric, cache["valor"]):
        return False
    if not isinstance(cache["fonte"], str) or not cache["fonte"].strip():
        return False
    if not url_publica_valida(cache["fonte_url"]):
        return False
    return data_iso_valida(cache["capturado_em"])


def _resultado_do_cache(metric: str, cache: dict) -> BenchmarkResultado:
    if cache["encontrado"]:
        return BenchmarkResultado(
            metric=metric, encontrado=True, value=cache["valor"],
            fonte=cache["fonte"], fonte_url=cache["fonte_url"],
            capturado_em=cache["capturado_em"],
        )
    return _ausencia_confirmada(metric)


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE-FLIGHT — duas requisições concorrentes pro MESMO miss fazem UMA
# chamada ao Gemini. Chave diferente nunca serializa com outra (só o
# acesso ao dict é protegido, não o trabalho em si).
#
# ⚠️ LIMITE POR PROCESSO: o registro é um dict em memória. Com múltiplos
# workers (uvicorn/gunicorn `--workers N`) cada processo tem o seu, então o
# pior caso é N chamadas simultâneas para a mesma chave, não 1. Coordenar
# entre processos exigiria lock no SQLite ou um serviço externo — fora do
# escopo desta fase, registrado para não ser confundido com garantia global.
# ─────────────────────────────────────────────────────────────────────────────

_tarefas_em_voo: dict[tuple, "asyncio.Task[BenchmarkResultado]"] = {}
_tarefas_guard = asyncio.Lock()


async def _obter_ou_criar_tarefa(
    chave: tuple, niche: str, platform: str, objective: str, metric: str
) -> "asyncio.Task[BenchmarkResultado]":
    async with _tarefas_guard:
        tarefa = _tarefas_em_voo.get(chave)
        if tarefa is None or tarefa.done():
            tarefa = asyncio.ensure_future(_buscar_e_cachear(chave, niche, platform, objective, metric))
            _tarefas_em_voo[chave] = tarefa

            def _limpar(t: "asyncio.Task", c=chave) -> None:
                if _tarefas_em_voo.get(c) is t:
                    del _tarefas_em_voo[c]
                # Consome a exceção mesmo sem ninguém esperando: se TODOS os
                # interessados desistirem (cancelamento/timeout), o Python
                # emitiria "Task exception was never retrieved" no shutdown.
                if not t.cancelled() and t.exception() is not None:
                    pass

            tarefa.add_done_callback(_limpar)
        return tarefa


async def _buscar_e_cachear(chave: tuple, niche: str, platform: str, objective: str, metric: str) -> BenchmarkResultado:
    """
    Corpo do trabalho compartilhado por single-flight. Fica registrado em
    `_tarefas_em_voo` até TERMINAR de verdade (sucesso ou exceção) — um
    caller cujo `await` externo "desistir" não cancela isto nem libera a
    chave pra uma nova chamada paga duplicada (ver `buscar_benchmarks`).

    O limite de tempo real da chamada síncrona ao SDK vem do socket
    (`http_options.timeout` em `ai_service._get_client`, já usado por toda a
    IA) — não há `asyncio.wait_for` aqui por cima: ele só cancelaria a
    ESPERA, não a chamada bloqueante rodando no executor (achado A5 da
    auditoria de rede, mesmo raciocínio já documentado em `ai_service.py`).
    """
    try:
        resultado = await _executar_busca(niche, platform, objective, metric)
    except BenchmarkFalhaTransitoria:
        raise
    except Exception as e:
        logger.warning(
            "Benchmark: falha inesperada (%s) para %s. Detalhe: %s",
            type(e).__name__, chave, _redact_key(str(e)),
        )
        raise BenchmarkFalhaTransitoria(f"falha inesperada: {type(e).__name__}") from e

    gravado = storage.salvar_cache_benchmark(
        *chave, encontrado=resultado.encontrado, valor=resultado.value,
        fonte=resultado.fonte, fonte_url=resultado.fonte_url,
    )
    resultado.capturado_em = gravado["capturado_em"]
    return resultado


async def buscar_benchmarks(
    niche: str, platform: str, objective: str, metrics: list[str]
) -> list[BenchmarkResultado]:
    """
    Resolve uma lista de métricas para a combinação (niche, platform, objective).

    Duplicatas na lista de entrada (já deduplicada pela rota, ver
    `BenchmarkEntrada`) nunca geram duas chamadas — a segunda ocorrência
    reaproveitaria o cache ou a mesma tarefa em voo.

    Levanta `BenchmarkIndisponivel` (infra desligada) ou
    `BenchmarkFalhaTransitoria` (busca real falhou de forma não definitiva)
    — os dois viram 503 na rota, nunca um 200 "não encontrado" disfarçado.
    """
    resultados: list[BenchmarkResultado] = []
    for metric in metrics:
        if not _elegivel_para_busca_real(metric, platform):
            resultados.append(_fallback_nao_elegivel(metric, platform))
            continue

        if not storage.persistencia_ativa():
            raise BenchmarkIndisponivel(
                "Cache de benchmark indisponível (persistência desligada neste "
                "servidor) — a busca foi bloqueada para não gerar uma chamada "
                "paga ao Gemini sem cache."
            )

        chave = (niche, platform, objective, metric)
        try:
            cache = storage.buscar_cache_benchmark(*chave)
        except Exception as e:
            # Falha de SQLite (base travada, disco cheio, schema divergente)
            # NÃO pode virar "sem fonte" — é indisponibilidade técnica.
            logger.warning("Benchmark: falha lendo o cache de %s: %s", chave, e)
            raise BenchmarkIndisponivel(
                "Não foi possível ler o cache de benchmark neste servidor."
            ) from e

        if _cache_e_valido(cache, metric):
            resultados.append(_resultado_do_cache(metric, cache))
            continue

        if not is_ai_available():
            raise BenchmarkIndisponivel(
                "Camada de IA indisponível neste servidor (sem chave configurada "
                "ou desligada) — não é possível buscar um benchmark novo."
            )

        tarefa = await _obter_ou_criar_tarefa(chave, niche, platform, objective, metric)
        # `shield` (revisão Opus, 2026-09-05): sem ele, o cancelamento de UM
        # interessado (cliente desconectou, timeout do chamador) cancelava a
        # TAREFA COMPARTILHADA — e o retry seguinte abria uma segunda busca
        # paga, exatamente o oposto do que o single-flight promete. Com
        # shield, o cancelamento fica no wrapper: a tarefa real continua até
        # o fim, grava o cache e atende quem mais estiver esperando.
        resultado = await asyncio.shield(tarefa)
        resultados.append(resultado)
    return resultados


def _montar_prompt(niche: str, platform: str, objective: str, metric: str) -> str:
    niche_label = NICHE_LABELS.get(niche, niche)
    platform_label = PLATFORM_LABELS.get(platform, platform)
    objective_label = OBJECTIVE_LABELS.get(objective, objective)
    metric_label = _METRIC_LABELS.get(metric, metric)
    return (
        f"Pesquise um benchmark de mercado PUBLICADO e CITÁVEL para a métrica "
        f"{metric_label} (percentual) em campanhas de {platform_label} com "
        f"objetivo de {objective_label}, no setor \"{niche_label}\".\n\n"
        "Só aceite números de fontes nomeadas e publicadas (ex: relatórios "
        "setoriais, benchmarks oficiais de agências reconhecidas). Nunca "
        "estime, calcule uma média própria ou invente um número plausível.\n\n"
        "Responda EXATAMENTE em uma destas duas formas, sem nenhum texto "
        "antes ou depois, e sem repetir o número em nenhum outro lugar da "
        "resposta:\n"
        "VALOR: <número decimal com ponto, percentual sem o símbolo %>\n"
        "NAO_ENCONTRADO"
    )


async def _executar_busca(niche: str, platform: str, objective: str, metric: str) -> BenchmarkResultado:
    loop = asyncio.get_running_loop()
    client = _get_client()
    prompt = _montar_prompt(niche, platform, objective, metric)

    def sync_call():
        from google.genai import types

        return client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=prompt,
            # SEM response_schema/response_mime_type de propósito — grounding
            # e saída estruturada não combinam nesta versão da API.
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

    response = await loop.run_in_executor(None, sync_call)
    return _interpretar_resposta(metric, response)


@dataclass
class _FonteAssociada:
    nome: str
    url: str


def _textos_das_partes(response) -> list[str]:
    """
    Texto de cada `Part` do candidato, na ordem — a unidade que os offsets de
    `grounding_supports` referenciam (`Segment.part_index`).

    `response.text` é a CONCATENAÇÃO das partes; usá-lo como sistema de
    coordenadas quebra assim que a resposta vem em mais de uma parte. Cai de
    volta para `[response.text]` só quando o SDK não expõe as partes.
    """
    try:
        candidatos = response.candidates or []
        partes = candidatos[0].content.parts or []
        textos = [(getattr(p, "text", None) or "") for p in partes]
        if any(textos):
            return textos
    except (AttributeError, IndexError, TypeError):
        pass
    return [getattr(response, "text", None) or ""]


def _cobertura_integral(intervalos: list[tuple[int, int]], inicio: int, fim: int) -> bool:
    """
    A UNIÃO dos segmentos precisa cobrir `[inicio, fim)` inteiro — sem
    buracos. Vários supports adjacentes que juntos cobrem o número são
    aceitos; um support que toca só parte dele, não.
    """
    alcance = inicio
    for s_inicio, s_fim in sorted(intervalos):
        if s_inicio > alcance:
            return False  # buraco antes deste segmento
        alcance = max(alcance, s_fim)
        if alcance >= fim:
            return True
    return alcance >= fim


def _localizar_fonte_associada(
    response, part_index: int, inicio_b: int, fim_b: int
) -> Optional[_FonteAssociada]:
    """
    Fonte só é aceita quando os `grounding_supports` cobrem INTEGRALMENTE o
    trecho do número (`[inicio_b, fim_b)`, offsets em BYTES dentro da parte
    `part_index` — é o que o SDK documenta em `Segment`).

    Duas correções da revisão Opus (2026-09-05):
      1. antes bastava SOBREPOSIÇÃO — um support de 1 byte "atribuía" um
         número de 5 (reproduzido: `VALOR: 12.34` com support `[7, 8)`);
      2. os offsets eram tratados como caracteres do texto concatenado,
         ignorando `part_index` e a codificação UTF-8.

    Mais de uma URL distinta cobrindo o mesmo trecho é ambíguo: rejeitado,
    nunca escolhido arbitrariamente.
    """
    try:
        candidatos = response.candidates
        if not candidatos:
            return None
        metadata = candidatos[0].grounding_metadata
        if metadata is None:
            return None
        supports = metadata.grounding_supports or []
        chunks = metadata.grounding_chunks or []
        if not supports or not chunks:
            return None

        intervalos: list[tuple[int, int]] = []
        indices_associados: set[int] = set()
        for support in supports:
            segmento = getattr(support, "segment", None)
            if segmento is None:
                continue
            # `part_index` ausente = parte 0 (default do SDK para resposta
            # de parte única).
            s_parte = getattr(segmento, "part_index", None) or 0
            if s_parte != part_index:
                continue
            s_inicio = segmento.start_index if segmento.start_index is not None else 0
            s_fim = segmento.end_index if segmento.end_index is not None else s_inicio
            if not isinstance(s_inicio, int) or not isinstance(s_fim, int) or s_fim <= s_inicio:
                continue
            if s_inicio < fim_b and s_fim > inicio_b:  # toca o número
                intervalos.append((s_inicio, s_fim))
                indices_associados.update(support.grounding_chunk_indices or [])

        if not intervalos or not _cobertura_integral(intervalos, inicio_b, fim_b):
            return None  # cobertura parcial ou inexistente — não atribui

        urls_por_indice: dict[int, str] = {}
        titulos_por_indice: dict[int, str] = {}
        for idx in indices_associados:
            if not isinstance(idx, int) or idx < 0 or idx >= len(chunks):
                continue  # índice inválido — ignora, nunca estoura
            web = getattr(chunks[idx], "web", None)
            if web is None or not url_publica_valida(getattr(web, "uri", None)):
                continue
            titulo = getattr(web, "title", None) or getattr(web, "domain", None) or ""
            titulo = titulo.strip() if isinstance(titulo, str) else ""
            urls_por_indice[idx] = web.uri.strip()
            # Sem título/domínio útil, o próprio host serve de nome — nunca
            # uma string vazia na UI.
            titulos_por_indice[idx] = titulo or (urlparse(web.uri).hostname or web.uri)

        if len(set(urls_por_indice.values())) != 1:
            return None  # nenhuma URL válida associada, ou mais de uma — ambíguo

        idx = next(iter(urls_por_indice))
        return _FonteAssociada(nome=titulos_por_indice[idx], url=urls_por_indice[idx])
    except (AttributeError, IndexError, TypeError):
        return None


def _interpretar_resposta(metric: str, response) -> BenchmarkResultado:
    """Nunca retorna silenciosamente um resultado inválido — falha vira `BenchmarkFalhaTransitoria`."""
    partes = _textos_das_partes(response)
    bruto = "".join(partes)
    texto = bruto.strip()
    if not texto:
        raise BenchmarkFalhaTransitoria("resposta vazia do Gemini")

    if texto == _NAO_ENCONTRADO:
        return _ausencia_confirmada(metric)

    match = _PADRAO_VALOR.fullmatch(texto)
    if not match:
        raise BenchmarkFalhaTransitoria(f"formato de resposta inesperado: {texto[:120]!r}")

    valor = float(match.group(1))
    if not valor_plausivel(metric, valor):
        raise BenchmarkFalhaTransitoria(f"valor fora da faixa plausível para {metric}: {valor!r}")

    # Do span em caracteres de `texto` (já sem whitespace nas pontas) para
    # (parte, offset em BYTES dentro dela) — o sistema de coordenadas real de
    # `grounding_supports`.
    deslocamento = len(bruto) - len(bruto.lstrip())
    localizacao = _span_em_bytes_da_parte(partes, deslocamento + match.start(1), deslocamento + match.end(1))
    if localizacao is None:
        raise BenchmarkFalhaTransitoria("valor atravessa mais de uma parte da resposta — atribuição ambígua")

    part_index, inicio_b, fim_b = localizacao
    fonte = _localizar_fonte_associada(response, part_index, inicio_b, fim_b)
    if fonte is None:
        raise BenchmarkFalhaTransitoria(
            "nenhuma fonte de grounding cobre integralmente o trecho do valor"
        )

    return BenchmarkResultado(
        metric=metric, encontrado=True, value=valor, fonte=fonte.nome, fonte_url=fonte.url,
    )


def _span_em_bytes_da_parte(
    partes: list[str], char_inicio: int, char_fim: int
) -> Optional[tuple[int, int, int]]:
    """
    `(part_index, inicio_bytes, fim_bytes)` do trecho `[char_inicio, char_fim)`
    do texto concatenado. `None` quando o trecho atravessa duas partes — aí
    não existe um único segmento do SDK que possa cobri-lo, e atribuir a
    fonte seria adivinhação.
    """
    deslocamento = 0
    for indice, parte in enumerate(partes):
        fim_parte = deslocamento + len(parte)
        if deslocamento <= char_inicio < fim_parte:
            if char_fim > fim_parte:
                return None  # começa aqui e termina em outra parte
            local_inicio = char_inicio - deslocamento
            local_fim = char_fim - deslocamento
            return (
                indice,
                len(parte[:local_inicio].encode("utf-8")),
                len(parte[:local_fim].encode("utf-8")),
            )
        deslocamento = fim_parte
    return None
