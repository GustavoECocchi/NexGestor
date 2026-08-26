"""
Testes do endpoint /api/v1/status.

O ponto do endpoint é responder "a IA está ligada?" sem exigir uma análise, e
sem vazar configuração. Os dois testes que mais importam aqui são o de
`available=False` com a chave ausente (o estado real da produção em 25/08/2026,
que passou semanas sem ser notado) e o de não-vazamento da chave.
"""
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestStatusIA:
    def test_ia_indisponivel_sem_chave(self):
        """Sem chave configurada, `available` é False mesmo com o toggle ligado."""
        with patch("app.routes.status.settings") as s, \
             patch("app.routes.status.is_ai_available", return_value=False):
            s.GEMINI_ENABLED = True
            s.GEMINI_MODEL = "gemini-flash-lite-latest"
            r = client.get("/api/v1/status")

        assert r.status_code == 200
        ai = r.json()["ai"]
        # A distinção entre os dois é o que permite diagnosticar: toggle ligado,
        # mas faltando a chave. Colapsar num só campo esconderia a causa.
        assert ai["enabled"] is True
        assert ai["available"] is False

    def test_ia_disponivel(self):
        with patch("app.routes.status.settings") as s, \
             patch("app.routes.status.is_ai_available", return_value=True):
            s.GEMINI_ENABLED = True
            s.GEMINI_MODEL = "gemini-flash-lite-latest"
            r = client.get("/api/v1/status")

        ai = r.json()["ai"]
        assert ai["enabled"] is True
        assert ai["available"] is True
        assert ai["model"] == "gemini-flash-lite-latest"

    def test_toggle_desligado(self):
        """GEMINI_ENABLED=False reflete nos dois campos."""
        with patch("app.routes.status.settings") as s, \
             patch("app.routes.status.is_ai_available", return_value=False):
            s.GEMINI_ENABLED = False
            s.GEMINI_MODEL = "gemini-flash-lite-latest"
            r = client.get("/api/v1/status")

        assert r.json()["ai"] == {
            "enabled": False,
            "available": False,
            "model": "gemini-flash-lite-latest",
        }


class TestStatusPersistencia:
    def test_reflete_persistencia_ligada(self):
        with patch("app.routes.status.storage.persistencia_ativa", return_value=True):
            r = client.get("/api/v1/status")
        assert r.json()["persistence"]["enabled"] is True

    def test_reflete_persistencia_desligada(self):
        with patch("app.routes.status.storage.persistencia_ativa", return_value=False):
            r = client.get("/api/v1/status")
        assert r.json()["persistence"]["enabled"] is False


class TestStatusNaoVazaSegredo:
    def test_chave_nunca_aparece_na_resposta(self):
        """
        O endpoint é público e sem autenticação. Ele pode dizer SE a IA está
        ligada, nunca COM O QUÊ.
        """
        # Chave falsa montada em runtime — nunca um literal no arquivo (regra
        # do projeto: nem em código, nem em documentação).
        falsa = "AQ." + "x" * 50

        with patch("app.routes.status.settings") as s, \
             patch("app.routes.status.is_ai_available", return_value=True):
            s.GEMINI_ENABLED = True
            s.GEMINI_MODEL = "gemini-flash-lite-latest"
            s.GEMINI_API_KEY = falsa
            r = client.get("/api/v1/status")

        assert falsa not in r.text
        # Nenhum campo de configuração além dos três previstos.
        assert set(r.json()["ai"]) == {"enabled", "available", "model"}

    def test_nao_expoe_caminho_do_banco(self):
        """DB_PATH revelaria a estrutura de diretórios do servidor."""
        with patch("app.routes.status.storage.persistencia_ativa", return_value=True):
            r = client.get("/api/v1/status")

        assert set(r.json()["persistence"]) == {"enabled"}
        assert "/dados" not in r.text
