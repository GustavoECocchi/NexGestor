"""
NexGestor — Regressões da revisão de 2026-07-28
================================================

Arquivo NOVO, criado sem alterar nenhum teste existente. Os 109 testes
anteriores continuam valendo como rede de segurança do que já funcionava;
aqui entram apenas os casos que a suíte não exercitava.

Origem dos casos:
  • Avaliação externa (agente Codex) — achados NG-T01, NG-T03 e NG-T05.
  • Varredura própria em cima dela — NaN/-Infinity derrubando o handler de
    validação (HTTP 500), e a generalização do NG-T01 para a camada de IA e
    para o fallback mínimo.

O PONTO CEGO que explica por que 109 testes passavam com os bugs presentes:
todos os testes de detector davam a ele um payload RICO (impressões, gasto,
conversões, alcance, frequência, learning_phase, ROAS...). Cada cenário era
verificado em duas situações — "dispara com tudo presente" e "não dispara
quando a condição qualificadora é violada" — e nunca na terceira, que é
justamente onde o Cenário G falhava: "não dispara quando a evidência
corroborante está AUSENTE". Os testes desta classe cobrem essa terceira
situação para todos os detectores.

Executar: pytest test_regressao_20260728.py -v
"""

import itertools
import sys

import pytest

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from app.main import app
from app.enum.campaign import CampaignStatus, ScenarioCode
from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service.service import analyze_campaign

client = TestClient(app)


def run(metrics: Metrics, targets: Targets | None = None):
    """Roda o engine puro e devolve (resposta, conjunto de códigos detectados)."""
    data = AnalyzeInput(
        campaign=Campaign(id=1, name="Teste"),
        metrics=metrics,
        targets=targets or Targets(),
    )
    r = analyze_campaign(data)
    return r, {s.code for s in r.scenarios}


def post(payload: dict):
    return client.post("/api/v1/campaign/analyze", json=payload)


# ─────────────────────────────────────────────────────────────────────────────
# NG-T01 — Cenário G (escala vertical) exige evidência, não silêncio
#
# O detector recomendava AUMENTAR ORÇAMENTO tratando dado ausente como condição
# favorável (`m.frequency is None or ...`). Só CPA + meta de CPA já abria a
# janela, com 25% de cobertura. É o único dos onze detectores cujo gatilho é
# ausência de alarme — e ausência de dado não é ausência de alarme.
# ─────────────────────────────────────────────────────────────────────────────

class TestEscalaExigeEvidencia:
    def test_escala_nao_dispara_so_com_cpa(self):
        """Payload exato do relatório NG-T01: cpa=40, max_cpa=80, nada mais."""
        r, codes = run(Metrics(cpa=40.0), Targets(max_cpa=80.0))
        assert ScenarioCode.VERTICAL_SCALE not in codes
        assert "aumentar orçamento agora" not in r.primary_action.lower()

    def test_escala_nao_dispara_sem_frequencia(self):
        """Sem frequência não há como afirmar que a audiência não saturou."""
        _, codes = run(
            Metrics(cpa=40.0, learning_phase=False, roas=5.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes

    def test_escala_nao_dispara_sem_estado_de_aprendizado(self):
        """Sem learning_phase NEM conversões/semana, o algoritmo é desconhecido."""
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, roas=5.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes

    def test_escala_nao_dispara_sem_roas_quando_existe_meta_de_roas(self):
        """Se o gestor definiu meta de ROAS, ROAS ausente bloqueia a escala."""
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, learning_phase=False),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes

    def test_escala_dispara_sem_roas_quando_nao_ha_meta_de_roas(self):
        """
        Decisão explícita: sem meta de ROAS o dado não é exigido.
        Campanha de lead sem receita atribuída não fica impedida de escalar.
        """
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, learning_phase=False),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes

    def test_escala_dispara_com_evidencia_completa(self):
        """Guarda contra excesso de zelo: a correção não pode matar o cenário."""
        r, codes = run(
            Metrics(cpa=40.0, frequency=1.2, learning_phase=False, roas=5.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes
        assert "aumentar orçamento" in r.primary_action.lower()

    def test_conversoes_semanais_substituem_a_flag_de_aprendizado(self):
        """Volume semanal suficiente é evidência equivalente ao learning_phase=False."""
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, weekly_conversions=80),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes

    def test_volume_semanal_insuficiente_nao_abre_escala(self):
        """Poucas conversões → aprendizado limitado (I), que suprime a escala."""
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, weekly_conversions=5),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes
        assert ScenarioCode.LEARNING_PHASE in codes

    def test_summary_explica_o_que_falta_em_vez_de_calar(self):
        """
        Não basta parar de recomendar: o gestor precisa saber que existe CPA
        folgado e o que enviar para avaliar escala com segurança.
        """
        r, _ = run(Metrics(cpa=40.0), Targets(max_cpa=80.0))
        s = r.summary.lower()
        assert "janela de escala" in s
        assert "frequência" in s and "aprendizado" in s

    def test_nota_de_escala_bloqueada_some_quando_ha_evidencia(self):
        r, _ = run(
            Metrics(cpa=40.0, frequency=1.2, learning_phase=False),
            Targets(max_cpa=80.0),
        )
        assert "sem evidência suficiente" not in r.summary.lower()

    def test_cpa_alto_nao_gera_nota_de_escala(self):
        """A nota só faz sentido quando o CPA realmente tem folga."""
        r, _ = run(Metrics(cpa=79.0), Targets(max_cpa=80.0))
        assert "janela de escala" not in r.summary.lower()


