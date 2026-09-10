"""
NexGestor — Regressão: booleano aceito em campo inteiro (2026-09-04)
========================================================================
Cobertura: `bool` é subclasse de `int` em Python, e o Pydantic v2, em modo
lax, aceitava silenciosamente `true`/`false` como `1`/`0` em qualquer campo
inteiro do payload de entrada — `Campaign.id`, os contadores de `Metrics` e
`Targets.min_weekly_conversions`. Corrigido em `app/schema/schema.py`
(`_SemBooleanoEmInteiro`, validador `mode="before"` que olha a ANOTAÇÃO do
campo, não o tipo do valor recebido).

Este arquivo prova a correção por mutação: comentar o mixin
`_SemBooleanoEmInteiro` em `Campaign`/`Metrics`/`Targets` faz estes testes
falharem (voltam a aceitar bool e a produzir `1`/`0`).

Atualização 2026-09-04 (revisão Opus): a cobertura original não incluía
`CampanhaEntrada.id` (`app/routes/campanhas_salvas.py`) — reproduzido ao vivo
pelo revisor: `POST /api/v1/campaigns` com `id: true` coagia para `id=1` e
**sobrescrevia** a campanha `id=1` de quem chamasse, em vez de 422. Corrigido
aplicando o mesmo mixin; `TestCampanhaEntradaRejeitaBooleano` abaixo fecha
essa lacuna e prova que o payload de uma campanha legítima sobrevive à
tentativa de ataque.
"""
import sys

sys.path.insert(0, ".")

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schema.schema import Campaign, Metrics, Targets
from app.service import storage

client = TestClient(app)

# Todos os campos inteiros públicos de Metrics (exclui learning_phase, que é bool de verdade).
CAMPOS_INTEIROS_METRICS = [
    "impressions", "reach", "video_views_3s", "video_views_50pct", "thruplays",
    "link_clicks", "all_clicks", "landing_page_views", "conversions", "weekly_conversions",
]


class TestMetricsRejeitaBooleano:
    @pytest.mark.parametrize("campo", CAMPOS_INTEIROS_METRICS)
    @pytest.mark.parametrize("valor", [True, False])
    def test_campo_inteiro_rejeita_bool(self, campo, valor):
        with pytest.raises(ValidationError):
            Metrics(**{campo: valor})

    @pytest.mark.parametrize("campo", CAMPOS_INTEIROS_METRICS)
    def test_campo_inteiro_continua_aceitando_int_valido(self, campo):
        m = Metrics(**{campo: 10})
        assert getattr(m, campo) == 10

    def test_learning_phase_continua_aceitando_bool(self):
        m = Metrics(learning_phase=True)
        assert m.learning_phase is True
        m2 = Metrics(learning_phase=False)
        assert m2.learning_phase is False

    def test_campos_opcionais_continuam_aceitando_none(self):
        m = Metrics()
        for campo in CAMPOS_INTEIROS_METRICS:
            assert getattr(m, campo) is None

    def test_ge_zero_continua_valendo_para_inteiros(self):
        with pytest.raises(ValidationError):
            Metrics(impressions=-1)


class TestCampaignRejeitaBooleano:
    @pytest.mark.parametrize("valor", [True, False])
    def test_id_rejeita_bool(self, valor):
        with pytest.raises(ValidationError):
            Campaign(id=valor, name="x")

    def test_id_continua_aceitando_int_valido(self):
        c = Campaign(id=42, name="x")
        assert c.id == 42


class TestTargetsRejeitaBooleano:
    @pytest.mark.parametrize("valor", [True, False])
    def test_min_weekly_conversions_rejeita_bool(self, valor):
        with pytest.raises(ValidationError):
            Targets(min_weekly_conversions=valor)

    def test_min_weekly_conversions_continua_aceitando_int_valido(self):
        t = Targets(min_weekly_conversions=50)
        assert t.min_weekly_conversions == 50

    def test_gt_zero_continua_valendo(self):
        with pytest.raises(ValidationError):
            Targets(min_weekly_conversions=0)

    def test_campos_float_de_targets_nao_sao_afetados(self):
        # min_roas é float — o escopo da correção é só campo inteiro; não
        # deve virar estrito por acidente para outros tipos.
        t = Targets(min_roas=3)
        assert t.min_roas == 3.0


class TestEndpointAnalyzeRejeitaBooleano:
    def _payload(self, **campaign_overrides):
        campaign = {"id": 1, "name": "API Test"}
        campaign.update(campaign_overrides)
        return {
            "campaign": campaign,
            "metrics": {"impressions": 80000, "spend": 2000.0},
            "targets": {},
        }

    def test_id_bool_no_endpoint_e_422_nao_500(self):
        r = client.post("/api/v1/campaign/analyze", json=self._payload(id=True))
        assert r.status_code == 422
        body = r.json()  # não pode estourar ao serializar
        assert body["detail"][0]["loc"] == ["body", "campaign", "id"]

    def test_metrica_bool_no_endpoint_e_422_nao_500(self):
        payload = self._payload()
        payload["metrics"]["reach"] = False
        r = client.post("/api/v1/campaign/analyze", json=payload)
        assert r.status_code == 422
        body = r.json()
        assert body["detail"][0]["loc"] == ["body", "metrics", "reach"]

    def test_learning_phase_bool_no_endpoint_continua_200(self):
        payload = self._payload()
        payload["metrics"]["learning_phase"] = True
        r = client.post("/api/v1/campaign/analyze", json=payload)
        assert r.status_code == 200

    def test_payload_valido_continua_200(self):
        r = client.post("/api/v1/campaign/analyze", json=self._payload())
        assert r.status_code == 200


