"""
Contrato de GRAVAÇÃO de campanha — `POST /api/v1/campaigns` (P5).

PROBLEMA QUE ESTE MÓDULO RESOLVE
--------------------------------
`payload` era inteiramente opaco: qualquer objeto JSON era gravado. Dava para
criar uma "campanha" por requisição direta, sem análise nenhuma, carregando
números contraditórios — reproduzido pelo Codex em 2026-09-08 e de novo em
2026-09-09 contra a primeira correção, que só exigia `name`/`status`/`score` e
por isso continuava aceitando um corpo montado à mão com esses três campos.

O QUE ESTE CONTRATO VERIFICA
----------------------------
1. **Forma fechada.** O objeto gravado é o `CampaignVM` que o dashboard monta
   em `lib/adapt.ts` (definição em `frontend/nexgestor-dashboard/src/types.ts`).
   Só as chaves desse formato entram; qualquer outra é rejeitada com o nome.
   É isso que impede embrulhar um bloco de métricas contraditórias dentro de
   uma campanha de aparência válida — não existe "campo extra ignorado".
2. **Tipo e faixa de cada campo**, inclusive os que a UI trata como sempre
   presentes, e a forma dos itens de cada bloco-lista. Tipo é conferido ANTES
   de qualquer comparação de valor, e nenhuma conferência converte o valor: um
   `status` que chega como lista devolve 422, não 500 (`status not in {...}`
   estourava com valor não hashable), e o mesmo vale para um inteiro grande
   demais (`math.isfinite` sobre ele estourava — ver `_e_numero`).
3. **Consistência interna do que é derivado** (a mesma ideia de P5 aplicada ao
   formato persistido): `revenue` é `spend × ROAS` arredondado, calculado no
   próprio adapter (`lib/adapt.ts`, e o tile mostra "spend × ROAS" ao usuário).
   Declarar receita sem investimento ou sem ROAS que a produza, ou uma receita
   que não bate com esse produto, é contradição demonstrável — do mesmo tipo
   que "100 impressões, 50 cliques e CTR 0,4%".

O QUE ESTE CONTRATO **NÃO** VERIFICA — LIMITES EXATOS
-----------------------------------------------------
* **Procedência.** Um cliente que monte um `CampaignVM` internamente coerente
  grava. Nenhuma checagem nesta fronteira distingue isso de uma análise real,
  e autenticação também não distinguiria (autenticar quem envia não diz de
  onde vieram os números). O requisito de P5 é impedir dado *demonstravelmente*
  inválido ou contraditório, e é isso que está implementado.
* **Regras R1/R2 de `metric_consistency`.** Elas comparam bruto↔taxa, e o
  formato persistido não carrega brutos: `CampaignVM` só guarda valores já
  derivados (`ctrNum`, `cpaNum`, `roasNum`, `freqNum`) sem os pares que os
  definem. Não há o que comparar aqui além de `revenue`. Passar a exigir as
  métricas brutas no payload é possível, mas quebraria a sincronização das
  campanhas que já existem só no navegador — decisão registrada na matriz.
* **O CONTEÚDO de texto livre** dos blocos (`tiles`, `scenarios`, `actions`,
  `sugg`, `aiInsights`, `aiRisks`, `benchmarks`, `m1`, `m2`): título, causa
  raiz e recomendação são conferidos como texto, nunca quanto ao que dizem.
  A FORMA deles, sim, é conferida — item a item, com os tipos e faixas que a
  interface consome. Conferir só "é uma lista" deixava passar `tiles: [null]`,
  que era gravado, devolvido pelo GET e derrubava a tela da campanha.
* **`score` × `status`.** Existe relação no engine (`_resolve_final_status`:
  score < 40 força RED), mas ela mudou de versão ao longo do projeto e uma
  campanha analisada antes da escalada por evidência métrica pode ser GREEN
  com score baixo. Bloquear isso rejeitaria dado legítimo já existente, então
  fica como lacuna delimitada, não implementada. Ver a matriz revisada.

COMPATIBILIDADE
---------------
Vale só para ESCRITA nova. `GET /campaigns` continua devolvendo qualquer linha
já gravada sem passar por aqui — nada é migrado, reescrito ou apagado. A volta
atrás é remover a chamada em `salvar_campanha`; a lista de chaves conhecidas é
o único ponto a mexer quando o `CampaignVM` ganhar um campo novo.
"""
import math
import sys

