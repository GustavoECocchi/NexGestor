"""
NexGestor — Testes do Escalonamento de Status por Evidência Métrica
=====================================================================
Cobre as correções de inteligência do engine:

  1. final_status = pior entre (status por cenários) e (status por evidência)
     — campanha com dano financeiro observado não pode sair "mais verde"
       só porque a cobertura de dados impediu detectores críticos de disparar.
  2. Detector E escala para priority=1 quando >=2 sinais corroborantes
     confirmam dano financeiro ativo (CPA estourado, CTR caindo, CPM subindo).
  3. score_coverage / score_confidence — % do peso avaliado e faixa de confiança.
  4. Nota de diagnóstico parcial no summary — lista métricas RED sem causa raiz
     confirmada e orienta quais dados enviar.
  5. Regressões: campanha saudável e escala-G isolada continuam GREEN.

Executar:
  pytest test_status_escalation.py -v
"""

import sys
sys.path.insert(0, ".")

from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service.service import analyze_campaign, _score_confidence
from app.enum.campaign import CampaignStatus, ScenarioCode


def run(metrics: Metrics, targets: Targets, name: str = "Teste"):
    data = AnalyzeInput(
        campaign=Campaign(id=1, name=name),
        metrics=metrics,
        targets=targets,
    )
    return analyze_campaign(data)


# ─────────────────────────────────────────────────────────────────────────────
# CASO REAL — payload "Black Friday" que expôs o bug (YELLOW com score 29)
# ─────────────────────────────────────────────────────────────────────────────

class TestCasoBlackFriday:
    """Payload exato que retornava YELLOW/E-priority-2 apesar de 4 métricas RED."""

    def _run(self):
        return run(
            Metrics(ctr_link=0.7, roas=1.1, cpa=92, cpm=70, frequency=3.4),
            Targets(max_cpa=60, min_roas=2.5),
            name="Black Friday — Conversão",
        )

    def test_final_status_escala_para_red(self):
        """ROAS 1.1x + CPA 53% estourado + score 29 → RED, não YELLOW."""
        r = self._run()
        assert r.final_status == CampaignStatus.RED

    def test_cenario_e_vira_prioridade_1(self):
        """Fadiga com 3 sinais corroborantes (CTR, CPA, CPM) = crítico."""
        r = self._run()
        e = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert e.priority == 1

    def test_coverage_e_confidence(self):
        """Pesos avaliados: CTR .12 + ROAS .20 + CPA .25 + CPM .05 + Freq .07 = 69%."""
        r = self._run()
        assert r.score_coverage == 69
        assert r.score_confidence == "medium"

    def test_summary_aponta_diagnostico_parcial(self):
        """ROAS crítico sem cenário que o explique → nota parcial com orientação."""
        r = self._run()
        assert "parcial" in r.summary.lower()
        assert "ROAS" in r.summary
        # Métricas já explicadas pelo Cenário E não entram na nota
        nota = r.summary.split("parcial", 1)[1]
        assert "CPA" not in nota

    def test_overall_score_inalterado(self):
        """A correção muda status/prioridade, não o cálculo do score."""
        r = self._run()
        assert r.overall_score == 29


# ─────────────────────────────────────────────────────────────────────────────
# ESCALONAMENTO POR EVIDÊNCIA — casos além do payload real
# ─────────────────────────────────────────────────────────────────────────────

class TestEscalonamentoPorEvidencia:
    def test_tres_reds_ponderadas_forcam_red_sem_cenario_critico(self):
        """>=3 métricas ponderadas em RED força RED mesmo sem cenário priority=1."""
        r = run(
            Metrics(ctr_link=0.5, roas=0.9, cpc=9.0),
            Targets(min_roas=3.0, max_cpc=4.0),
        )
        reds = [e for e in r.metric_evaluations if e.status == CampaignStatus.RED]
        assert len(reds) >= 3
        assert r.final_status == CampaignStatus.RED

    def test_score_muito_baixo_forca_red(self):
        """overall_score < 40 escala para RED mesmo com poucas métricas."""
        r = run(
            Metrics(roas=0.8),
            Targets(min_roas=3.0),
        )
        assert r.overall_score < 40
        assert r.final_status == CampaignStatus.RED

    def test_uma_red_ponderada_gera_no_minimo_yellow(self):
        """1 métrica RED com peso não pode passar como GREEN."""
        r = run(
            Metrics(
                hook_rate=40.0, hold_rate=17.0, ctr_link=1.8,
                frequency=1.5, cpm=90.0,  # CPM RED isolada
            ),
            Targets(),
        )
        cpm_ev = next(e for e in r.metric_evaluations if e.metric == "CPM")
        assert cpm_ev.status == CampaignStatus.RED
        assert r.final_status != CampaignStatus.GREEN

    def test_metricas_informativas_nao_escalam_status(self):
        """CTR Todos / Conversões-semana (peso 0) em RED não forçam escalonamento."""
        r = run(
            Metrics(
                hook_rate=40.0, hold_rate=17.0, ctr_link=1.8,
                ctr_all=2.0, frequency=1.5, cpm=30.0,
                weekly_conversions=60, learning_phase=False,
            ),
            Targets(),
        )
        assert r.final_status == CampaignStatus.GREEN