class TestCampanhaEntradaRejeitaBooleano:
    """
    `CampanhaEntrada` (POST/PUT via id de `app/routes/campanhas_salvas.py`)
    ficou fora da varredura original — achado da revisão Opus de 2026-09-04.
    """

    # Campanha no formato que a gravação exige desde P5 (2026-09-09) — ver
    # app/service/campaign_payload.py. Estes testes são sobre o `id`/`client_id`
    # da requisição, não sobre o payload: ele só precisa ser válido para o
    # `id=true` chegar a ser avaliado.
    VM = {
        "id": 1000, "name": "Black Friday", "platform": "Meta Ads",
        "status": "GREEN", "score": 92, "invest": 0.0, "revenue": 0,
        "roasNum": None, "cpaNum": None, "ctrNum": None, "freqNum": None,
        "m1": {"k": "CPA", "v": "—"}, "m2": {"k": "CTR Link", "v": "—"},
        "spark": [92], "trend": 0, "ai": "", "summary": "s", "opportunity": "o",
        "primaryAction": "a", "tiles": [], "scenarios": [], "actions": [], "sugg": [],
    }

    @pytest.fixture
    def base(self, tmp_path, monkeypatch):
        caminho = tmp_path / "teste.db"
        monkeypatch.setattr(settings, "DB_PATH", str(caminho))
        monkeypatch.setattr(storage, "_iniciado", False)
        yield caminho
        monkeypatch.setattr(storage, "_iniciado", False)

    @pytest.mark.parametrize("valor", [True, False])
    def test_post_campaigns_com_id_bool_e_422_nao_500(self, base, valor):
        r = client.post(
            "/api/v1/campaigns",
            json={"payload": self.VM, "id": valor},
            headers={"X-Nex-Dono": "revisao"},
        )
        assert r.status_code == 422
        body = r.json()  # não pode estourar ao serializar
        assert body["detail"][0]["loc"] == ["body", "id"]

    def test_ataque_com_id_true_nao_sobrescreve_campanha_legitima(self, base):
        """Reprodução exata do achado do Opus: id=true não pode sobrescrever id=1."""
        dono = {"X-Nex-Dono": "revisao"}
        legitima = client.post(
            "/api/v1/campaigns", json={"payload": self.VM}, headers=dono
        )
        assert legitima.json()["id"] == 1

        ataque = client.post(
            "/api/v1/campaigns", json={"payload": {**self.VM, "name": "Rascunho vazio"}, "id": True}, headers=dono
        )
        assert ataque.status_code == 422

        campanhas = client.get("/api/v1/campaigns", headers=dono).json()["campanhas"]
        assert len(campanhas) == 1
        assert campanhas[0]["payload"] == self.VM

    def test_client_id_bool_tambem_e_422(self, base):
        # client_id é str, não int — bool também não deveria ser aceito, mas
        # por ser tipo errado (não pela regra de booleano em inteiro).
        r = client.post(
            "/api/v1/campaigns",
            json={"payload": self.VM, "client_id": True},
            headers={"X-Nex-Dono": "revisao"},
        )
        assert r.status_code == 422

    def test_id_valido_continua_atualizando_normalmente(self, base):
        dono = {"X-Nex-Dono": "revisao"}
        criada = client.post(
            "/api/v1/campaigns",
            json={"payload": {**self.VM, "name": "v1", "score": 10, "status": "RED"}},
            headers=dono,
        )
        campanha_id = criada.json()["id"]

        atualizada = client.post(
            "/api/v1/campaigns",
            json={"payload": {**self.VM, "name": "v2", "score": 20, "status": "YELLOW"}, "id": campanha_id},
            headers=dono,
        )
        assert atualizada.status_code == 200
        assert atualizada.json()["id"] == campanha_id

        campanhas = client.get("/api/v1/campaigns", headers=dono).json()["campanhas"]
        assert len(campanhas) == 1
        assert campanhas[0]["payload"] == {**self.VM, "name": "v2", "score": 20, "status": "YELLOW"}

    def test_criacao_sem_id_continua_funcionando(self, base):
        r = client.post(
            "/api/v1/campaigns",
            json={"payload": {**self.VM, "name": "nova", "score": 50}},
            headers={"X-Nex-Dono": "revisao"},
        )
        assert r.status_code == 200
        assert isinstance(r.json()["id"], int)