# Maior número que o formato consegue carregar: `CampaignVM` é TypeScript, e
# todo campo numérico dele vive como `number` (IEEE-754 double) no navegador.
# Um JSON com um inteiro maior que isso não é um valor grande — é um valor que
# este formato não representa; ele voltaria ao cliente como `Infinity`.
# Não é limite novo inventado: é o domínio numérico do contrato.
_MAIOR_NUMERO_DO_FORMATO = sys.float_info.max

# Identificador é caso à parte: ele precisa sobreviver ao round-trip mantendo a
# IDENTIDADE. Acima de 2^53−1 dois inteiros diferentes viram o mesmo `number`
# no navegador, e é aí que `reancorar`/`isLiveId` (lib/store.ts) passam a
# confundir uma campanha com outra. Também não é limite inventado: é o maior
# inteiro exato do formato em que o id vive.
_MAIOR_ID_DO_FORMATO = 2 ** 53 - 1

# Chaves de `CampaignVM` (frontend/nexgestor-dashboard/src/types.ts). Lista
# fechada de propósito: chave fora daqui é rejeitada, não ignorada. Manter em
# sincronia com a interface — campo novo no VM sem entrada aqui vira 422 na
# gravação, e o teste `test_toda_chave_do_campaign_vm_e_conhecida` cobre isso.
_CHAVES_CONHECIDAS = {
    "id", "name", "platform", "status", "score", "invest", "revenue",
    "roasNum", "cpaNum", "ctrNum", "freqNum", "maxFrequencyFatigue",
    "m1", "m2", "spark", "trend", "ai", "summary", "opportunity",
    "primaryAction", "tiles", "scenarios", "actions", "sugg",
    "coverage", "confidence", "hasAI", "aiInsights", "aiRisks",
    "serverId", "clientId", "syncFalhouPermanente", "syncAviso", "benchmarks",
}

# Campos sem `?` em CampaignVM. Ausência de uma métrica é representada por
# null nos quatro campos numéricos; blocos vazios são listas, não omissões.
# Os consumidores percorrem tiles/scenarios/actions/sugg e leem m1/m2/spark
# diretamente. Só conferir tipos quando a chave existe deixava esse contorno.
_CHAVES_OBRIGATORIAS = {
    "id", "name", "platform", "status", "score", "invest", "revenue",
    "roasNum", "cpaNum", "ctrNum", "freqNum", "m1", "m2", "spark", "trend",
    "ai", "summary", "opportunity", "primaryAction", "tiles", "scenarios",
    "actions", "sugg",
}

# `UIStatus` em types.ts, produzido por `resolveUIStatus` no adapter. Fechado
# nos MESMOS quatro valores do tipo — não no enum do backend, que tem `PAUSED`
# como reservado para uso futuro (`app/enum/campaign.py`): o adapter nunca
# emite `PAUSED` (converte em `YELLOW`), e `STATUS`/`STATUS_ICON`
# (dashboard `lib/status.ts`) são `Record<UIStatus, …>` sem entrada para ele —
# um VM gravado com `PAUSED` lido de volta pelo GET derruba `CampaignCard` e
# `CampaignDetail` (achado 1 da revisão Claude, 2026-09-10, mesma classe do
# achado 1 do Codex sobre `tiles:[null]`: valor que a escrita aceitava e a
# tela não renderiza). Ver `test_status_de_campanha_e_exatamente_o_ui_status`.
_STATUS_DE_CAMPANHA = {"GREEN", "YELLOW", "RED", "BLUE"}
_CONFIANCA_DO_SCORE = {"low", "medium", "high"}