# ─────────────────────────────────────────────────────────────────────────────
# DETECTOR E — escalonamento por corroboração
# ─────────────────────────────────────────────────────────────────────────────

class TestDetectorECorroboracao:
    def test_fadiga_sem_sinais_permanece_priority_2(self):
        """Frequência acima do limite mas SEM dano financeiro = ponto de atenção."""
        r = run(
            Metrics(frequency=3.0, ctr_link=1.8, cpa=50.0, cpm=30.0),
            Targets(max_cpa=80.0),
        )
        e = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert e.priority == 2

    def test_fadiga_com_um_sinal_permanece_priority_2(self):
        """1 sinal isolado ainda não confirma dano ativo."""
        r = run(
            Metrics(frequency=3.0, ctr_link=0.9, cpa=50.0, cpm=30.0),
            Targets(max_cpa=80.0),
        )
        e = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert e.priority == 2

    def test_fadiga_com_dois_sinais_escala_para_priority_1(self):
        """2 sinais corroborantes (CTR caindo + CPA estourado) = crítico."""
        r = run(
            Metrics(frequency=3.0, ctr_link=0.9, cpa=95.0, cpm=30.0),
            Targets(max_cpa=80.0),
        )
        e = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert e.priority == 1
        assert r.final_status == CampaignStatus.RED

    def test_frequencia_extrema_continua_priority_1(self):
        """Regra original preservada: freq > 80% do limite crítico = crítico."""
        r = run(
            Metrics(frequency=5.0, ctr_link=1.8, cpa=50.0, cpm=30.0),
            Targets(max_cpa=80.0),
        )
        e = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert e.priority == 1


# ─────────────────────────────────────────────────────────────────────────────
# COVERAGE / CONFIDENCE
# ─────────────────────────────────────────────────────────────────────────────

class TestCoverageConfidence:
    def test_cobertura_total(self):
        """Todas as métricas ponderadas presentes → coverage 100 / high."""
        r = run(
            Metrics(
                hook_rate=40.0, hold_rate=17.0, ctr_link=1.8,
                cpa=40.0, cpl=10.0, roas=4.0, cpc=2.0,
                lp_conversion_rate=3.0, frequency=1.5, cpm=30.0,
            ),
            Targets(max_cpa=80.0, min_roas=3.0, max_cpc=4.0, max_cpl=20.0),
        )
        assert r.score_coverage == 100
        assert r.score_confidence == "high"

    def test_cobertura_zero(self):
        """Nenhuma métrica avaliável → coverage 0 / low."""
        r = run(Metrics(), Targets())
        assert r.score_coverage == 0
        assert r.score_confidence == "low"

    def test_faixas_de_confianca(self):
        """Faixas da versão canônica: >=70 high, >=40 medium, <40 low."""
        assert _score_confidence(85) == "high"
        assert _score_confidence(70) == "high"
        assert _score_confidence(69) == "medium"
        assert _score_confidence(40) == "medium"
        assert _score_confidence(39) == "low"

    def test_coverage_ignora_informativas(self):
        """CTR Todos e Conversões/semana (peso 0) não contam na cobertura."""
        r = run(
            Metrics(ctr_all=2.0, weekly_conversions=60, learning_phase=False),
            Targets(),
        )
        assert r.score_coverage == 0


# ─────────────────────────────────────────────────────────────────────────────
# REGRESSÕES — comportamentos que NÃO podem mudar
# ─────────────────────────────────────────────────────────────────────────────

class TestRegressoes:
    def test_campanha_saudavel_continua_green(self):
        """Campanha saudável: sem reds, score alto → GREEN preservado."""
        r = run(
            Metrics(
                impressions=80000, spend=2000,
                video_views_3s=32000, thruplays=14000,
                link_clicks=1400, reach=70000,
                conversions=55, landing_page_views=1350,
                weekly_conversions=55, learning_phase=False, roas=4.5,
            ),
            Targets(max_cpa=50.0, min_roas=3.0),
        )
        assert r.final_status == CampaignStatus.GREEN
        assert r.overall_score >= 70

    def test_escala_g_isolada_continua_green(self):
        """Janela de escala sozinha (todas as métricas saudáveis) = GREEN."""
        r = run(
            Metrics(
                impressions=80000, spend=2000, conversions=60,
                link_clicks=2000, reach=70000, frequency=1.5,
                weekly_conversions=60, learning_phase=False,
                lp_conversion_rate=3.0, roas=5.0,
            ),
            Targets(max_cpa=50.0, min_roas=3.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in {s.code for s in r.scenarios}
        assert r.final_status == CampaignStatus.GREEN

    def test_summary_saudavel_sem_nota_parcial(self):
        """Sem métricas RED, a nota de diagnóstico parcial não aparece."""
        r = run(
            Metrics(hook_rate=40.0, ctr_link=1.8, frequency=1.5),
            Targets(),
        )
        assert "parcial" not in r.summary.lower()
