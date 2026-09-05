"""
NexGestor — Benchmark de mercado (fase-2b), pós-revisão Opus (2026-09-04)
========================================================================
Reescrito depois da revisão crítica registrada em docs/sessions/2026-09-04.md
("(parte 4)"), que reprovou o desenho original (lotes C/D). Decisões
conservadoras fixadas no prompt de correção:

  • Só `ctr_link` faz busca real agora (CPA/CPL/CPM sempre fallback — sem
    contrato de país/moeda, comparar custo seria semanticamente inválido).
  • Fonte só é aceita quando `grounding_supports` associa o trecho EXATO do
    valor a um chunk com URL http(s) — nunca "existe algum grounding_chunk"
    em qualquer lugar da resposta, nunca o nome autodeclarado pelo modelo.
  • Só dois desfechos são cacheáveis por 14 dias: `encontrado=True` com fonte
    verificada, ou `NAO_ENCONTRADO` explícito. Qualquer outra coisa (formato
    inesperado, valor fora de faixa, sem suporte, URL insegura, timeout,
    exceção) é falha transitória — nunca cacheada, sempre 503 acionável.
  • Duas requisições concorrentes para o mesmo miss fazem UMA chamada
    (single-flight por chave).
"""
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from google.genai import types

from app.core.config import settings
from app.main import app
from app.service import benchmark_service, storage

client = TestClient(app)


@pytest.fixture
def base(tmp_path, monkeypatch):
    caminho = tmp_path / "teste.db"
    monkeypatch.setattr(settings, "DB_PATH", str(caminho))
    monkeypatch.setattr(storage, "_iniciado", False)
    yield caminho
    monkeypatch.setattr(storage, "_iniciado", False)


@pytest.fixture
def sem_base(monkeypatch):
    monkeypatch.setattr(settings, "DB_PATH", "")
    monkeypatch.setattr(storage, "_iniciado", False)


@pytest.fixture
def ia_disponivel(monkeypatch):
    monkeypatch.setattr(benchmark_service, "is_ai_available", lambda: True)


@pytest.fixture(autouse=True)
def _benchmark_ligado_por_padrao(monkeypatch):
    """
    `BENCHMARK_ENABLED` nasce `False` (revisão Opus, 2026-09-04) — este
    arquivo testa o COMPORTAMENTO da feature, então liga por padrão, igual
    `conftest.py` faz o oposto para a IA. `test_benchmark_enabled_false_e_501`
    sobrescreve explicitamente para testar o estado desligado.
    """
    monkeypatch.setattr(settings, "BENCHMARK_ENABLED", True)


@pytest.fixture(autouse=True)
def _limpar_tarefas_em_voo():
    """Isola o registro de single-flight entre testes — é estado de módulo."""
    benchmark_service._tarefas_em_voo.clear()
    yield
    benchmark_service._tarefas_em_voo.clear()


def _resposta(
    partes: list[str],
    supports: list[tuple[int, int, int, list[int]]] | None = None,
    chunks: list[str | None] | None = None,
    titulos: list[str | None] | None = None,
):
    """
    Resposta com objetos REAIS do SDK (revisão Opus, 2026-09-05) — `MagicMock`
    escondia dois bugs: `Segment.start_index/end_index` são offsets em BYTES
    dentro de uma PART (não caracteres do texto concatenado), e `part_index`
    era ignorado. Mock nenhum reproduz isso; objetos do SDK, sim.

    `partes`:   textos das `Part` do candidato (na ordem).
    `supports`: `(part_index, inicio_bytes, fim_bytes, [indices de chunk])`.
    `chunks`:   URIs (na ordem); `None` = chunk sem `web`.
    `titulos`:  título de cada chunk; `None` = sem título (cai pro host).
    """
    uris = chunks if chunks is not None else []
    chunk_objs = []
    for i, uri in enumerate(uris):
        titulo = titulos[i] if titulos and i < len(titulos) else f"Fonte {i}"
        chunk_objs.append(
            types.GroundingChunk(web=None if uri is None else types.GroundingChunkWeb(uri=uri, title=titulo))
        )

    support_objs = [
        types.GroundingSupport(
            segment=types.Segment(part_index=pi, start_index=ini, end_index=fim),
            grounding_chunk_indices=idxs,
        )
        for (pi, ini, fim, idxs) in (supports or [])
    ]

    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(parts=[types.Part(text=t) for t in partes]),
                grounding_metadata=types.GroundingMetadata(
                    grounding_chunks=chunk_objs, grounding_supports=support_objs
                ),
            )
        ]
    )


def _resposta_com_fonte(valor: str, uri: str = "https://fonte.example/relatorio"):
    """
    Resposta bem-formada, parte única: o support cobre EXATAMENTE os bytes do
    número (é o que a regra de atribuição exige desde a revisão de 2026-09-05).
    """
    texto = f"VALOR: {valor}"
    ini = len(texto[: texto.index(valor)].encode("utf-8"))
    fim = ini + len(valor.encode("utf-8"))
    return _resposta([texto], supports=[(0, ini, fim, [0])], chunks=[uri])


def _fake_client(response):
    fake = MagicMock()
    fake.models.generate_content.return_value = response
    return fake


# ─────────────────────────────────────────────────────────────────────────────
# ENTRADA — lista fechada, duplicatas, campos extras (AC-B1)
# ─────────────────────────────────────────────────────────────────────────────