# `revenue = Math.round(invest * roasNum)` em lib/adapt.ts. Arredondar para
# inteiro admite meia unidade de diferença; o resto é folga para o ruído de
# ponto flutuante da multiplicação feita no navegador.
_FOLGA_RECEITA = 0.5 + 1e-6


def _e_numero(valor) -> bool:
    """
    Número real, finito e representável neste formato.

    `True`/`False` são `int` em Python — não contam.

    O `int` é conferido por comparação, nunca por conversão: `math.isfinite`
    sobre um inteiro arbitrário do JSON converte para float e estoura
    (`OverflowError`), e era assim que `score = 10**400` — um corpo de poucas
    centenas de bytes, sem carga grande nenhuma — virava HTTP 500. A
    comparação int↔float do CPython é exata e não converte, então ela responde
    a mesma pergunta sem risco.
    """
    if isinstance(valor, bool):
        return False
    if isinstance(valor, int):
        return -_MAIOR_NUMERO_DO_FORMATO <= valor <= _MAIOR_NUMERO_DO_FORMATO
    return isinstance(valor, float) and math.isfinite(valor)


def _e_inteiro(valor) -> bool:
    return isinstance(valor, int) and not isinstance(valor, bool)


def _e_identificador(valor) -> bool:
    """Inteiro positivo que o cliente consegue guardar sem perder identidade."""
    return _e_inteiro(valor) and 0 < valor <= _MAIOR_ID_DO_FORMATO


def _e_texto_preenchido(valor) -> bool:
    return isinstance(valor, str) and bool(valor.strip())


def _numero_opcional(payload: dict, chave: str, erros: list[str], *, permite_nulo: bool,
                     minimo: float | None = 0.0, maximo: float | None = None) -> None:
    """Confere um campo numérico só quando ele veio. Ausência não é erro."""
    if chave not in payload:
        return
    valor = payload[chave]
    if permite_nulo and valor is None:
        return
    if not _e_numero(valor):
        nulo = " (ou nulo)" if permite_nulo else ""
        erros.append(f"'{chave}' precisa ser um número{nulo}.")
        return
    if minimo is not None and valor < minimo:
        erros.append(f"'{chave}' não pode ser menor que {minimo:g}.")
    if maximo is not None and valor > maximo:
        erros.append(f"'{chave}' não pode ser maior que {maximo:g}.")


def _texto_opcional(payload: dict, chave: str, erros: list[str], *, max_len: int | None = None) -> None:
    if chave not in payload:
        return
    valor = payload[chave]
    if not isinstance(valor, str):
        erros.append(f"'{chave}' precisa ser um texto.")
    elif max_len is not None and len(valor) > max_len:
        erros.append(f"'{chave}' passa de {max_len} caracteres.")


# ── forma dos blocos que a UI percorre ───────────────────────────────────
#
# Conferir só "é uma lista" não fechava a fronteira: `tiles: [null]` era
# gravado e devolvido, e `MetricFeed.tsx` (`c.tiles.map(canonico)` →
# `canonico` lê `t[0]`) derruba a tela da campanha com esse item. O critério
# aqui é o que a interface CONSOME — forma, tipo e faixa dos elementos, e os
# campos lidos sem fallback. O CONTEÚDO de texto livre (título, causa raiz,
# recomendação) não é conferido: veracidade de recomendação e procedência da
# análise não são verificáveis nesta fronteira, e nunca foram o requisito.

_ORIGENS_DE_TILE = {"gestor", "sistema", "ausente"}          # TileOrigin, types.ts
_ROTULOS_DE_PRIORIDADE = {"Alta", "Média", "Baixa"}          # Priority, types.ts
_PRIORIDADES_DO_ENGINE = (1, 2, 3)                           # ScenarioDetail.priority