class TestFallbackMinimoNaoRecomendaEscala:
    """
    O fallback mínimo (engine vazio + IA indisponível) fechava com "considerar
    expansão de orçamento" — mesma recomendação financeira do Cenário G, pela
    mesma porta dos fundos, sem passar por nenhuma verificação de evidência.
    """

    def test_fallback_sem_evidencia_pede_dados_em_vez_de_mandar_escalar(self):
        r = post({
            "campaign": {"id": 1, "name": "So CPA"},
            "metrics": {"cpa": 40},
            "targets": {"max_cpa": 80},
        })
        assert r.status_code == 200
        acao = r.json()["primary_action"].lower()
        assert "expansão de orçamento" not in acao
        assert "envie" in acao

    def test_fallback_com_evidencia_completa_mantem_sugestao_de_escala(self):
        r = post({
            "campaign": {"id": 1, "name": "Completa"},
            "metrics": {"hook_rate": 40, "ctr_link": 2.0, "frequency": 1.2,
                        "learning_phase": False},
            "targets": {},
        })
        assert r.status_code == 200
        assert "escalar" in r.json()["primary_action"].lower()


# ─────────────────────────────────────────────────────────────────────────────
# Varredura de payloads esparsos — o ponto cego da suíte antiga
#
# Nenhum detector pode disparar recomendação de AUMENTAR ORÇAMENTO a partir de
# um payload mínimo, e nenhum payload esparso pode levantar exceção. O fuzz
# anterior (60k payloads em 2026-07-26) sorteava payloads RICOS: pegava crashes,
# mas não pegava "conclusão forte a partir de pouca informação".
# ─────────────────────────────────────────────────────────────────────────────

_CAMPOS_ESPARSOS = {
    "cpa": 40.0, "cpl": 10.0, "roas": 6.0, "cpm": 20.0, "cpc": 1.0,
    "hook_rate": 45.0, "hold_rate": 20.0, "ctr_link": 2.0, "ctr_all": 2.5,
    "lp_conversion_rate": 3.0, "frequency": 1.2, "weekly_conversions": 80,
    "learning_phase": False, "impressions": 10000, "reach": 9000,
    "spend": 500.0, "conversions": 20, "link_clicks": 200,
}


class TestPayloadsEsparsos:
    @pytest.mark.parametrize("campos", [
        c for n in (1, 2) for c in itertools.combinations(sorted(_CAMPOS_ESPARSOS), n)
    ])
    def test_nenhum_payload_esparso_levanta_excecao(self, campos):
        run(Metrics(**{k: _CAMPOS_ESPARSOS[k] for k in campos}), Targets(max_cpa=80.0))

    @pytest.mark.parametrize("campos", [
        c for n in (1, 2, 3) for c in itertools.combinations(sorted(_CAMPOS_ESPARSOS), n)
    ])
    def test_escala_so_com_evidencia_completa_em_qualquer_combinacao(self, campos):
        """
        Para QUALQUER subconjunto de até 3 métricas: se o Cenário G apareceu,
        então frequência e estado de aprendizado estavam entre elas.
        """
        m = Metrics(**{k: _CAMPOS_ESPARSOS[k] for k in campos})
        _, codes = run(m, Targets(max_cpa=80.0, min_roas=3.0))
        if ScenarioCode.VERTICAL_SCALE in codes:
            tem_freq = "frequency" in campos or {"impressions", "reach"} <= set(campos)
            tem_aprendizado = "learning_phase" in campos or "weekly_conversions" in campos
            assert tem_freq, f"G disparou sem frequência: {campos}"
            assert tem_aprendizado, f"G disparou sem estado de aprendizado: {campos}"
            assert "roas" in campos, f"G disparou sem ROAS com meta de ROAS: {campos}"