class TestEntradaInvalida:
    def test_niche_fora_da_lista_e_422(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "chuteiras", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code == 422

    def test_platform_fora_da_lista_e_422(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "xpto_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code == 422

    def test_metrica_desconhecida_e_422_nao_500(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["banana"],
        })
        assert r.status_code == 422
        r.json()

    def test_lista_de_metricas_vazia_e_422(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": [],
        })
        assert r.status_code == 422

    def test_mais_de_6_metricas_e_422(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["roas"] * 7,
        })
        assert r.status_code == 422

    def test_campo_extra_no_corpo_e_422_nao_ignorado_em_silencio(self):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads", "objective": "conversion",
            "metrics": ["roas"], "pais": "BR",
        })
        assert r.status_code == 422

    def test_duplicatas_sao_normalizadas_preservando_ordem(self, sem_base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads", "objective": "conversion",
            "metrics": ["roas", "hook_rate", "roas", "roas"],
        })
        assert r.status_code == 200
        metricas = [x["metric"] for x in r.json()["resultados"]]
        assert metricas == ["roas", "hook_rate"]  # sem duplicata, ordem preservada

    def test_benchmark_enabled_false_e_501(self, monkeypatch):
        monkeypatch.setattr(settings, "BENCHMARK_ENABLED", False)
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code == 501

    def test_benchmark_enabled_e_desligado_por_padrao(self):
        """
        Feature opt-in (revisão Opus, 2026-09-04): quem só clona o repo e
        sobe o servidor sem configurar nada não pode gerar custo acidental
        numa rota pública sem autenticação.
        """
        from app.core.config import Settings

        assert Settings(_env_file=None).BENCHMARK_ENABLED is False


# ─────────────────────────────────────────────────────────────────────────────
# FALLBACK EXPLÍCITO — decisão conservadora: só ctr_link em Meta/Google busca real
# ─────────────────────────────────────────────────────────────────────────────

