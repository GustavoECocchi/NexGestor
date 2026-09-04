"""
NexGestor — Regressões da auditoria de rede e comunicação (2026-09-03)
========================================================================
Cobertura: A5 (timeout do client Gemini a nível de socket), A6 (docs públicos
por default), A7 (CORS de porta local variável), X-Nex-Dono obrigatório,
preflight das rotas de campanhas salvas.

A auditoria (docs/sessions/2026-09-03.md) apontou que nenhuma suíte existente
tocava CORS/preflight — este arquivo fecha essa lacuna, não repete os outros.
"""
import sys

sys.path.insert(0, ".")

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import _docs_urls, app

client = TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# A6 — /docs, /redoc, /openapi.json não podem ser públicos por default
# ─────────────────────────────────────────────────────────────────────────────

class TestDocsPublicosApenasComDebug:
    """
    Achado A6: os três respondiam 200 mesmo sem `docs_url` explícito (default
    do FastAPI). Hoje mascarado porque a raiz do VPS serve estático — mas é
    exatamente o slot que o dashboard vai ocupar (roadmap item 10), e a
    própria referência de nginx do repo avisa que abrir o proxy pro backend
    inteiro sem restringir ao prefixo da API publica isso.
    """

    def test_docs_nao_existe_com_settings_padrao(self):
        # settings.DEBUG é False por padrão (config.py) — mesmo estado do app
        # já construído neste processo de teste.
        assert client.get("/docs").status_code == 404

    def test_redoc_nao_existe_com_settings_padrao(self):
        assert client.get("/redoc").status_code == 404

    def test_openapi_json_nao_existe_com_settings_padrao(self):
        assert client.get("/openapi.json").status_code == 404

    def test_funcao_pura_desliga_os_tres_com_debug_false(self):
        assert _docs_urls(debug=False) == {
            "docs_url": None, "redoc_url": None, "openapi_url": None,
        }

    def test_funcao_pura_liga_os_tres_com_debug_true(self):
        assert _docs_urls(debug=True) == {
            "docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json",
        }


# ─────────────────────────────────────────────────────────────────────────────
# A7 — CORS precisa acompanhar a porta que o Vite escolher
# ─────────────────────────────────────────────────────────────────────────────

class TestCorsPortaLocalVariavel:
    """
    Achado A7, reproduzido AO VIVO nesta mesma sessão de auditoria: com a
    porta 5173 ocupada (outro checkout do repo já rodando), o Vite sobe em
    5174 — fora da allowlist fixa (CORS_ORIGINS só tinha 3000/5173) — e toda
    chamada falhava como "Failed to fetch", sem nenhum 4xx/5xx pra explicar.
    """

    def _preflight(self, origin: str):
        return client.options(
            "/api/v1/campaigns",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-nex-dono",
            },
        )

    def test_localhost_em_porta_qualquer_passa_no_preflight(self):
        for porta in (5173, 5174, 5175, 3000, 41000):
            origem = f"http://localhost:{porta}"
            r = self._preflight(origem)
            assert r.status_code == 200, f"origem {origem} deveria passar"
            assert r.headers.get("access-control-allow-origin") == origem

    def test_127_0_0_1_nao_e_coberto_pelo_regex_atual(self):
        """
        Contraprova deliberada: o regex casa só `localhost`, não `127.0.0.1`.
        Documenta o limite atual — não é uma lacuna que este achado pediu pra
        fechar, e o teste existe pra não virar regressão silenciosa se
        alguém 'simplificar' o regex achando que os dois são equivalentes.
        """
        r = self._preflight("http://127.0.0.1:5173")
        assert r.status_code == 400
        assert "access-control-allow-origin" not in r.headers

    def test_https_localhost_nao_e_aceito(self):
        """O regex casa só http:// de propósito — produção nunca é localhost."""
        r = self._preflight("https://localhost:5173")
        assert r.status_code == 400

    def test_origem_arbitraria_continua_rejeitada(self):
        r = self._preflight("https://evil.example")
        assert r.status_code == 400
        assert "access-control-allow-origin" not in r.headers

    def test_origem_fixa_da_allowlist_continua_passando(self):
        """Não regrediu o caminho que já funcionava (CORS_ORIGINS explícito)."""
        r = self._preflight("http://localhost:5173")
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Lacuna apontada na auditoria: nenhum teste afirmava que X-Nex-Dono é exigido
# ─────────────────────────────────────────────────────────────────────────────