def _e_texto(valor) -> bool:
    return isinstance(valor, str)


def _e_rotulo_de_prioridade(valor) -> bool:
    # `isinstance` antes do `in`: valor não hashable num teste de pertinência
    # é `TypeError`, ou seja, HTTP 500.
    return isinstance(valor, str) and valor in _ROTULOS_DE_PRIORIDADE


def _e_prioridade_do_engine(valor) -> bool:
    # `DetailSections.tsx` faz `PRIO[sc.priority]` e usa o resultado sem
    # checar: fora de 1–3 é TypeError na renderização, não um estilo faltando.
    return _e_inteiro(valor) and valor in _PRIORIDADES_DO_ENGINE


def _e_nota_de_metrica(valor) -> bool:
    # `MetricEvaluation.score` (app/schema/schema.py): 0–100.
    return _e_numero(valor) and 0 <= valor <= 100


# bloco → {campo: (predicado, descrição para a mensagem)}
_FORMA_DOS_ITENS: dict[str, dict[str, tuple]] = {
    "scenarios": {
        "code": (_e_texto, "um texto"),
        "title": (_e_texto, "um texto"),
        "root_cause": (_e_texto, "um texto"),
        "funnel_impact": (_e_texto, "um texto"),
        "action": (_e_texto, "um texto"),
        "priority": (_e_prioridade_do_engine, "1, 2 ou 3"),
    },
    "actions": {
        "title": (_e_texto, "um texto"),
        "prio": (_e_rotulo_de_prioridade, f"um destes textos: {sorted(_ROTULOS_DE_PRIORIDADE)}"),
        "why": (_e_texto, "um texto"),
        "impact": (_e_texto, "um texto"),
    },
    "sugg": {
        "name": (_e_texto, "um texto"),
        "impact": (_e_texto, "um texto"),
        "effort": (_e_texto, "um texto"),
        "urgency": (_e_rotulo_de_prioridade, f"um destes textos: {sorted(_ROTULOS_DE_PRIORIDADE)}"),
    },
    "aiInsights": {
        "title": (_e_texto, "um texto"),
        "explanation": (_e_texto, "um texto"),
    },
    "aiRisks": {
        "title": (_e_texto, "um texto"),
        "explanation": (_e_texto, "um texto"),
        "timeframe": (_e_texto, "um texto"),
    },
    # `benchmarks` é o único bloco que a UI já revalida antes de desenhar
    # (`referenciaDeMercadoValida`, lib/api.ts, que descarta a referência
    # inválida em vez de quebrar). Aqui vai só a forma; a faixa e a URL
    # continuam onde já estavam, para não existirem duas regras divergentes.
    "benchmarks": {
        "metric": (_e_texto, "um texto"),
        "value": (_e_numero, "um número"),
        "fonte": (_e_texto, "um texto"),
        "fonte_url": (_e_texto, "um texto"),
        "capturado_em": (_e_texto, "um texto"),
    },
}


def _lista_de_objetos(payload: dict, chave: str, erros: list[str]) -> None:
    """Confere um bloco cujos itens são objetos de forma conhecida."""
    if chave not in payload:
        return
    bloco = payload[chave]
    if not isinstance(bloco, list):
        erros.append(f"'{chave}' precisa ser uma lista.")
        return

    forma = _FORMA_DOS_ITENS[chave]
    for i, item in enumerate(bloco):
        onde = f"'{chave}[{i}]'"
        if not isinstance(item, dict):
            erros.append(f"{onde} precisa ser um objeto com {sorted(forma)}.")
            continue
        faltando = sorted(set(forma) - set(item))
        if faltando:
            erros.append(f"{onde} está sem: {', '.join(faltando)}.")
        sobrando = sorted(set(item) - set(forma))
        if sobrando:
            erros.append(f"{onde} tem campos que não existem nesse bloco: {', '.join(sobrando)}.")
        for campo, (aceita, descricao) in forma.items():
            if campo in item and not aceita(item[campo]):
                erros.append(f"{onde}.{campo} precisa ser {descricao}.")