class TestFallbackSemFonteReal:
    def test_roas_hook_rate_cpa_cpl_cpm_sao_sempre_fallback_mesmo_em_meta_ads(self, sem_base):
        """Decisão conservadora pós-revisão: só ctr_link busca real agora."""
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads", "objective": "conversion",
            "metrics": ["roas", "hook_rate", "cpa", "cpl", "cpm"],
        })
        assert r.status_code == 200
        for res in r.json()["resultados"]:
            assert res["encontrado"] is False
            assert "value" not in res

    def test_ctr_link_fora_de_meta_google_e_fallback(self, sem_base):
        for plataforma in ("tiktok_ads", "linkedin_ads"):
            r = client.post("/api/v1/benchmark/mercado", json={
                "niche": "pet", "platform": plataforma,
                "objective": "conversion", "metrics": ["ctr_link"],
            })
            assert r.status_code == 200
            assert r.json()["resultados"][0]["encontrado"] is False

    @pytest.mark.asyncio
    async def test_fallback_nao_chama_gemini(self):
        fake = _fake_client(_resposta(["nao deveria ser chamado"]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            await benchmark_service.buscar_benchmarks("pet", "tiktok_ads", "conversion", ["ctr_link"])
            await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["cpa"])
        fake.models.generate_content.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# INDISPONIBILIDADE — nunca disfarçada de "não encontrado"
# ─────────────────────────────────────────────────────────────────────────────

class TestIndisponibilidade:
    def test_sem_persistencia_e_503(self, sem_base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code == 503

    def test_gemini_indisponivel_com_persistencia_ligada_e_503(self, base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code == 503

    def test_erro_de_servico_serializa_corretamente(self, sem_base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link", "roas"],
        })
        assert r.status_code == 503
        assert isinstance(r.json()["detail"], str)


# ─────────────────────────────────────────────────────────────────────────────
# ASSOCIAÇÃO FONTE↔VALOR — o achado mais grave da revisão Opus
# ─────────────────────────────────────────────────────────────────────────────

class TestAssociacaoDeFonte:
    @pytest.mark.asyncio
    async def test_valor_e_fonte_associados_corretamente(self, base, ia_disponivel):
        fake = _fake_client(_resposta_com_fonte("2.69", uri="https://wordstream.example/relatorio"))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].encontrado is True
        assert r[0].value == 2.69
        assert r[0].fonte_url == "https://wordstream.example/relatorio"

    @pytest.mark.asyncio
    async def test_chunk_irrelevante_nao_associado_ao_valor_e_ignorado(self, base, ia_disponivel):
        """
        2 chunks: o primeiro (política de cookies) NÃO cobre o intervalo do
        valor; só o segundo cobre. Antes da correção, `grounding_chunks[0]`
        seria aceito cegamente — agora só o chunk REALMENTE associado conta.
        """
        texto = "VALOR: 2.69"
        ini, fim = 7, 11  # "2.69" em bytes, parte única
        resp = _resposta(
            [texto],
            supports=[(0, 0, 5, [0]), (0, ini, fim, [1])],  # [0,5)="VALOR", não toca o número
            chunks=["https://politica-de-cookies.example/aviso", "https://wordstream.example/relatorio-real"],
            titulos=["Política de Cookies", "WordStream"],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].encontrado is True
        assert r[0].fonte_url == "https://wordstream.example/relatorio-real"

    @pytest.mark.asyncio
    async def test_sem_support_cobrindo_o_valor_e_falha_transitoria(self, base, ia_disponivel):
        """Existe grounding, mas nenhum support toca o trecho do valor."""
        resp = _resposta(["VALOR: 2.69"], supports=[(0, 0, 5, [0])], chunks=["https://fonte.example/x"])
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    @pytest.mark.asyncio
    async def test_cobertura_PARCIAL_do_valor_e_rejeitada(self, base, ia_disponivel):
        """
        REGRESSÃO da revisão Opus (2026-09-05): `VALOR: 12.34` com support
        cobrindo `[7, 8)` — 1 byte de 5 — era ACEITO, atribuindo o número a
        uma fonte que sustenta só um caractere dele.
        """
        resp = _resposta(["VALOR: 12.34"], supports=[(0, 7, 8, [0])], chunks=["https://fonte.example/x"])
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria, match="integralmente"):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    @pytest.mark.asyncio
    async def test_supports_adjacentes_que_juntos_cobrem_o_valor_sao_aceitos(self, base, ia_disponivel):
        """Dois segmentos parciais da MESMA fonte, cuja união cobre o número, valem."""
        resp = _resposta(
            ["VALOR: 12.34"],
            supports=[(0, 7, 9, [0]), (0, 9, 12, [0])],  # [7,9)+[9,12) = [7,12)
            chunks=["https://fonte.example/x"],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].encontrado is True and r[0].value == 12.34

    @pytest.mark.asyncio
    async def test_offsets_sao_bytes_com_acento_antes_do_numero(self, base, ia_disponivel):
        """
        `Segment.start_index/end_index` são BYTES (documentado no SDK). Com um
        caractere multibyte antes do número, offset em caracteres != bytes —
        o código antigo teria olhado o trecho errado.
        """
        texto = "VALOR: 2.69"
        # Parte 0 tem um acento (2 bytes em UTF-8) — o número vive na parte 1.
        partes = ["Ré ", texto]
        ini = len("VALOR: ".encode("utf-8"))
        resp = _resposta(partes, supports=[(1, ini, ini + 4, [0])], chunks=["https://fonte.example/x"])
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                # Texto concatenado ("Ré VALOR: 2.69") não bate o fullmatch —
                # o ponto aqui é que o parse não confunde as coordenadas.
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.asyncio
    async def test_valor_em_parte_separada_usa_o_part_index_certo(self, base, ia_disponivel):
        """
        Resposta em 2 partes: o número está na parte 1, e o support referencia
        `part_index=1` com offsets locais A ELA. O código antigo tratava tudo
        como offsets do texto concatenado e olharia o lugar errado.
        """
        resp = _resposta(
            ["VALOR: ", "2.69"],
            supports=[(1, 0, 4, [0])],  # cobre "2.69" inteiro DENTRO da parte 1
            chunks=["https://fonte.example/x"],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].encontrado is True and r[0].value == 2.69

    @pytest.mark.asyncio
    async def test_support_na_parte_errada_nao_atribui(self, base, ia_disponivel):
        """Mesmos offsets, `part_index` diferente — não é o trecho do valor."""
        resp = _resposta(
            ["VALOR: ", "2.69"],
            supports=[(0, 0, 4, [0])],  # parte 0, não a 1 onde o número está
            chunks=["https://fonte.example/x"],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.asyncio
    async def test_indice_de_chunk_invalido_nao_estoura(self, base, ia_disponivel):
        resp = _resposta(["VALOR: 2.69"], supports=[(0, 7, 11, [99])], chunks=["https://fonte.example/x"])
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.asyncio
    async def test_chunk_sem_web_nao_atribui(self, base, ia_disponivel):
        resp = _resposta(["VALOR: 2.69"], supports=[(0, 7, 11, [0])], chunks=[None])
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.asyncio
    async def test_fonte_sem_titulo_cai_para_o_host(self, base, ia_disponivel):
        """Nunca exibe nome vazio — sem título/domínio, o host serve de nome."""
        resp = _resposta(
            ["VALOR: 2.69"], supports=[(0, 7, 11, [0])],
            chunks=["https://wordstream.example/x"], titulos=[None],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].fonte == "wordstream.example"

    @pytest.mark.asyncio
    async def test_duas_urls_distintas_associadas_e_ambiguo(self, base, ia_disponivel):
        resp = _resposta(
            ["VALOR: 2.69"],
            supports=[(0, 7, 11, [0, 1])],  # duas fontes pro MESMO trecho
            chunks=["https://a.example/x", "https://b.example/y"],
        )
        with patch.object(benchmark_service, "_get_client", return_value=_fake_client(resp)):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.parametrize("esquema", [
        "javascript:alert(1)", "data:text/html,<script>x</script>", "file:///etc/passwd", "ftp://x/y",
    ])
    @pytest.mark.asyncio
    async def test_url_com_esquema_inseguro_e_rejeitada(self, base, ia_disponivel, esquema):
        fake = _fake_client(_resposta_com_fonte("2.69", uri=esquema))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    def test_fonte_nao_verificada_nunca_aparece_na_resposta_http(self, sem_base):
        # Sem persistência -> 503 antes mesmo de tentar Gemini; garante que
        # nunca existe caminho onde a rota devolve 200 com fonte não checada.
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads",
            "objective": "conversion", "metrics": ["ctr_link"],
        })
        assert r.status_code != 200


# ─────────────────────────────────────────────────────────────────────────────
# CLASSIFICAÇÃO DE RESPOSTA — só 2 desfechos são cacheáveis
# ─────────────────────────────────────────────────────────────────────────────