class TestXNexDonoObrigatorio:
    def test_get_campaigns_sem_header_e_422(self):
        r = client.get("/api/v1/campaigns")
        assert r.status_code == 422
        assert "X-Nex-Dono" in str(r.json())

    def test_post_campaigns_sem_header_e_422(self):
        r = client.post("/api/v1/campaigns", json={"payload": {}})
        assert r.status_code == 422

    def test_delete_campaigns_sem_header_e_422(self):
        r = client.delete("/api/v1/campaigns/1")
        assert r.status_code == 422

    def test_header_vazio_e_422_nao_500(self):
        r = client.get("/api/v1/campaigns", headers={"X-Nex-Dono": "   "})
        assert r.status_code == 422

    def test_header_gigante_e_422_nao_500(self):
        r = client.get("/api/v1/campaigns", headers={"X-Nex-Dono": "x" * 121})
        assert r.status_code == 422

    def test_preflight_de_campaigns_pede_o_header_custom(self):
        """
        Sem X-Nex-Dono na allowlist de Access-Control-Allow-Headers, o
        navegador reprova o preflight ANTES do GET/POST/DELETE de verdade
        rodar — o 422 acima nunca seria alcançado num browser real.
        """
        r = client.options(
            "/api/v1/campaigns",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "x-nex-dono",
            },
        )
        assert r.status_code == 200
        allow_headers = r.headers.get("access-control-allow-headers", "").lower()
        assert "x-nex-dono" in allow_headers


# ─────────────────────────────────────────────────────────────────────────────
# A5 — o timeout do Gemini precisa cortar o socket, não só a espera do asyncio
# ─────────────────────────────────────────────────────────────────────────────

class TestTimeoutDoClienteGemini:
    """
    Achado A5: `asyncio.wait_for` (`ai_service.call_gemini`) desiste de
    ESPERAR pela thread do executor quando o tempo estoura, mas não cancela a
    chamada síncrona bloqueante rodando nela. Sem `http_options.timeout`
    configurado no client, o SDK manda `timeout=None` pro httpx em toda
    requisição — que interpreta isso como SEM LIMITE NENHUM (verificado
    inspecionando `httpx.Client.build_request`: `timeout=None` explícito vira
    `{connect: None, read: None, write: None, pool: None}`, diferente de não
    passar nada, que herdaria o default do client). A thread ficaria
    bloqueada indefinidamente, continuando a consumir a cota da chave paga
    muito depois do request principal já ter desistido e respondido ao
    usuário.

    Nenhum teste aqui faz chamada de rede — só inspeciona a configuração que
    `_get_client()` realmente monta, com uma API key falsa.
    """

    def _client_de_verdade(self, timeout_seconds: float):
        """Constrói um client REAL do SDK (sem chamar a API), com key falsa."""
        import app.service.ai_service as ai

        ai._client = None
        ai._client_key = None
        try:
            with pytest.MonkeyPatch.context() as mp:
                mp.setattr(settings, "GEMINI_API_KEY", "AIzaFAKE" + "x" * 27)
                mp.setattr(settings, "GEMINI_TIMEOUT_SECONDS", timeout_seconds)
                return ai._get_client()
        finally:
            ai._client = None
            ai._client_key = None

    def test_client_configura_http_options_timeout_a_partir_das_settings(self):
        c = self._client_de_verdade(8.0)
        # HttpOptions.timeout é em MILISSEGUNDOS (contrato do SDK, não desta
        # correção) — 8.0s de settings vira 8000.
        assert c._api_client._http_options.timeout == 8000

    def test_timeout_diferente_nas_settings_se_reflete_no_client(self):
        c = self._client_de_verdade(3.5)
        assert c._api_client._http_options.timeout == 3500

    def test_sem_esta_correcao_o_sdk_manda_timeout_none_pro_httpx(self):
        """
        Contraprova, direto na biblioteca (não no nosso código): prova que a
        preocupação é real, não hipotética. Client construído SEM
        `http_options` — o estado de antes desta correção.
        """
        from google import genai

        sem_timeout = genai.Client(api_key="AIzaFAKE" + "x" * 27)
        req = sem_timeout._api_client._httpx_client.build_request(
            "POST", "https://example.invalid", timeout=None
        )
        assert req.extensions["timeout"] == {
            "connect": None, "read": None, "write": None, "pool": None,
        }

    def test_com_esta_correcao_o_socket_e_limitado(self):
        """Mesma prova, agora com o timeout que `_get_client()` configura."""
        c = self._client_de_verdade(8.0)
        timeout_seg = c._api_client._http_options.timeout / 1000.0
        req = c._api_client._httpx_client.build_request(
            "POST", "https://example.invalid", timeout=timeout_seg
        )
        assert req.extensions["timeout"] == {
            "connect": 8.0, "read": 8.0, "write": 8.0, "pool": 8.0,
        }