# ─────────────────────────────────────────────────────────────────────────────
# Achado próprio — valores não-finitos
#
# NaN e -Infinity chegavam ao handler de validação do FastAPI, que devolve o
# input recebido dentro do 422. `json.dumps` recusa NaN, e o erro estourava na
# RENDERIZAÇÃO da resposta, depois de qualquer try/except: HTTP 500 sem corpo,
# escondendo do cliente qual campo estava errado. Infinity, por sua vez, passava
# pelo `ge=0`, contaminava as métricas derivadas e virava `"value": null`.
# ─────────────────────────────────────────────────────────────────────────────

class TestValoresNaoFinitos:
    @pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
    def test_nao_finito_em_metrica_retorna_422_com_corpo_json(self, literal):
        r = client.post(
            "/api/v1/campaign/analyze",
            content=(
                '{"campaign":{"id":1,"name":"X"},'
                f'"metrics":{{"cpa":{literal}}},"targets":{{}}}}'
            ).encode(),
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 422, f"{literal} deveria ser 422, veio {r.status_code}"
        assert r.json()["detail"], "o 422 precisa dizer qual campo falhou"

    @pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
    def test_nao_finito_em_target_retorna_422(self, literal):
        r = client.post(
            "/api/v1/campaign/analyze",
            content=(
                '{"campaign":{"id":1,"name":"X"},"metrics":{"cpa":10},'
                f'"targets":{{"max_cpa":{literal}}}}}'
            ).encode(),
            headers={"content-type": "application/json"},
        )
        assert r.status_code == 422

    def test_metrica_derivada_nunca_transborda_para_null(self):
        """
        NG-T05, a metade que o schema NÃO resolve: aqui a entrada é finita
        (spend=1e308, impressions=1) e o estouro acontece na DERIVAÇÃO, já
        dentro do engine. A resposta trazia `"metric": "CPM", "value": null,
        "status": "RED"` — uma métrica que se diz avaliada e crítica, sem
        número nenhum. Métrica que não dá para calcular não entra na resposta.
        """
        r = post({
            "campaign": {"id": 1, "name": "X"},
            "metrics": {"impressions": 1, "spend": 1e308},
            "targets": {},
        })
        assert r.status_code == 200
        valores = [e["value"] for e in r.json()["metric_evaluations"]]
        assert None not in valores, "nenhuma métrica avaliada pode vir sem valor"
        assert not any(e["metric"] == "CPM" for e in r.json()["metric_evaluations"])

    def test_valor_grande_porem_finito_continua_aceito(self):
        """A barreira é contra não-finitos, não contra números grandes legítimos."""
        r = post({
            "campaign": {"id": 1, "name": "X"},
            "metrics": {"impressions": 1_000_000, "spend": 1_000_000.0},
            "targets": {},
        })
        assert r.status_code == 200
        cpm = next(e for e in r.json()["metric_evaluations"] if e["metric"] == "CPM")
        assert cpm["value"] == 1000.0


# ─────────────────────────────────────────────────────────────────────────────
# NG-T03 — plataforma e objetivo são listas fechadas
#
# Eram `Optional[str]` livres, com os valores válidos só na descrição. Um typo
# passava com 200 e o frontend, que só reconhece "google_ads", exibia a campanha
# como Meta Ads: atribuição errada de plataforma apresentada como fato.
# ─────────────────────────────────────────────────────────────────────────────

class TestEnumsDeContexto:
    @pytest.mark.parametrize("campo,valor", [
        ("platform", "googel_ads"),
        ("platform", "pinterest_ads"),
        ("objective", "banana"),
        ("objective", "conversions"),
    ])
    def test_valor_fora_da_lista_rejeitado(self, campo, valor):
        r = post({
            "campaign": {"id": 1, "name": "X", campo: valor},
            "metrics": {"cpa": 10}, "targets": {},
        })
        assert r.status_code == 422
        assert campo in str(r.json()["detail"])

    @pytest.mark.parametrize("platform", ["meta_ads", "google_ads", "tiktok_ads", "linkedin_ads"])
    def test_plataformas_validas_aceitas(self, platform):
        r = post({
            "campaign": {"id": 1, "name": "X", "platform": platform},
            "metrics": {"cpa": 10}, "targets": {},
        })
        assert r.status_code == 200

    @pytest.mark.parametrize("objective", ["conversion", "lead", "traffic"])
    def test_objetivos_validos_aceitos(self, objective):
        r = post({
            "campaign": {"id": 1, "name": "X", "objective": objective},
            "metrics": {"cpa": 10}, "targets": {},
        })
        assert r.status_code == 200

    def test_campos_ausentes_usam_default(self):
        r = post({"campaign": {"id": 1, "name": "X"}, "metrics": {"cpa": 10}, "targets": {}})
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Dívida antiga do CLAUDE.md: `if valor` tratando 0 como ausente
#
# Já tinha causado um HTTP 500 (Cenário F, 2026-07-26). O padrão continuava no
# pré-processamento, onde silenciava métricas derivadas em vez de estourar —
# defeito mais discreto e por isso mais duradouro.
# ─────────────────────────────────────────────────────────────────────────────

class TestZeroEValorMedido:
    def test_gasto_zero_ainda_deriva_cpm(self):
        """Campanha recém-ligada (spend=0) tem CPM 0, não CPM ausente."""
        r, _ = run(Metrics(impressions=10000, spend=0.0))
        cpm = next((e for e in r.metric_evaluations if e.metric == "CPM"), None)
        assert cpm is not None, "spend=0 não pode apagar o CPM"
        assert cpm.value == 0.0

    def test_gasto_zero_ainda_deriva_cpc(self):
        # CPC só é AVALIADO quando existe max_cpc — sem o target, a derivação
        # acontece mas não vira MetricEvaluation (comportamento correto e antigo).
        r, _ = run(
            Metrics(impressions=10000, spend=0.0, link_clicks=100),
            Targets(max_cpc=5.0),
        )
        cpc = next((e for e in r.metric_evaluations if e.metric == "CPC"), None)
        assert cpc is not None and cpc.value == 0.0

    def test_gasto_zero_ainda_deriva_cpa(self):
        r, _ = run(Metrics(spend=0.0, conversions=10), Targets(max_cpa=50.0))
        cpa = next((e for e in r.metric_evaluations if e.metric == "CPA"), None)
        assert cpa is not None and cpa.value == 0.0

    def test_conversoes_zero_nao_deriva_cpa(self):
        """Divisão por zero continua barrada — o guard de denominador é legítimo."""
        r, _ = run(Metrics(spend=100.0, conversions=0), Targets(max_cpa=50.0))
        assert not any(e.metric == "CPA" for e in r.metric_evaluations)

    def test_alcance_zero_nao_deriva_frequencia(self):
        r, _ = run(Metrics(impressions=1000, reach=0))
        assert not any(e.metric == "Frequência" for e in r.metric_evaluations)

    def test_cpa_zero_e_evidencia_valida_para_escala(self):
        """CPA 0 é o melhor CPA possível, não um CPA faltando."""
        r, codes = run(
            Metrics(cpa=0.0, frequency=1.0, learning_phase=False),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.VERTICAL_SCALE)
        assert "R$0.00" in cenario.root_cause

    def test_frequencia_zero_aparece_no_texto_do_cenario(self):
        """`if m.frequency` omitia a frase de evidência quando a frequência era 0."""
        r, codes = run(
            Metrics(cpa=10.0, frequency=0.0, learning_phase=False),
            Targets(max_cpa=80.0),
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.VERTICAL_SCALE)
        assert "Frequência 0.0" in cenario.root_cause


# ─────────────────────────────────────────────────────────────────────────────
# Camada de IA — a mesma regra de evidência do engine
#
# O modo principal instrui a IA a "identificar oportunidades" quando o engine
# não achou nada. Sem saber quanto do quadro está vendo, ela poderia recomendar
# escala exatamente nos dados em que o engine se recusa a fazê-lo.
# ─────────────────────────────────────────────────────────────────────────────

class TestPromptInformaCobertura:
    def _prompt(self, coverage, confidence):
        from app.service.prompts import build_user_prompt
        return build_user_prompt(
            metrics=Metrics(cpa=40.0),
            targets=Targets(max_cpa=80.0),
            campaign=Campaign(id=1, name="X"),
            engine_scenarios=[],
            metric_evaluations=[],
            coverage=coverage,
            confidence=confidence,
        )

    def test_prompt_declara_cobertura_e_confianca(self):
        p = self._prompt(25, "low")
        assert "25%" in p and "low" in p
        assert "DESCONHECIDO" in p

    def test_cobertura_baixa_proibe_recomendar_orcamento(self):
        p = self._prompt(25, "low")
        assert "NÃO recomende aumento de orçamento" in p

    def test_cobertura_alta_nao_carrega_a_proibicao(self):
        p = self._prompt(85, "high")
        assert "NÃO recomende aumento de orçamento" not in p
        assert "85%" in p

    def test_prompt_sem_cobertura_continua_valido(self):
        """Compatibilidade: chamadas antigas sem os parâmetros novos não quebram."""
        p = self._prompt(None, None)
        assert "COBERTURA DOS DADOS" not in p
        assert "MÉTRICAS RECEBIDAS" in p