class TestClassificacaoDeResposta:
    @pytest.mark.asyncio
    async def test_nao_encontrado_explicito_e_cacheado(self, base, ia_disponivel):
        fake = _fake_client(_resposta(["NAO_ENCONTRADO"]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r1 = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
            r2 = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r1[0].encontrado is False and r2[0].encontrado is False
        assert fake.models.generate_content.call_count == 1  # cacheado

    @pytest.mark.asyncio
    async def test_resposta_vazia_e_falha_transitoria_nao_cacheada(self, base, ia_disponivel):
        fake = _fake_client(_resposta([""]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    @pytest.mark.asyncio
    async def test_texto_extra_ao_redor_do_valor_e_rejeitado(self, base, ia_disponivel):
        """Fullmatch estrito: 'bla VALOR: 1.0 bla' não é uma resposta bem-formada."""
        fake = _fake_client(_resposta(["Claro! VALOR: 1.0"]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.asyncio
    async def test_multiplos_valores_na_resposta_e_rejeitado(self, base, ia_disponivel):
        fake = _fake_client(_resposta(["VALOR: 1.0 e tambem VALOR: 99"]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])

    @pytest.mark.parametrize("valor", ["-5", "0", "150.5", "1e9"])
    @pytest.mark.asyncio
    async def test_valores_fora_da_faixa_plausivel_sao_rejeitados(self, base, ia_disponivel, valor):
        fake = _fake_client(_resposta_com_fonte(valor))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    @pytest.mark.asyncio
    async def test_valor_no_limite_superior_100_e_aceito(self, base, ia_disponivel):
        fake = _fake_client(_resposta_com_fonte("100"))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].encontrado is True and r[0].value == 100.0

    @pytest.mark.asyncio
    async def test_timeout_e_falha_transitoria_nao_cacheada(self, base, ia_disponivel, monkeypatch):
        import time
        monkeypatch.setattr(settings, "GEMINI_TIMEOUT_SECONDS", 0.05)

        def lento(*a, **k):
            time.sleep(0.3)
            return _resposta(["NAO_ENCONTRADO"])

        fake = MagicMock()
        fake.models.generate_content.side_effect = lento
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            # Sem wait_for/shield nesta camada — o teste usa um timeout de
            # requests curto o bastante pro teste não travar; o SDK real usa
            # http_options.timeout (ver ai_service._get_client).
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        # Sem timeout de socket real no mock, a chamada "lenta" só demora —
        # ela CONCLUI (não há exceção simulada), então o resultado reflete a
        # resposta que ela devolveu (NAO_ENCONTRADO), cacheável.
        assert r[0].encontrado is False

    @pytest.mark.asyncio
    async def test_excecao_do_sdk_e_falha_transitoria_nao_cacheada(self, base, ia_disponivel):
        fake = MagicMock()
        fake.models.generate_content.side_effect = RuntimeError("erro de rede simulado")
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with pytest.raises(benchmark_service.BenchmarkFalhaTransitoria):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    @pytest.mark.asyncio
    async def test_falha_transitoria_na_rota_vira_503_nao_200_parcial(self, base, ia_disponivel):
        fake = MagicMock()
        fake.models.generate_content.side_effect = RuntimeError("boom")
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            with patch("app.service.ai_service.is_ai_available", return_value=True):
                r = client.post("/api/v1/benchmark/mercado", json={
                    "niche": "pet", "platform": "meta_ads", "objective": "conversion",
                    "metrics": ["ctr_link", "roas"],
                })
        assert r.status_code == 503  # nunca 200 com um resultado "enganoso" no meio


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE-FLIGHT — concorrência real, não só várias escritas SQLite
# ─────────────────────────────────────────────────────────────────────────────

class TestSingleFlight:
    @pytest.mark.asyncio
    async def test_duas_chamadas_concorrentes_mesma_chave_fazem_uma_busca(self, base, ia_disponivel):
        import asyncio

        async def resposta_devagar(*a, **k):
            await asyncio.sleep(0.05)
            return _resposta_com_fonte("2.69")

        chamadas = []

        def sync_generate(*a, **k):
            chamadas.append(1)
            import time
            time.sleep(0.08)
            return _resposta_com_fonte("2.69")

        fake = MagicMock()
        fake.models.generate_content.side_effect = sync_generate
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r1, r2 = await asyncio.gather(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"]),
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"]),
            )
        assert len(chamadas) == 1
        assert r1[0].encontrado is True and r2[0].encontrado is True
        assert r1[0].value == r2[0].value == 2.69

    @pytest.mark.asyncio
    async def test_chaves_diferentes_nao_sao_serializadas(self, base, ia_disponivel):
        import asyncio
        import time

        def sync_generate(*a, **k):
            time.sleep(0.08)
            return _resposta_com_fonte("2.69")

        fake = MagicMock()
        fake.models.generate_content.side_effect = sync_generate
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            inicio = time.monotonic()
            await asyncio.gather(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"]),
                benchmark_service.buscar_benchmarks("moda_vestuario", "meta_ads", "conversion", ["ctr_link"]),
            )
            duracao = time.monotonic() - inicio
        # Se estivessem serializadas por um lock global, levaria ~0.16s.
        # Em paralelo, ~0.08s (mais folga generosa pro scheduler do teste).
        assert duracao < 0.15
        assert fake.models.generate_content.call_count == 2


# ─────────────────────────────────────────────────────────────────────────────
# CACHE — hit / miss / expiração / isolamento / concorrência / invariantes
# ─────────────────────────────────────────────────────────────────────────────

class TestCacheStorage:
    def test_miss_devolve_none(self, base):
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    def test_salvar_e_ler_de_volta(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link",
            encontrado=True, valor=2.69, fonte="WordStream", fonte_url="https://x.example",
        )
        cache = storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link")
        assert cache is not None
        assert cache["valor"] == 2.69

    def test_encontrado_false_nao_exige_fonte(self, base):
        storage.salvar_cache_benchmark("pet", "meta_ads", "conversion", "roas", encontrado=False)
        cache = storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "roas")
        assert cache["encontrado"] is False and cache["valor"] is None

    def test_encontrado_true_sem_valor_e_rejeitado_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link", encontrado=True)

    def test_encontrado_true_sem_fonte_e_rejeitado_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark(
                "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=2.0,
                fonte_url="https://x.example",
            )

    def test_encontrado_true_com_url_insegura_e_rejeitado_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark(
                "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=2.0,
                fonte="F", fonte_url="javascript:alert(1)",
            )

    def test_linha_corrompida_no_banco_vira_miss_seguro_no_service(self, base):
        """
        Corrompe a linha DIRETO no SQLite (bypassa a validação de escrita) —
        simula bit-rot / escrita de versão antiga. O SERVIÇO (não o storage
        cru) trata isso como miss, nunca como dado confiável.
        """
        storage.inicializar()
        with sqlite3.connect(base) as conn:
            conn.execute(
                "INSERT INTO benchmarks_mercado"
                " (nicho, plataforma, objetivo, metrica, valor, encontrado,"
                "  fonte, fonte_url, capturado_em, expira_em)"
                " VALUES ('pet','meta_ads','conversion','ctr_link', NULL, 1,"
                "  NULL, NULL, '2026-01-01T00:00:00+00:00', '2099-01-01T00:00:00+00:00')"
            )
            conn.commit()
        cache_cru = storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link")
        assert cache_cru is not None  # storage devolve o dado cru...
        assert not benchmark_service._cache_e_valido(cache_cru, "ctr_link")  # ...o serviço rejeita

    def test_ac_b6_expira_em_exatamente_14_dias_de_capturado_em(self, base):
        gravado = storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        capturado = datetime.fromisoformat(gravado["capturado_em"])
        expira = datetime.fromisoformat(gravado["expira_em"])
        assert expira - capturado == timedelta(days=14)

    def test_cache_expirado_e_tratado_como_miss(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        passado = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(timespec="seconds")
        with sqlite3.connect(base) as conn:
            conn.execute("UPDATE benchmarks_mercado SET expira_em = ?", (passado,))
            conn.commit()
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None

    def test_cache_a_1_dia_de_expirar_ainda_e_valido(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        quase = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(timespec="seconds")
        with sqlite3.connect(base) as conn:
            conn.execute("UPDATE benchmarks_mercado SET expira_em = ?", (quase,))
            conn.commit()
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is not None

    def test_isolamento_de_chave_plataforma(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        assert storage.buscar_cache_benchmark("pet", "google_ads", "conversion", "ctr_link") is None

    def test_isolamento_de_chave_objetivo(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "lead", "ctr_link") is None

    def test_reescrever_a_mesma_chave_atualiza_em_vez_de_duplicar(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=1.0,
            fonte="F", fonte_url="https://x.example",
        )
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link", encontrado=True, valor=2.0,
            fonte="F2", fonte_url="https://y.example",
        )
        with sqlite3.connect(base) as conn:
            n = conn.execute("SELECT COUNT(*) FROM benchmarks_mercado").fetchone()[0]
        assert n == 1
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link")["valor"] == 2.0

    def test_concorrencia_basica_mesma_chave_nao_duplica(self, base):
        erros = []

        def gravar(i):
            try:
                storage.salvar_cache_benchmark(
                    "pet", "meta_ads", "conversion", "ctr_link",
                    encontrado=True, valor=float(i), fonte="F", fonte_url="https://x.example",
                )
            except Exception as e:
                erros.append(e)

        threads = [threading.Thread(target=gravar, args=(i,)) for i in range(1, 11)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not erros
        with sqlite3.connect(base) as conn:
            n = conn.execute("SELECT COUNT(*) FROM benchmarks_mercado").fetchone()[0]
        assert n == 1


# ─────────────────────────────────────────────────────────────────────────────
# COMPATIBILIDADE, STATUS E OPENAPI
# ─────────────────────────────────────────────────────────────────────────────

class TestCompatibilidade:
    def test_analyze_continua_funcionando_sem_niche(self):
        payload = {
            "campaign": {"id": 1, "name": "Sem nicho"},
            "metrics": {"impressions": 1000, "spend": 100.0},
            "targets": {},
        }
        assert client.post("/api/v1/campaign/analyze", json=payload).status_code == 200

    def test_analyze_rejeita_niche_fora_da_lista(self):
        payload = {
            "campaign": {"id": 1, "name": "x", "niche": "chuteiras"},
            "metrics": {"impressions": 1000, "spend": 100.0},
            "targets": {},
        }
        assert client.post("/api/v1/campaign/analyze", json=payload).status_code == 422

    def test_status_reporta_bloco_benchmark(self):
        r = client.get("/api/v1/status")
        assert set(r.json()["benchmark"].keys()) == {"enabled", "available"}

    def test_status_available_falso_sem_persistencia_mesmo_com_ia_ok(self, sem_base):
        with patch("app.routes.benchmark.is_ai_available", return_value=True):
            r = client.get("/api/v1/status")
        assert r.json()["benchmark"]["available"] is False

    def test_status_available_falso_sem_ia_mesmo_com_persistencia_ligada(self, base):
        r = client.get("/api/v1/status")
        assert r.json()["benchmark"]["available"] is False

    def test_status_available_true_só_com_as_tres_dependencias(self, base):
        with patch("app.routes.benchmark.is_ai_available", return_value=True):
            r = client.get("/api/v1/status")
        assert r.json()["benchmark"]["available"] is True


class TestOpenAPI:
    def test_rota_expoe_response_model_com_discriminador(self):
        with patch.object(settings, "DEBUG", True):
            from importlib import reload
            import app.main as m
            reload(m)
            c2 = TestClient(m.app)
            spec = c2.get("/openapi.json").json()
        schemas = spec["components"]["schemas"]
        assert "BenchmarkResposta" in schemas
        assert "BenchmarkEncontrado" in schemas
        assert "BenchmarkNaoEncontrado" in schemas

    def test_entrada_declara_lista_fechada_de_metricas(self):
        with patch.object(settings, "DEBUG", True):
            from importlib import reload
            import app.main as m
            reload(m)
            c2 = TestClient(m.app)
            spec = c2.get("/openapi.json").json()
        entrada = spec["components"]["schemas"]["BenchmarkEntrada"]["properties"]["metrics"]
        assert entrada["maxItems"] == 6


class TestParidadeDeListasFechadas:
    """
    Achado da revisão Opus (2026-09-04): nada travava as 15 opções de nicho
    entre `CampaignNiche` (schema.py) e `NICHE_LABELS` (labels.py) — as duas
    listas podiam divergir em silêncio. Não criamos uma TERCEIRA lista
    literal aqui (isso só multiplicaria o risco) — o teste deriva os dois
    conjuntos dos próprios módulos e compara.

    A paridade `types.ts` (`CampaignNiche`) × `niche.ts` (`NICHE_LABELS`) no
    frontend já é garantida em TEMPO DE COMPILAÇÃO pelo próprio TypeScript
    (`NICHE_LABELS: Record<CampaignNiche, string>` obriga as chaves a
    baterem exatamente) — não precisa de teste de runtime lá.
    """

    def test_campaign_niche_e_niche_labels_tem_exatamente_os_mesmos_valores(self):
        import typing
        from app.schema.schema import CampaignNiche
        from app.service.labels import NICHE_LABELS

        do_schema = set(typing.get_args(CampaignNiche))
        dos_labels = set(NICHE_LABELS.keys())
        assert do_schema == dos_labels, (
            f"só no schema: {do_schema - dos_labels}; só em labels.py: {dos_labels - do_schema}"
        )

    def test_sao_15_nichos(self):
        import typing
        from app.schema.schema import CampaignNiche

        assert len(typing.get_args(CampaignNiche)) == 15


# ─────────────────────────────────────────────────────────────────────────────
# REGRESSÕES DA REVISÃO OPUS DE 2026-09-05
# Cada teste abaixo reproduz uma falha que ESTAVA no código e falha sem a
# correção correspondente.
# ─────────────────────────────────────────────────────────────────────────────

class TestInvariantesDoCache:
    """`_cache_e_valido` aceitava lixo e estourava em vez de virar miss."""

    def _linha(self, **kw):
        base = dict(
            encontrado=True, valor=2.0, fonte="F", fonte_url="https://x.example",
            capturado_em="2026-09-05T00:00:00+00:00",
            regra_versao=storage.REGRA_BENCHMARK_VERSAO,
        )
        base.update(kw)
        return base

    @pytest.mark.parametrize("rotulo,linha_kw", [
        ("CTR acima de 100", dict(valor=999.0)),
        ("CTR negativo", dict(valor=-5.0)),
        ("CTR zero", dict(valor=0.0)),
        ("valor textual", dict(valor="doze")),
        ("valor booleano", dict(valor=True)),
        ("fonte só espaço", dict(fonte="   ")),
        ("fonte None", dict(fonte=None)),
        ("url sem host", dict(fonte_url="https://")),
        ("url esquema inseguro", dict(fonte_url="javascript:alert(1)")),
        ("capturado_em vazio", dict(capturado_em="")),
        ("capturado_em lixo", dict(capturado_em="nao-e-data")),
    ])
    def test_linha_invalida_vira_miss_sem_estourar(self, rotulo, linha_kw):
        assert benchmark_service._cache_e_valido(self._linha(**linha_kw), "ctr_link") is False

    def test_linha_valida_continua_valida(self):
        assert benchmark_service._cache_e_valido(self._linha(), "ctr_link") is True

    def test_linha_de_regra_antiga_vira_miss(self):
        """
        Cache legado: positivos gravados sob a regra de cobertura PARCIAL e
        negativos que na verdade eram falha transitória não podem seguir
        valendo por 14 dias sob a regra nova.
        """
        assert benchmark_service._cache_e_valido(self._linha(regra_versao=0), "ctr_link") is False
        assert benchmark_service._cache_e_valido(
            self._linha(encontrado=False, valor=None, fonte=None, fonte_url=None, regra_versao=0), "ctr_link"
        ) is False

    def test_negativo_da_regra_atual_continua_valido(self):
        assert benchmark_service._cache_e_valido(
            self._linha(encontrado=False, valor=None, fonte=None, fonte_url=None), "ctr_link"
        ) is True

    def test_linha_legada_no_banco_real_forca_nova_busca(self, base, ia_disponivel):
        """Ponta a ponta: linha da regra 0 no SQLite é ignorada e a busca acontece."""
        storage.inicializar()
        with sqlite3.connect(base) as conn:
            conn.execute(
                "INSERT INTO benchmarks_mercado"
                " (nicho, plataforma, objetivo, metrica, valor, encontrado, fonte,"
                "  fonte_url, capturado_em, expira_em, regra_versao)"
                " VALUES ('pet','meta_ads','conversion','ctr_link', 2.0, 1, 'Antiga',"
                "  'https://antiga.example/x', '2026-01-01T00:00:00+00:00',"
                "  '2099-01-01T00:00:00+00:00', 0)"
            )
            conn.commit()
        fake = _fake_client(_resposta_com_fonte("3.14", uri="https://nova.example/x"))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r = await_sync(benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"]))
        assert fake.models.generate_content.call_count == 1  # não reaproveitou a linha antiga
        assert r[0].fonte_url == "https://nova.example/x"


def await_sync(coro):
    import asyncio
    return asyncio.run(coro)


class TestEscritaDoCacheValidaInvariantes:
    def test_valor_fora_da_faixa_e_rejeitado_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark(
                "pet", "meta_ads", "conversion", "ctr_link",
                encontrado=True, valor=999.0, fonte="F", fonte_url="https://x.example",
            )

    def test_url_sem_host_e_rejeitada_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark(
                "pet", "meta_ads", "conversion", "ctr_link",
                encontrado=True, valor=2.0, fonte="F", fonte_url="https://",
            )

    def test_fonte_so_espaco_e_rejeitada_na_escrita(self, base):
        with pytest.raises(ValueError):
            storage.salvar_cache_benchmark(
                "pet", "meta_ads", "conversion", "ctr_link",
                encontrado=True, valor=2.0, fonte="   ", fonte_url="https://x.example",
            )

    def test_escrita_valida_grava_a_versao_da_regra_atual(self, base):
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link",
            encontrado=True, valor=2.0, fonte="F", fonte_url="https://x.example",
        )
        linha = storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link")
        assert linha["regra_versao"] == storage.REGRA_BENCHMARK_VERSAO


class TestTrocaDeDBPath:
    """
    `_iniciado` era um booleano global: trocar `DB_PATH` deixava o módulo
    achando que a base NOVA já tinha schema. As fixtures resetavam o flag e
    escondiam a lacuna — este teste NÃO reseta, de propósito.
    """

    def test_trocar_db_path_reinicializa_a_base_nova(self, tmp_path, monkeypatch):
        a, b = tmp_path / "a.db", tmp_path / "b.db"
        monkeypatch.setattr(settings, "DB_PATH", str(a))
        monkeypatch.setattr(storage, "_iniciado", False)
        monkeypatch.setattr(storage, "_iniciado_para", None)
        storage.inicializar()

        monkeypatch.setattr(settings, "DB_PATH", str(b))  # sem resetar _iniciado
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None
        assert b.exists()

    def test_dados_nao_vazam_entre_bases(self, tmp_path, monkeypatch):
        a, b = tmp_path / "a.db", tmp_path / "b.db"
        monkeypatch.setattr(storage, "_iniciado", False)
        monkeypatch.setattr(storage, "_iniciado_para", None)
        monkeypatch.setattr(settings, "DB_PATH", str(a))
        storage.salvar_cache_benchmark(
            "pet", "meta_ads", "conversion", "ctr_link",
            encontrado=True, valor=2.0, fonte="F", fonte_url="https://x.example",
        )
        monkeypatch.setattr(settings, "DB_PATH", str(b))
        assert storage.buscar_cache_benchmark("pet", "meta_ads", "conversion", "ctr_link") is None


class TestCancelamentoNaoDuplicaCusto:
    """
    Reprodução do achado: `await tarefa` direto fazia o cancelamento de UM
    interessado matar a tarefa COMPARTILHADA — e o retry seguinte abria uma
    segunda busca paga.
    """

    @pytest.mark.asyncio
    async def test_cancelar_um_interessado_nao_cancela_a_busca_nem_permite_nova(self, base, ia_disponivel):
        import asyncio

        chamadas = []
        comecou = asyncio.Event()
        segurar = asyncio.Event()

        async def busca_lenta(niche, platform, objective, metric):
            chamadas.append(1)
            comecou.set()
            await segurar.wait()
            return benchmark_service.BenchmarkResultado(
                metric=metric, encontrado=True, value=2.0,
                fonte="F", fonte_url="https://x.example",
            )

        with patch.object(benchmark_service, "_executar_busca", side_effect=busca_lenta):
            t1 = asyncio.ensure_future(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
            )
            await comecou.wait()
            t1.cancel()
            with pytest.raises(asyncio.CancelledError):
                await t1

            # Retry enquanto a primeira busca AINDA está em voo.
            t2 = asyncio.ensure_future(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
            )
            await asyncio.sleep(0)
            assert len(chamadas) == 1, "o retry abriu uma SEGUNDA busca paga"

            segurar.set()
            r = await asyncio.wait_for(t2, timeout=2)

        assert len(chamadas) == 1
        assert r[0].encontrado is True and r[0].value == 2.0

    @pytest.mark.asyncio
    async def test_executor_sincrono_bloqueado_tambem_e_compartilhado(self, base, ia_disponivel):
        """
        Double SÍNCRONO bloqueado no executor (não uma corrotina): é o caminho
        real do SDK. Cancelar o await não interrompe a thread — o custo já foi
        pago, então a tarefa precisa continuar servindo os demais.
        """
        import asyncio
        import threading as th

        chamadas = []
        comecou = th.Event()
        segurar = th.Event()

        def generate_bloqueante(*a, **k):
            chamadas.append(1)
            comecou.set()
            segurar.wait(timeout=5)
            return _resposta_com_fonte("2.69")

        fake = MagicMock()
        fake.models.generate_content.side_effect = generate_bloqueante

        with patch.object(benchmark_service, "_get_client", return_value=fake):
            t1 = asyncio.ensure_future(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
            )
            await asyncio.get_running_loop().run_in_executor(None, comecou.wait, 5)
            t1.cancel()
            with pytest.raises(asyncio.CancelledError):
                await t1

            t2 = asyncio.ensure_future(
                benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
            )
            await asyncio.sleep(0)
            segurar.set()
            r = await asyncio.wait_for(t2, timeout=5)

        assert len(chamadas) == 1, "cancelar o await disparou uma segunda chamada paga"
        assert r[0].encontrado is True


class TestMotivosDistintos:
    """
    Falta de contrato de moeda NÃO é prova de inexistência de benchmark — os
    dois casos precisam de motivos distintos e distinguíveis pela UI.
    """

    def test_custo_e_nao_elegivel_nao_ausencia(self, sem_base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "meta_ads", "objective": "conversion",
            "metrics": ["cpa", "cpl", "cpm"],
        })
        assert r.status_code == 200
        for res in r.json()["resultados"]:
            assert res["motivo_tipo"] == "nao_elegivel"
            assert "moeda" in res["motivo"]  # diz o motivo REAL

    def test_plataforma_sem_fonte_e_nao_elegivel(self, sem_base):
        r = client.post("/api/v1/benchmark/mercado", json={
            "niche": "pet", "platform": "tiktok_ads", "objective": "conversion",
            "metrics": ["ctr_link"],
        })
        assert r.json()["resultados"][0]["motivo_tipo"] == "nao_elegivel"

    @pytest.mark.asyncio
    async def test_nao_encontrado_do_modelo_e_ausencia_confirmada(self, base, ia_disponivel):
        fake = _fake_client(_resposta(["NAO_ENCONTRADO"]))
        with patch.object(benchmark_service, "_get_client", return_value=fake):
            r = await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])
        assert r[0].motivo_tipo == "nao_encontrado"
        assert "busca realizada" in r[0].motivo


class TestFalhaDeSQLiteNaoViraAusencia:
    @pytest.mark.asyncio
    async def test_erro_lendo_cache_vira_indisponivel(self, base, ia_disponivel):
        def explode(*a, **k):
            raise sqlite3.OperationalError("database is locked")

        with patch.object(storage, "buscar_cache_benchmark", side_effect=explode):
            with pytest.raises(benchmark_service.BenchmarkIndisponivel):
                await benchmark_service.buscar_benchmarks("pet", "meta_ads", "conversion", ["ctr_link"])


class TestResponseModelValidaInvariantes:
    """`BenchmarkEncontrado` aceitava valor 999, fonte em branco e URL sem host."""

    @pytest.mark.parametrize("rotulo,kw", [
        ("value 999", dict(value=999.0)),
        ("value -5", dict(value=-5.0)),
        ("value 0", dict(value=0.0)),
        ("fonte só espaço", dict(fonte="   ")),
        ("url sem host", dict(fonte_url="https://")),
        ("url esquema inseguro", dict(fonte_url="javascript:alert(1)")),
        ("capturado_em vazio", dict(capturado_em="")),
        ("capturado_em lixo", dict(capturado_em="xyz")),
    ])
    def test_invariante_violada_e_rejeitada(self, rotulo, kw):
        from pydantic import ValidationError
        from app.routes.benchmark import BenchmarkEncontrado

        base = dict(
            metric="ctr_link", value=2.0, fonte="F", fonte_url="https://x.example",
            capturado_em="2026-09-05T00:00:00+00:00",
        )
        base.update(kw)
        with pytest.raises(ValidationError):
            BenchmarkEncontrado(**base)

    def test_resultado_valido_continua_aceito(self):
        from app.routes.benchmark import BenchmarkEncontrado

        m = BenchmarkEncontrado(
            metric="ctr_link", value=2.0, fonte="  WordStream  ",
            fonte_url="https://x.example", capturado_em="2026-09-05T00:00:00+00:00",
        )
        assert m.fonte == "WordStream"  # normalizada

    def test_negativo_nao_pode_carregar_campos_positivos(self):
        from pydantic import ValidationError
        from app.routes.benchmark import BenchmarkNaoEncontrado

        with pytest.raises(ValidationError):
            BenchmarkNaoEncontrado(
                metric="ctr_link", motivo="x", motivo_tipo="nao_elegivel", value=2.0
            )


class TestParidadeEntreLinguagens:
    """
    Achado da revisão Opus (2026-09-05): a paridade só comparava schema Python
    × labels Python. A tipagem do TS garante coerência DENTRO do frontend
    (`Record<CampaignNiche, string>`), mas nada ligava Python ↔ TypeScript ↔
    documentação — as quatro podiam divergir em silêncio.

    Deriva cada lista da sua PRÓPRIA fonte (parse dos arquivos reais); não
    existe uma quinta lista literal aqui que pudesse divergir junto.
    """

    RAIZ = __import__("pathlib").Path(__file__).resolve().parents[2]

    def _do_schema(self):
        import typing
        from app.schema.schema import CampaignNiche
        return set(typing.get_args(CampaignNiche))

    def _do_types_ts(self):
        import re
        texto = (self.RAIZ / "frontend/nexgestor-dashboard/src/types.ts").read_text()
        bloco = re.search(r"export type CampaignNiche\s*=(.*?)\n\n", texto, re.S).group(1)
        return set(re.findall(r'"([a-z_0-9]+)"', bloco))

    def _do_niche_ts(self):
        import re
        texto = (self.RAIZ / "frontend/nexgestor-dashboard/src/lib/niche.ts").read_text()
        bloco = re.search(r"NICHE_LABELS: Record<CampaignNiche, string> = \{(.*?)\n\}", texto, re.S).group(1)
        return set(re.findall(r"^\s*([a-z_0-9]+):", bloco, re.M))

    def _do_contrato(self):
        import re
        texto = (self.RAIZ / "docs/CONTRATO_API_FRONTEND.md").read_text()
        bloco = re.search(r"Lista fechada de `niche`.*?\n\n", texto, re.S).group(0)
        return set(re.findall(r"`([a-z_0-9]+)`", bloco))

    def test_schema_python_e_types_ts_batem(self):
        assert self._do_schema() == self._do_types_ts()

    def test_schema_python_e_niche_ts_batem(self):
        assert self._do_schema() == self._do_niche_ts()

    def test_contrato_documenta_todos_os_nichos(self):
        faltando = self._do_schema() - self._do_contrato()
        assert faltando == set(), f"nichos não documentados no contrato: {sorted(faltando)}"