def _tiles(payload: dict, erros: list[str]) -> None:
    """
    `Tile` é uma TUPLA, não um objeto (types.ts):
    `[rótulo, valor, cor, nota, origem?, score?]`.

    As quatro primeiras posições são lidas direto (`t[0]` no agrupamento e na
    canonização de rótulo antigo, `t[1]`/`t[2]` no desenho). A 6ª vira ALTURA
    de barra no painel do funil: um não-número ali sai como `height: NaN%`,
    não como estilo faltando. Por isso este bloco não é "só texto".
    """
    if "tiles" not in payload:
        return
    bloco = payload["tiles"]
    if not isinstance(bloco, list):
        erros.append("'tiles' precisa ser uma lista.")
        return

    for i, t in enumerate(bloco):
        onde = f"'tiles[{i}]'"
        if not isinstance(t, list) or not 4 <= len(t) <= 6:
            erros.append(
                f"{onde} precisa ser uma lista de 4 a 6 posições "
                "[rótulo, valor, cor, nota, origem?, score?]."
            )
            continue
        for posicao, nome in enumerate(("rótulo", "valor", "cor", "nota")):
            if not _e_texto(t[posicao]):
                erros.append(f"{onde}[{posicao}] ({nome}) precisa ser um texto.")
        if len(t) >= 5 and not (isinstance(t[4], str) and t[4] in _ORIGENS_DE_TILE):
            erros.append(f"{onde}[4] (origem) precisa ser um destes textos: {sorted(_ORIGENS_DE_TILE)}.")
        if len(t) >= 6 and not _e_nota_de_metrica(t[5]):
            erros.append(f"{onde}[5] (score) precisa ser um número entre 0 e 100.")


def _destaque_opcional(payload: dict, chave: str, erros: list[str]) -> None:
    """`m1`/`m2` são `{ k: string, v: string }` no CampaignVM."""
    if chave not in payload:
        return
    valor = payload[chave]
    if (
        not isinstance(valor, dict)
        or set(valor) != {"k", "v"}
        or not all(isinstance(v, str) for v in valor.values())
    ):
        erros.append(f"'{chave}' precisa ser um objeto com os textos 'k' e 'v'.")


def _conferir_receita(payload: dict, erros: list[str]) -> None:
    """
    `revenue` × (`invest`, `roasNum`) — a única derivação que o formato guarda.

    Duas metades, e a segunda é o que fecha o contorno por omissão: sem ela
    bastaria não mandar `roasNum` para declarar qualquer receita.
    """
    receita = payload.get("revenue")
    investimento = payload.get("invest")
    roas = payload.get("roasNum")
    # Tipos já foram acusados acima; aqui só compara o que é comparável.
    if not _e_numero(receita) or not _e_numero(investimento):
        return
    if roas is not None and not _e_numero(roas):
        return

    if receita > 0 and (investimento <= 0 or roas is None or roas <= 0):
        erros.append(
            "'revenue' maior que zero exige 'invest' e 'roasNum' que o produzam — "
            "receita é 'invest × roasNum' (lib/adapt.ts), não um número independente."
        )
        return

    if investimento > 0 and roas is not None:
        esperada = investimento * roas
        if abs(receita - esperada) > _FOLGA_RECEITA:
            erros.append(
                f"'revenue' ({receita:g}) não corresponde a 'invest' × 'roasNum' "
                f"({investimento:g} × {roas:g} = {esperada:g})."
            )


def validar_payload_de_campanha(payload: dict) -> list[str]:
    """
    Devolve a lista de problemas do payload. Vazia = pode gravar.

    Todos os problemas saem juntos, não só o primeiro: quem está corrigindo uma
    integração precisa ver o conjunto.
    """
    erros: list[str] = []

    faltando = sorted(_CHAVES_OBRIGATORIAS - set(payload))
    if faltando:
        erros.append("campos obrigatórios ausentes: " + ", ".join(faltando))

    desconhecidas = sorted(set(payload) - _CHAVES_CONHECIDAS)
    if desconhecidas:
        erros.append(
            "campos que não existem numa campanha salva: "
            + ", ".join(f"'{c}'" for c in desconhecidas)
            + " (o formato é o CampaignVM do dashboard, e é fechado)"
        )

    # ── obrigatórios: o que toda análise produz ───────────────────────────
    if not _e_identificador(payload.get("id")):
        erros.append("'id' é obrigatório e precisa ser um inteiro positivo.")
    if not _e_texto_preenchido(payload.get("name")):
        erros.append("'name' é obrigatório e precisa ser um texto não vazio.")
    if not _e_texto_preenchido(payload.get("platform")):
        erros.append("'platform' é obrigatório e precisa ser um texto não vazio.")

    status = payload.get("status")
    if not isinstance(status, str) or status not in _STATUS_DE_CAMPANHA:
        erros.append(
            "'status' é obrigatório e precisa ser um destes textos: "
            f"{sorted(_STATUS_DE_CAMPANHA)}."
        )

    score = payload.get("score")
    if not _e_numero(score) or not 0 <= score <= 100:
        erros.append("'score' é obrigatório e precisa ser um número entre 0 e 100.")

    for chave in ("invest", "revenue"):
        valor = payload.get(chave)
        if not _e_numero(valor) or valor < 0:
            erros.append(f"'{chave}' é obrigatório e precisa ser um número maior ou igual a zero.")

    # ── opcionais, conferidos quando vêm ──────────────────────────────────
    for chave in ("roasNum", "cpaNum", "ctrNum", "freqNum"):
        _numero_opcional(payload, chave, erros, permite_nulo=True)
    _numero_opcional(payload, "maxFrequencyFatigue", erros, permite_nulo=False)
    _numero_opcional(payload, "coverage", erros, permite_nulo=False, maximo=100)
    _numero_opcional(payload, "trend", erros, permite_nulo=False, minimo=None)

    if "serverId" in payload and not _e_identificador(payload["serverId"]):
        erros.append("'serverId' precisa ser um inteiro positivo.")
    if "hasAI" in payload and not isinstance(payload["hasAI"], bool):
        erros.append("'hasAI' precisa ser verdadeiro ou falso.")
    if "confidence" in payload:
        # `isinstance` antes do `in`: um valor não hashable (lista, objeto)
        # estoura `TypeError` num teste de pertinência e vira HTTP 500 — foi
        # exatamente assim que a primeira correção quebrou com `status`.
        confianca = payload["confidence"]
        if not isinstance(confianca, str) or confianca not in _CONFIANCA_DO_SCORE:
            erros.append(f"'confidence' precisa ser um destes textos: {sorted(_CONFIANCA_DO_SCORE)}.")

    if "spark" in payload:
        spark = payload["spark"]
        if not isinstance(spark, list) or not all(_e_numero(v) for v in spark):
            erros.append("'spark' precisa ser uma lista de números.")

    for chave in ("ai", "summary", "opportunity", "primaryAction",
                  "syncFalhouPermanente", "syncAviso"):
        _texto_opcional(payload, chave, erros)
    _texto_opcional(payload, "clientId", erros, max_len=100)

    _tiles(payload, erros)
    for chave in ("scenarios", "actions", "sugg", "aiInsights", "aiRisks", "benchmarks"):
        _lista_de_objetos(payload, chave, erros)
    for chave in ("m1", "m2"):
        _destaque_opcional(payload, chave, erros)

    # ── consistência interna ──────────────────────────────────────────────
    _conferir_receita(payload, erros)

    return erros
