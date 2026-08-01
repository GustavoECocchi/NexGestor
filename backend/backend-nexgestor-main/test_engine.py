"""
NexGestor — Testes Automatizados do Decision Engine
=====================================================
Cobertura:
  - Cenários A → K (detecção individual)
  - Cenário HEALTHY (campanha saudável sem alertas)
  - Regras de conflito e supressão (5 casos)
  - Pré-processamento de métricas derivadas
  - Rotas da API (response_model, 422, /scenarios)

Executar:
  pytest tests/test_engine.py -v
"""

import sys
import pytest

sys.path.insert(0, ".")

from fastapi.testclient import TestClient
from app.main import app
from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service.service import analyze_campaign
from app.enum.campaign import CampaignStatus, ScenarioCode

client = TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# FIXTURES — builders reutilizáveis
# ─────────────────────────────────────────────────────────────────────────────

def make_campaign(id: int = 1, name: str = "Teste") -> Campaign:
    return Campaign(id=id, name=name, objective="conversion", platform="meta_ads")


def make_targets(**kwargs) -> Targets:
    defaults = {"max_cpa": 80.0, "min_roas": 3.0}
    defaults.update(kwargs)
    return Targets(**defaults)


def run(metrics: Metrics, targets: Targets = None, name: str = "Teste") -> dict:
    """Helper: roda o engine e retorna (response, set de códigos detectados)."""
    t = targets or make_targets()
    data = AnalyzeInput(campaign=make_campaign(name=name), metrics=metrics, targets=t)
    result = analyze_campaign(data)
    codes = {s.code for s in result.scenarios}
    return result, codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO A — Gancho Fraco
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioA:
    def test_detecta_hook_rate_critico(self):
        """Hook Rate muito abaixo do target → Cenário A priority=1"""
        r, codes = run(Metrics(
            impressions=50000, spend=1500,
            video_views_3s=9000,   # hook_rate = 18% (target 35%)
            link_clicks=600, reach=42000,
        ))
        assert ScenarioCode.WEAK_HOOK in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.WEAK_HOOK)
        assert cenario.priority == 1
        assert r.final_status == CampaignStatus.RED

    def test_detecta_hook_rate_alerta(self):
        """Hook Rate entre 70% e 100% do target → Cenário A priority=2"""
        r, codes = run(Metrics(
            impressions=50000, spend=1500,
            video_views_3s=16000,  # hook_rate = 32% (entre 24.5% e 35%)
            link_clicks=600, reach=42000,
        ))
        assert ScenarioCode.WEAK_HOOK in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.WEAK_HOOK)
        assert cenario.priority == 2

    def test_nao_detecta_hook_rate_saudavel(self):
        """Hook Rate acima do target → Cenário A não dispara"""
        r, codes = run(Metrics(
            impressions=50000,
            video_views_3s=20000,  # hook_rate = 40% (acima de 35%)
            link_clicks=800, reach=42000, spend=1500,
        ))
        assert ScenarioCode.WEAK_HOOK not in codes

    def test_hook_calculado_dos_dados_brutos(self):
        """Engine calcula hook_rate de video_views_3s + impressions automaticamente"""
        r, codes = run(Metrics(
            impressions=100000,
            video_views_3s=20000,  # hook_rate = 20% — crítico
            spend=2000, reach=80000,
        ))
        hook_eval = next((e for e in r.metric_evaluations if e.metric == "Hook Rate"), None)
        assert hook_eval is not None
        assert hook_eval.value == 20.0


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO B — Retenção Baixa
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioB:
    def test_detecta_hold_rate_baixo_com_hook_ok(self):
        """Hook ok + Hold Rate < 10% → Cenário B priority=1"""
        r, codes = run(Metrics(
            impressions=50000, spend=1500,
            video_views_3s=20000,  # hook_rate = 40% ✓
            thruplays=3000,        # hold_rate = 6% ✗
            link_clicks=600, reach=42000,
        ))
        assert ScenarioCode.LOW_RETENTION in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LOW_RETENTION)
        assert cenario.priority == 1

    def test_nao_detecta_sem_hook_rate(self):
        """Sem hook_rate, Cenário B não pode ser avaliado"""
        r, codes = run(Metrics(
            impressions=50000, thruplays=3000,
            spend=1500, reach=42000,
        ))
        assert ScenarioCode.LOW_RETENTION not in codes

    def test_nao_detecta_hold_rate_saudavel(self):
        """Hold Rate >= 15% com Hook ok → Cenário B não dispara"""
        r, codes = run(Metrics(
            impressions=50000, spend=1500,
            video_views_3s=20000,  # hook_rate = 40% ✓
            thruplays=8000,        # hold_rate = 16% ✓
            link_clicks=900, reach=42000,
        ))
        assert ScenarioCode.LOW_RETENTION not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO C — Click-Bait
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioC:
    def test_detecta_click_bait(self):
        """CTR Todos > 3.5% e CTR Link < 0.7% → Cenário C"""
        r, codes = run(Metrics(
            impressions=100000,
            all_clicks=4000,   # ctr_all = 4.0% ✗
            link_clicks=500,   # ctr_link = 0.5% ✗
            spend=2000, reach=80000,
        ))
        assert ScenarioCode.CLICK_BAIT in codes
        assert r.final_status == CampaignStatus.RED

    def test_nao_detecta_ctr_all_alto_mas_link_ok(self):
        """CTR Todos alto mas CTR Link também alto → não é click-bait"""
        r, codes = run(Metrics(
            impressions=100000,
            all_clicks=4000,    # ctr_all = 4.0%
            link_clicks=2000,   # ctr_link = 2.0% ✓
            spend=2000, reach=80000,
        ))
        assert ScenarioCode.CLICK_BAIT not in codes

    def test_custo_por_engajamento_no_root_cause(self):
        """Custo por engajamento deve aparecer no root_cause quando spend disponível"""
        r, codes = run(Metrics(
            impressions=100000,
            all_clicks=4000, link_clicks=500,
            spend=2000, reach=80000,
        ))
        assert ScenarioCode.CLICK_BAIT in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.CLICK_BAIT)
        assert "R$" in cenario.root_cause


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO D — Desalinhamento com Landing Page
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioD:
    def test_detecta_lp_mismatch(self):
        """CTR Link excelente + LP conversion ruim → Cenário D"""
        r, codes = run(Metrics(
            impressions=80000, spend=2000,
            link_clicks=2000,          # ctr_link = 2.5% ✓ (> 1.5 * 1.5)
            conversions=5,
            landing_page_views=1900,   # lp_cvr = 0.26% ✗
            reach=65000,
        ))
        assert ScenarioCode.LP_MISMATCH in codes
        assert r.final_status == CampaignStatus.RED

    def test_nao_detecta_ctr_baixo(self):
        """CTR Link abaixo do threshold → não é problema de LP"""
        r, codes = run(Metrics(
            impressions=80000, spend=2000,
            link_clicks=800,           # ctr_link = 1.0% (abaixo de 1.5 * 1.5)
            conversions=5,
            landing_page_views=760,
            reach=65000,
        ))
        assert ScenarioCode.LP_MISMATCH not in codes

    def test_desperdicio_em_reais_no_root_cause(self):
        """Custo por visita à LP deve aparecer no root_cause"""
        r, codes = run(Metrics(
            impressions=80000, spend=3000,
            link_clicks=2000, conversions=5,
            landing_page_views=1900, reach=65000,
        ))
        assert ScenarioCode.LP_MISMATCH in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LP_MISMATCH)
        assert "R$" in cenario.root_cause


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO E — Fadiga de Criativo
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioE:
    def test_detecta_fadiga(self):
        """Frequência > 2.8 → Cenário E"""
        r, codes = run(Metrics(
            impressions=60000, spend=3000,
            link_clicks=500, reach=20000,  # frequency = 3.0
            cpa=95.0, weekly_conversions=30,
        ))
        assert ScenarioCode.CREATIVE_FATIGUE in codes

    def test_detecta_fadiga_critica(self):
        """Frequência > 80% do max_frequency_critical → priority=1"""
        r, codes = run(Metrics(
            impressions=90000, spend=3000,
            link_clicks=500, reach=18000,  # frequency = 5.0 (> 80% de 6.0)
            cpa=95.0,
        ))
        assert ScenarioCode.CREATIVE_FATIGUE in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.CREATIVE_FATIGUE)
        assert cenario.priority == 1

    def test_nao_detecta_frequencia_controlada(self):
        """Frequência <= 2.8 → Cenário E não dispara"""
        r, codes = run(Metrics(
            impressions=50000, spend=1500,
            link_clicks=800, reach=25000,  # frequency = 2.0
        ))
        assert ScenarioCode.CREATIVE_FATIGUE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO F — Lead Frio
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioF:
    def test_detecta_lead_frio(self):
        """CPA dentro da meta + LP conversion quase zero → Cenário F"""
        r, codes = run(Metrics(
            impressions=80000, spend=3000,
            link_clicks=1500, reach=65000,
            cpa=70.0,                  # dentro do max_cpa=80
            lp_conversion_rate=0.3,    # < 50% do min_lp_cvr (1.0)
        ))
        assert ScenarioCode.COLD_LEAD in codes

    def test_nao_detecta_sem_max_cpa(self):
        """Sem max_cpa no Targets → Cenário F não pode ser avaliado"""
        r, codes = run(
            Metrics(cpa=70.0, lp_conversion_rate=0.3, spend=1000, impressions=10000, reach=8000),
            targets=Targets()  # max_cpa=None
        )
        assert ScenarioCode.COLD_LEAD not in codes

    def test_nao_detecta_lp_ok(self):
        """CPA ok mas LP conversion saudável → não é lead frio"""
        r, codes = run(Metrics(
            impressions=80000, spend=3000,
            link_clicks=1500, reach=65000,
            cpa=70.0, lp_conversion_rate=2.5,
        ))
        assert ScenarioCode.COLD_LEAD not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO G — Escala Vertical
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioG:
    def test_detecta_janela_de_escala(self):
        """CPA 25%+ abaixo da meta + frequência controlada + ROAS ok → Cenário G"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000,
                conversions=60, link_clicks=2000,
                reach=70000, frequency=1.5,
                weekly_conversions=60, learning_phase=False,
                lp_conversion_rate=3.0, roas=5.0,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        assert ScenarioCode.VERTICAL_SCALE in codes
        assert r.final_status == CampaignStatus.GREEN  # escala sozinha não é RED

    def test_margem_exata_no_root_cause(self):
        """Percentual de margem abaixo da meta deve aparecer no root_cause"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000, conversions=60,
                link_clicks=2000, reach=70000, frequency=1.5,
                weekly_conversions=60, learning_phase=False,
                lp_conversion_rate=3.0, roas=5.0,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.VERTICAL_SCALE)
        assert "%" in cenario.root_cause

    def test_nao_detecta_cpa_acima_da_margem(self):
        """CPA acima de 75% da meta → não abre janela de escala"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=3500, conversions=50,
                link_clicks=2000, reach=70000, frequency=1.5,
                weekly_conversions=55, learning_phase=False,
            ),
            targets=make_targets(max_cpa=50.0)
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO H — Escala Horizontal
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioH:
    def test_detecta_fadiga_iminente(self):
        """Frequência > 2.5 + CPA ok + frequência <= 2.8 → Cenário H"""
        # weekly_conversions=55 para não disparar I (que suprimiria H)
        r, codes = run(
            Metrics(
                impressions=70000, spend=3000,
                link_clicks=1000, reach=26000,  # frequency = 2.69
                cpa=75.0, weekly_conversions=55,
                learning_phase=False,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.HORIZONTAL_SCALE in codes

    def test_nao_detecta_cpa_acima_da_meta(self):
        """Frequência alta mas CPA acima da meta → não recomendar escala horizontal"""
        r, codes = run(
            Metrics(
                impressions=70000, spend=3000,
                link_clicks=1000, reach=26000,  # frequency = 2.69
                cpa=95.0,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.HORIZONTAL_SCALE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO I — Learning Phase Hell
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioI:
    def test_detecta_por_flag_learning_phase(self):
        """learning_phase=True → Cenário I priority=1"""
        r, codes = run(Metrics(
            spend=800, weekly_conversions=12,
            learning_phase=True, cpa=66.0,
            impressions=10000, reach=8000,
        ))
        assert ScenarioCode.LEARNING_PHASE in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LEARNING_PHASE)
        assert cenario.priority == 1
        assert r.final_status == CampaignStatus.RED

    def test_detecta_por_volume_baixo(self):
        """weekly_conversions < 50 (sem flag) → Cenário I dispara"""
        r, codes = run(Metrics(
            spend=1500, weekly_conversions=20,
            learning_phase=False, cpa=75.0,
            impressions=20000, reach=16000,
        ))
        assert ScenarioCode.LEARNING_PHASE in codes

    def test_deficit_aparece_no_root_cause(self):
        """Déficit de conversões deve ser calculado e exibido no root_cause"""
        r, codes = run(Metrics(
            spend=800, weekly_conversions=12,
            learning_phase=True, impressions=10000, reach=8000,
        ))
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LEARNING_PHASE)
        assert "38" in cenario.root_cause  # deficit = 50 - 12 = 38

    def test_nao_detecta_volume_suficiente(self):
        """weekly_conversions >= 50 e learning_phase=False → Cenário I não dispara"""
        r, codes = run(Metrics(
            spend=2000, weekly_conversions=55,
            learning_phase=False, cpa=40.0,
            impressions=50000, reach=40000,
        ))
        assert ScenarioCode.LEARNING_PHASE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO J — Overspending sem Retorno
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioJ:
    def test_detecta_overspending(self):
        """CPM alto + LP saudável + CPA acima da meta → Cenário J"""
        r, codes = run(
            Metrics(
                impressions=50000, spend=3500,
                link_clicks=1200, reach=42000,
                conversions=30, landing_page_views=1150,
                cpa=116.0, lp_conversion_rate=2.6,
            ),
            targets=make_targets(max_cpa=80.0, max_cpm=50.0)
        )
        assert ScenarioCode.OVERSPENDING in codes

    def test_nao_detecta_cpm_dentro_do_teto(self):
        """CPM dentro do teto → Cenário J não dispara"""
        r, codes = run(
            Metrics(
                impressions=100000, spend=3000,  # cpm = 30 ✓
                link_clicks=1200, reach=80000,
                conversions=30, landing_page_views=1150,
                cpa=100.0, lp_conversion_rate=2.6,
            ),
            targets=make_targets(max_cpa=80.0, max_cpm=50.0)
        )
        assert ScenarioCode.OVERSPENDING not in codes

    def test_economia_estimada_no_root_cause(self):
        """CPA estimado com redução de 15% deve aparecer no root_cause"""
        r, codes = run(
            Metrics(
                impressions=50000, spend=3500,
                link_clicks=1200, reach=42000,
                conversions=30, landing_page_views=1150,
                cpa=116.0, lp_conversion_rate=2.6,
            ),
            targets=make_targets(max_cpa=80.0, max_cpm=50.0)
        )
        cenario = next((s for s in r.scenarios if s.code == ScenarioCode.OVERSPENDING), None)
        if cenario:
            assert "R$" in cenario.root_cause


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO K — Canibalização de Retargeting
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioK:
    def test_detecta_canibalizacao(self):
        """ROAS > 10x + frequência > 6 → Cenário K"""
        r, codes = run(Metrics(
            impressions=30000, spend=500,
            link_clicks=200, reach=4500,   # frequency = 6.67
            roas=12.0, cpa=16.0,
            conversions=31,
        ))
        assert ScenarioCode.RETARGETING_CANNIBAL in codes
        assert r.final_status == CampaignStatus.RED

    def test_nao_detecta_frequencia_controlada(self):
        """ROAS alto mas frequência baixa → não é canibalização"""
        r, codes = run(Metrics(
            impressions=30000, spend=500,
            link_clicks=900, reach=20000,  # frequency = 1.5
            roas=12.0, conversions=31,
        ))
        assert ScenarioCode.RETARGETING_CANNIBAL not in codes

    def test_nao_detecta_roas_normal(self):
        """Frequência alta mas ROAS normal → não é canibalização"""
        r, codes = run(Metrics(
            impressions=30000, spend=2000,
            link_clicks=200, reach=4500,   # frequency = 6.67
            roas=4.0, conversions=31,
        ))
        assert ScenarioCode.RETARGETING_CANNIBAL not in codes


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIO HEALTHY — Campanha Saudável
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioHealthy:
    def test_campanha_saudavel_sem_cenarios(self):
        """Todas as métricas dentro dos targets → sem cenários, status GREEN"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000,
                video_views_3s=32000,   # hook_rate = 40% ✓
                thruplays=14000,        # hold_rate = 17.5% ✓
                link_clicks=1400,       # ctr_link = 1.75% ✓
                all_clicks=1800,        # ctr_all = 2.25% ✓
                reach=70000,            # frequency = 1.14 ✓
                conversions=55,
                landing_page_views=1350,  # lp_cvr = 4.07% ✓
                weekly_conversions=55,  # ✓
                learning_phase=False,
                roas=4.5,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        assert not codes or codes == {ScenarioCode.VERTICAL_SCALE}
        assert r.final_status in {CampaignStatus.GREEN}
        assert r.overall_score >= 70

    def test_summary_sem_problemas(self):
        """Campanha saudável deve retornar summary genérico de monitoramento"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000,
                video_views_3s=32000, thruplays=14000,
                link_clicks=1400, reach=70000,
                conversions=55, landing_page_views=1350,
                weekly_conversions=55, learning_phase=False,
            ),
            targets=make_targets(max_cpa=50.0)
        )
        non_scale = [s for s in r.scenarios if s.code != ScenarioCode.VERTICAL_SCALE]
        if not non_scale:
            assert "monitoramento" in r.summary.lower() or "prioridade" in r.summary.lower() or "escala" in r.summary.lower()


# ─────────────────────────────────────────────────────────────────────────────
# REGRAS DE CONFLITO E SUPRESSÃO
# ─────────────────────────────────────────────────────────────────────────────

class TestConflictRules:
    def test_I_suprime_G(self):
        """Learning Phase (I) suprime Escala Vertical (G)"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000, conversions=60,
                link_clicks=2000, reach=70000, frequency=1.5,
                weekly_conversions=8, learning_phase=True,
                lp_conversion_rate=3.0, roas=5.0,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        assert ScenarioCode.LEARNING_PHASE in codes
        assert ScenarioCode.VERTICAL_SCALE not in codes

    def test_I_suprime_H(self):
        """Learning Phase (I) suprime Escala Horizontal (H)"""
        r, codes = run(
            Metrics(
                impressions=70000, spend=3000,
                link_clicks=1000, reach=26000,
                cpa=75.0, weekly_conversions=8,
                learning_phase=True,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.LEARNING_PHASE in codes
        assert ScenarioCode.HORIZONTAL_SCALE not in codes

    def test_E_suprime_H(self):
        """Fadiga Plena (E) suprime Escala Horizontal (H)"""
        r, codes = run(
            Metrics(
                impressions=60000, spend=3000,
                link_clicks=500, reach=20000,  # frequency = 3.0
                cpa=75.0, weekly_conversions=30,
                learning_phase=False,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.CREATIVE_FATIGUE in codes
        assert ScenarioCode.HORIZONTAL_SCALE not in codes

    def test_D_suprime_F(self):
        """LP Mismatch (D) suprime Lead Frio (F)"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000,
                link_clicks=2000, reach=70000,
                conversions=5, landing_page_views=1900,
                cpa=400.0, lp_conversion_rate=0.26,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.LP_MISMATCH in codes
        assert ScenarioCode.COLD_LEAD not in codes

    def test_A_suprime_B(self):
        """Gancho Fraco (A) suprime Retenção Baixa (B)"""
        r, codes = run(
            Metrics(
                impressions=50000, spend=1500,
                video_views_3s=9000,   # hook_rate = 18% — crítico
                thruplays=3000,        # hold_rate = 6% — também ruim
                link_clicks=600, reach=42000,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert ScenarioCode.WEAK_HOOK in codes
        assert ScenarioCode.LOW_RETENTION not in codes

    def test_G_e_H_sao_exclusivos(self):
        """Escala Vertical (G) e Horizontal (H) não coexistem"""
        r, codes = run(
            Metrics(
                impressions=80000, spend=2000, conversions=60,
                link_clicks=2000, reach=60000,   # frequency = 1.33 — G condições ok
                weekly_conversions=60, learning_phase=False,
                lp_conversion_rate=3.0, roas=5.0,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        assert not (ScenarioCode.VERTICAL_SCALE in codes and ScenarioCode.HORIZONTAL_SCALE in codes)


# ─────────────────────────────────────────────────────────────────────────────
# PRÉ-PROCESSAMENTO — Métricas Derivadas
# ─────────────────────────────────────────────────────────────────────────────

class TestPreprocessamento:
    def test_calcula_hook_rate(self):
        """hook_rate = video_views_3s / impressions * 100"""
        r, _ = run(Metrics(impressions=100000, video_views_3s=25000, spend=1000, reach=80000))
        ev = next((e for e in r.metric_evaluations if e.metric == "Hook Rate"), None)
        assert ev is not None
        assert ev.value == pytest.approx(25.0)

    def test_calcula_hold_rate(self):
        """hold_rate = thruplays / impressions * 100"""
        r, _ = run(Metrics(impressions=100000, video_views_3s=40000, thruplays=18000, spend=1000, reach=80000))
        ev = next((e for e in r.metric_evaluations if e.metric == "Hold Rate"), None)
        assert ev is not None
        assert ev.value == pytest.approx(18.0)

    def test_calcula_ctr_link(self):
        """ctr_link = link_clicks / impressions * 100"""
        r, _ = run(Metrics(impressions=100000, link_clicks=2000, spend=1000, reach=80000))
        ev = next((e for e in r.metric_evaluations if e.metric == "CTR Link"), None)
        assert ev is not None
        assert ev.value == pytest.approx(2.0)

    def test_calcula_frequency(self):
        """frequency = impressions / reach"""
        r, _ = run(Metrics(impressions=60000, reach=20000, spend=1000, link_clicks=500))
        ev = next((e for e in r.metric_evaluations if e.metric == "Frequência"), None)
        assert ev is not None
        assert ev.value == pytest.approx(3.0)

    def test_calcula_cpa(self):
        """cpa = spend / conversions"""
        r, _ = run(
            Metrics(impressions=50000, spend=2000, conversions=25, reach=40000, link_clicks=500),
            targets=make_targets(max_cpa=100.0)
        )
        ev = next((e for e in r.metric_evaluations if e.metric == "CPA"), None)
        assert ev is not None
        assert ev.value == pytest.approx(80.0)

    def test_calcula_lp_conversion_rate(self):
        """lp_conversion_rate = conversions / landing_page_views * 100"""
        r, _ = run(Metrics(
            impressions=80000, spend=2000,
            link_clicks=2000, conversions=40,
            landing_page_views=1800, reach=65000,
        ))
        ev = next((e for e in r.metric_evaluations if e.metric == "Conversão LP"), None)
        assert ev is not None
        assert ev.value == pytest.approx(40 / 1800 * 100, rel=0.01)


# ─────────────────────────────────────────────────────────────────────────────
# SCORE E OVERALL SCORE
# ─────────────────────────────────────────────────────────────────────────────

class TestScore:
    def test_overall_score_campanha_saudavel(self):
        """Campanha saudável deve ter overall_score >= 70"""
        r, _ = run(
            Metrics(
                impressions=80000, spend=2000,
                video_views_3s=32000, thruplays=14000,
                link_clicks=1400, reach=70000,
                conversions=55, landing_page_views=1350,
                weekly_conversions=55, learning_phase=False, roas=4.5,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0)
        )
        assert r.overall_score >= 70

    def test_overall_score_campanha_critica(self):
        """Campanha crítica deve ter overall_score < 60"""
        r, _ = run(
            Metrics(
                impressions=50000, spend=4000,
                video_views_3s=8000, link_clicks=300,
                reach=15000, conversions=10,
                learning_phase=True, weekly_conversions=10,
            ),
            targets=make_targets(max_cpa=80.0)
        )
        assert r.overall_score < 60

    def test_cada_metrica_tem_score_0_100(self):
        """Todos os scores individuais devem estar entre 0 e 100"""
        r, _ = run(
            Metrics(
                impressions=50000, spend=5000,
                video_views_3s=5000, thruplays=1000,
                link_clicks=200, all_clicks=5000,
                reach=15000, conversions=5,
                landing_page_views=190, weekly_conversions=5,
                roas=0.5,
            ),
            targets=make_targets(max_cpa=80.0, min_roas=3.0, max_cpc=5.0)
        )
        for ev in r.metric_evaluations:
            assert 0 <= ev.score <= 100, f"Score fora do intervalo: {ev.metric} = {ev.score}"

    def test_coverage_baixo_quando_poucas_metricas(self):
        """Poucos dados → score pode ser alto, mas coverage baixo e confiança 'low'."""
        r, _ = run(
            Metrics(impressions=100000, reach=80000, spend=500),  # só CPM e Frequência derivam
            targets=make_targets(max_cpa=None, min_roas=None),
        )
        assert r.score_coverage < 40, f"coverage deveria ser baixo: {r.score_coverage}"
        assert r.score_confidence == "low"

    def test_coverage_alto_quando_metricas_completas(self):
        """Campanha completa → coverage alto e confiança 'high'."""
        r, _ = run(
            Metrics(
                impressions=80000, spend=2000,
                video_views_3s=32000, thruplays=14000,
                link_clicks=1400, reach=70000,
                conversions=55, landing_page_views=1350,
                weekly_conversions=55, learning_phase=False, roas=4.5,
            ),
            targets=make_targets(max_cpa=50.0, min_roas=3.0, max_cpc=5.0),
        )
        assert r.score_coverage >= 70, f"coverage deveria ser alto: {r.score_coverage}"
        assert r.score_confidence == "high"

    def test_coverage_sempre_0_a_100(self):
        """coverage nunca sai de 0–100."""
        r, _ = run(Metrics(impressions=1000, reach=800, spend=50.0))
        assert 0 <= r.score_coverage <= 100

    def test_frequencia_red_alinhada_ao_detector_fadiga(self):
        """REGRESSÃO: semáforo de Frequência fica RED no mesmo ponto que o Cenário E dispara."""
        # freq = 3.0 > max_frequency_fatigue (2.8): detector E dispara
        r, codes = run(
            Metrics(impressions=60000, reach=20000, spend=1000, link_clicks=400, cpa=60),
            targets=make_targets(max_cpa=80.0),
        )
        freq_ev = next(e for e in r.metric_evaluations if e.metric == "Frequência")
        assert ScenarioCode.CREATIVE_FATIGUE in codes, "Cenário E deveria disparar em freq=3.0"
        assert freq_ev.status == CampaignStatus.RED, (
            f"semáforo deveria ser RED (não {freq_ev.status.value}) — alinhado ao card de fadiga"
        )


# ─────────────────────────────────────────────────────────────────────────────
# ROTAS DA API
# ─────────────────────────────────────────────────────────────────────────────

class TestAPI:
    def test_post_analyze_retorna_200(self):
        """POST /analyze com payload válido retorna 200"""
        payload = {
            "campaign": {"id": 1, "name": "API Test"},
            "metrics": {
                "impressions": 80000, "spend": 2000.0,
                "video_views_3s": 30000, "thruplays": 13000,
                "link_clicks": 1200, "reach": 65000,
                "conversions": 40, "landing_page_views": 1150,
                "weekly_conversions": 40, "learning_phase": False,
            },
            "targets": {"max_cpa": 60.0, "min_roas": 3.0}
        }
        r = client.post("/api/v1/campaign/analyze", json=payload)
        assert r.status_code == 200
        body = r.json()
        assert "overall_score" in body
        assert "scenarios" in body
        assert "metric_evaluations" in body
        for ev in body["metric_evaluations"]:
            assert "score" in ev

    def test_post_analyze_payload_invalido_retorna_422(self):
        """POST /analyze com payload inválido retorna 422"""
        r = client.post("/api/v1/campaign/analyze", json={"campaign": {}, "metrics": {}, "targets": {}})
        assert r.status_code == 422

    def test_get_scenarios_retorna_11_cenarios(self):
        """
        GET /scenarios retorna o catálogo completo de cenários.

        Nasceu (2026) fixando o número 11. Em 2026-07-28 entraram os cenários
        L–O (gasto sem retorno, amostra insuficiente, vazamento de clique,
        receita abaixo da meta), então o número mudou — o teste não foi
        removido, foi tornado mais exigente: em vez de um total fixo que
        envelhece a cada cenário novo, ele agora exige que o catálogo cubra
        TODOS os códigos do enum. Assim, um detector adicionado sem entrada no
        catálogo quebra o teste, que é a regressão que interessa de verdade.
        """
        r = client.get("/api/v1/campaign/scenarios")
        assert r.status_code == 200
        body = r.json()
        codigos = [s["code"] for s in body["scenarios"]]

        for expected in ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]:
            assert expected in codigos, f"Cenário {expected} ausente no catálogo"

        do_enum = {c.value for c in ScenarioCode if c != ScenarioCode.HEALTHY}
        assert set(codigos) == do_enum, (
            f"catálogo fora de sincronia com o enum — só no enum: {do_enum - set(codigos)}; "
            f"só no catálogo: {set(codigos) - do_enum}"
        )
        assert body["total"] == len(codigos) == len(do_enum)

    def test_health_check_retorna_ok(self):
        """GET / retorna status ok"""
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_response_model_sem_campos_extras(self):
        """Response não deve conter campos fora do CampaignAnalysisResponse"""
        payload = {
            "campaign": {"id": 99, "name": "Schema Test"},
            "metrics": {"impressions": 50000, "spend": 1000.0, "reach": 40000},
            "targets": {}
        }
        r = client.post("/api/v1/campaign/analyze", json=payload)
        assert r.status_code == 200
        body = r.json()
        campos_esperados = {
            "campaign_id", "campaign_name", "final_status",
            "overall_score", "score_coverage", "score_confidence",
            "summary", "scenarios",
            "metric_evaluations", "primary_action",
            "ai_insights",   # NOVO — campo opcional da camada de IA
        }
        assert set(body.keys()) == campos_esperados


# ─────────────────────────────────────────────────────────────────────────────
# AUDITORIA — regressão dos itens operacionais corrigidos
# ─────────────────────────────────────────────────────────────────────────────

class TestAuditoriaFixes:
    """Trava as correções dos itens 5, 7, 9 da auditoria."""

    def test_cors_origins_aceita_virgula_separada(self):
        """Item 5: CORS_ORIGINS vírgula-separada não derruba o boot."""
        import os
        from app.core.config import Settings
        os.environ["CORS_ORIGINS"] = "http://a,http://b,chrome-extension://x"
        try:
            s = Settings()
            assert s.CORS_ORIGINS == ["http://a", "http://b", "chrome-extension://x"]
        finally:
            del os.environ["CORS_ORIGINS"]

    def test_cors_origins_aceita_json(self):
        """Item 5: CORS_ORIGINS em JSON continua funcionando."""
        import os
        from app.core.config import Settings
        os.environ["CORS_ORIGINS"] = '["http://a","http://b"]'
        try:
            s = Settings()
            assert s.CORS_ORIGINS == ["http://a", "http://b"]
        finally:
            del os.environ["CORS_ORIGINS"]

    def test_debug_default_false(self):
        """Item 7: DEBUG default seguro (False) no código."""
        from app.core.config import Settings
        import os
        # O default é do CÓDIGO, não do ambiente: _env_file=None ignora o .env
        # local (o de dev costuma ter DEBUG=True) e o pop tira a variável do SO.
        # Sem as duas coisas, um .env de conveniência gera falso-negativo aqui.
        old = os.environ.pop("DEBUG", None)
        try:
            assert Settings(_env_file=None).DEBUG is False
        finally:
            if old is not None:
                os.environ["DEBUG"] = old

    def test_name_vazio_rejeitado(self):
        """Item 9: name vazio retorna 422."""
        r = client.post("/api/v1/campaign/analyze",
                        json={"campaign": {"id": 1, "name": ""}, "metrics": {}, "targets": {}})
        assert r.status_code == 422

    def test_name_muito_longo_rejeitado(self):
        """Item 9: name acima de 200 chars retorna 422."""
        r = client.post("/api/v1/campaign/analyze",
                        json={"campaign": {"id": 1, "name": "x" * 300}, "metrics": {}, "targets": {}})
        assert r.status_code == 422


class TestAIServiceHelpers:
    """Trava as correções dos itens 4, 6, 8 (camada IA)."""

    def test_redact_key_mascara_api_key(self):
        """Item 6: _redact_key remove API keys do Google de mensagens."""
        from app.service.ai_service import _redact_key
        # A chave falsa é MONTADA em tempo de execução, de propósito: escrever uma
        # string no formato `AIza`+35 chars literalmente no arquivo faz o secret
        # scanning do GitHub abrir alerta de "Google API Key" — falso positivo que
        # gera ruído de segurança para a equipe. Assim o teste continua exercitando
        # o regex real de `_redact_key` sem nenhum literal detectável no repositório.
        chave_falsa = "AIza" + "F4KE" + "_" * 4 + "chave_sintetica_de_teste" + "_12"
        assert len(chave_falsa) == 39, "precisa ter o formato AIza + 35 chars"
        texto = f"erro na URL ?key={chave_falsa} ao chamar"
        red = _redact_key(texto)
        assert chave_falsa not in red
        assert "REDACTED" in red

    def test_get_client_recria_ao_mudar_key(self):
        """Item 4: _get_client recria o cliente quando a key muda."""
        from unittest.mock import patch, MagicMock
        import app.service.ai_service as ai

        calls = []

        class FakeGenai:
            class Client:
                def __init__(self, api_key=None):
                    calls.append(api_key)

        ai._client = None
        ai._client_key = None
        try:
            with patch.dict("sys.modules", {"google": MagicMock(genai=FakeGenai),
                                            "google.genai": FakeGenai}):
                with patch.object(ai.settings, "GEMINI_API_KEY", "key-AAA"):
                    ai._get_client()
                    ai._get_client()  # mesma key → não recria
                with patch.object(ai.settings, "GEMINI_API_KEY", "key-BBB"):
                    ai._get_client()  # key nova → recria
            assert calls == ["key-AAA", "key-BBB"]
        finally:
            ai._client = None
            ai._client_key = None


# ─────────────────────────────────────────────────────────────────────────────
# REGRESSÃO — bugs encontrados na revisão de 2026-07-26
# ─────────────────────────────────────────────────────────────────────────────

class TestRegressaoRevisao20260726:
    """
    Protege duas correções no engine. Ambos os bugs eram alcançáveis por payload
    válido (aceito pelo schema), não por input malformado.
    """

    def test_cold_lead_nao_quebra_com_cpa_zero(self):
        """
        CPA=0 é valor válido (schema usa ge=0) mas é falsy em Python. O texto do
        Cenário F escolhia o ramo CPA/CPL com `if m.cpa`, então CPA=0 caía no ramo
        do CPL e formatava None → TypeError → HTTP 500.
        """
        m = Metrics(cpa=0.0, lp_conversion_rate=0.0)   # sem cpl/max_cpl
        result, codes = run(m, make_targets(max_cpa=10.0))
        assert ScenarioCode.COLD_LEAD in codes
        cenario = next(s for s in result.scenarios if s.code == ScenarioCode.COLD_LEAD)
        assert "CPA R$0.00" in cenario.root_cause

    def test_cold_lead_descreve_o_sinal_que_realmente_qualificou(self):
        """
        Quando o CPA está ACIMA do teto e quem qualifica o cenário é o CPL, o texto
        precisa falar do CPL. Antes dizia "CPA R$100.00 dentro do teto de R$10.00" —
        afirmação factualmente falsa dentro do diagnóstico.
        """
        m = Metrics(cpa=100.0, cpl=5.0, lp_conversion_rate=0.1)
        t = make_targets(max_cpa=10.0, max_cpl=20.0, min_lp_conversion_rate=1.0)
        result, codes = run(m, t)
        assert ScenarioCode.COLD_LEAD in codes
        causa = next(s for s in result.scenarios if s.code == ScenarioCode.COLD_LEAD).root_cause
        assert "CPL R$5.00" in causa
        assert "CPA R$100.00 dentro do teto" not in causa

    def test_hold_rate_acima_da_meta_nunca_e_red(self):
        """
        O limiar de RED do Hold Rate era fixo em 10. Com min_hold_rate abaixo de 10,
        o RED ficava ACIMA da meta e invertia o semáforo: um valor que SUPERA a meta
        do gestor saía RED com score 100 (crítico e perfeito ao mesmo tempo).
        """
        result, _ = run(Metrics(hold_rate=7.0), make_targets(min_hold_rate=5.0))
        ev = next(e for e in result.metric_evaluations if e.metric == "Hold Rate")
        assert ev.status != CampaignStatus.RED, "valor acima da meta não pode ser RED"
        assert ev.score == 100

    def test_hold_rate_mantem_piso_de_10_no_default(self):
        """Não-regressão: com a meta default (15), o limiar de RED continua em 10."""
        vermelho, _ = run(Metrics(hold_rate=9.9), make_targets())
        amarelo, _ = run(Metrics(hold_rate=10.1), make_targets())
        assert next(e for e in vermelho.metric_evaluations
                    if e.metric == "Hold Rate").status == CampaignStatus.RED
        assert next(e for e in amarelo.metric_evaluations
                    if e.metric == "Hold Rate").status == CampaignStatus.YELLOW


# ─────────────────────────────────────────────────────────────────────────────
# REGRESSÃO — simulação do fluxo do testador (2026-08-01)
# ─────────────────────────────────────────────────────────────────────────────
class TestRegressaoSimulacaoTestador20260801:
    """
    Achado ao simular o preenchimento típico de um gestor: só gasto, conversões
    e CPA, com meta de CPA definida.
    """

    def test_metrica_amarela_nunca_sai_como_saudavel(self):
        """
        `_resolve_final_status` só escalava o status por métricas RED ou por score
        abaixo de 60. Uma métrica YELLOW isolada com score >= 60 não escalava nada,
        então a campanha voltava GREEN — rotulada "Saudável" na UI — enquanto o card
        da métrica ficava amarelo dizendo "⚠ CPA 25% acima da meta".

        Contradição visível na mesma tela: o veredito diz saudável, a evidência diz
        que a meta do gestor foi estourada. Medido antes da correção: CPA até 25%
        acima da meta (score 64) saía "Saudável".
        """
        for cpa, pct in [(44.0, 10), (48.0, 20), (50.0, 25)]:
            result, _ = run(
                Metrics(spend=500.0, conversions=10, cpa=cpa),
                make_targets(max_cpa=40.0),
            )
            ev = next(e for e in result.metric_evaluations if e.metric == "CPA")
            assert ev.status == CampaignStatus.YELLOW, f"CPA {pct}% acima deveria ser YELLOW"
            assert result.final_status != CampaignStatus.GREEN, (
                f"CPA {pct}% acima da meta não pode sair como 'Saudável' "
                f"(status={result.final_status}, score={result.overall_score})"
            )

    def test_metrica_dentro_da_meta_continua_saudavel(self):
        """Não-regressão: a correção não pode pintar de amarelo quem está na meta."""
        result, _ = run(
            Metrics(spend=500.0, conversions=10, cpa=40.0),
            make_targets(max_cpa=40.0),
        )
        assert result.final_status == CampaignStatus.GREEN
        assert result.overall_score == 100

    def test_campanha_saudavel_completa_segue_verde_e_escalavel(self):
        """
        Não-regressão da janela de escala: campanha com todas as métricas saudáveis
        continua GREEN (a UI depende disso para exibir o estado "escalável").
        """
        result, codes = run(
            Metrics(
                impressions=200000, reach=90000, spend=3000.0, link_clicks=4000,
                landing_page_views=3600, ctr_link=2.0, cpa=35.0, roas=4.2,
                conversions=86, weekly_conversions=86, frequency=1.5,
                learning_phase=False, hook_rate=42.0, hold_rate=22.0, cpm=15.0,
            ),
            make_targets(max_cpa=60.0, min_roas=3.0, max_cpm=30.0),
        )
        assert result.final_status == CampaignStatus.GREEN
        assert ScenarioCode.VERTICAL_SCALE in codes


class TestPesoDosRedsDefineCritico20260801:
    """
    Calibração do status final: o critério de "crítico" contava métricas
    vermelhas e ignorava o peso delas. CPC+CPM em vermelho somam 0.08 do
    diagnóstico; CPA sozinho vale 0.25 e ROAS 0.20. Contando, os dois casos
    eram iguais — e CPA estourado saía "Atenção" enquanto o texto do próprio
    card dizia "campanha no vermelho".
    """

    # Os valores abaixo são escolhidos na faixa em que a métrica JÁ está em RED
    # mas o score geral ainda é >= 40 — a única faixa em que este critério muda
    # o resultado. Com valores mais extremos os testes passariam mesmo sem ele
    # (o score afundado já dispara o gatilho antigo) e não provariam nada.

    def test_cpa_vermelho_sozinho_e_critico(self):
        """CPA 31% acima da meta: métrica em RED, score 56 — antes saía 'Atenção'."""
        result, _ = run(Metrics(cpa=65.5), make_targets(max_cpa=50.0))
        cpa = next(e for e in result.metric_evaluations if e.metric == "CPA")
        assert cpa.status == CampaignStatus.RED
        assert result.overall_score >= 40, "fora da faixa que este critério cobre"
        # O texto do card afirma criticidade — o selo não pode dizer menos.
        assert "vermelho" in cpa.note
        assert result.final_status == CampaignStatus.RED

    def test_roas_vermelho_sozinho_e_critico(self):
        """ROAS 2.07x contra meta 3.0x: métrica em RED, score 56."""
        result, _ = run(Metrics(roas=2.07), Targets(min_roas=3.0))
        roas = next(e for e in result.metric_evaluations if e.metric == "ROAS")
        assert roas.status == CampaignStatus.RED
        assert result.overall_score >= 40, "fora da faixa que este critério cobre"
        assert "destruindo caixa" in roas.note
        assert result.final_status == CampaignStatus.RED

    def test_falha_dupla_de_criativo_e_critica_pela_via_de_cenario(self):
        """
        CTR Link (0.12) + Hook Rate (0.10) = 0.22 de peso, mas quem torna este
        caso crítico é o Cenário A (prioridade 1), não o critério de peso —
        varrendo as combinações de duas métricas, TODA falha dupla com peso
        >= 0.20 fora CPA/ROAS já dispara um cenário de prioridade 1.

        O teste fica como coerência (o selo não pode ficar abaixo do card), mas
        não serve de prova do critério de peso: passa com ele e sem ele.
        """
        result, codes = run(
            Metrics(ctr_link=0.49, hook_rate=17.4),
            Targets(min_ctr_link=1.0, min_hook_rate=25.0),
        )
        assert ScenarioCode.WEAK_HOOK in codes
        assert result.final_status == CampaignStatus.RED

    def test_custos_secundarios_sozinhos_seguem_atencao(self):
        """
        Não-regressão da calibração: CPC (0.03) + CPM (0.05) = 0.08 não
        caracteriza campanha crítica. Escalar isso inflacionaria o "Crítico"
        e o rótulo perderia significado.
        """
        result, _ = run(
            Metrics(cpc=2.0, cpm=40.0),
            Targets(max_cpc=1.5, max_cpm=30.0),
        )
        vermelhas = [e.metric for e in result.metric_evaluations
                     if e.status == CampaignStatus.RED]
        assert set(vermelhas) == {"CPC", "CPM"}, "o cenário precisa ter as 2 em RED"
        assert result.final_status == CampaignStatus.YELLOW

    def test_metrica_na_meta_continua_saudavel(self):
        """Não-regressão: a calibração não pode pintar de vermelho quem está na meta."""
        result, _ = run(Metrics(cpa=50.0), make_targets(max_cpa=50.0))
        assert result.final_status == CampaignStatus.GREEN


class TestResumoNaoContradizAsMetricas20260801:
    """
    O resumo sem cenário era um texto fixo: "Campanha operando dentro dos
    parâmetros esperados. Nenhum gargalo crítico identificado." Ele saía mesmo
    com métricas em vermelho — e a ressalva de cobertura não cobria o caso,
    porque só é emitida com cobertura abaixo de 100%.

    Pior instância encontrada: campanha com CPC, CPL e CPM críticos e cobertura
    de 100% saía com selo "Crítico", resumo dizendo que estava tudo dentro do
    esperado e ação "Manter campanha ativa".
    """

    # Todas as métricas presentes (cobertura 100%), saudáveis, menos os custos.
    CUSTOS_CRITICOS = dict(
        cpa=40.0, roas=5.0, ctr_link=2.0, hook_rate=40.0, hold_rate=25.0,
        lp_conversion_rate=5.0, frequency=1.2, cpm=90.0, cpc=9.0, cpl=300.0,
    )
    METAS = dict(
        max_cpa=50.0, min_roas=3.0, min_ctr_link=1.0, min_hook_rate=25.0,
        min_hold_rate=15.0, min_lp_conversion_rate=2.0, max_cpm=25.0,
        max_cpc=1.5, max_cpl=50.0,
    )

    def test_resumo_nao_diz_tudo_certo_com_metrica_critica(self):
        result, codes = run(Metrics(**self.CUSTOS_CRITICOS), Targets(**self.METAS))
        assert not codes, "o cenário precisa ser vazio para exercitar este caminho"
        assert result.score_coverage == 100, "sem cobertura cheia a ressalva mascararia o bug"
        criticas = [e.metric for e in result.metric_evaluations
                    if e.status == CampaignStatus.RED]
        assert criticas, "o cenário precisa ter métrica crítica"

        assert "dentro dos parâmetros esperados" not in result.summary
        assert "Nenhum gargalo crítico identificado. Manter" not in result.summary
        # e tem de nomear o que está crítico
        assert criticas[0] in result.summary

    def test_acao_principal_nao_manda_manter_com_metrica_critica(self):
        result, _ = run(Metrics(**self.CUSTOS_CRITICOS), Targets(**self.METAS))
        assert "Manter campanha ativa" not in result.primary_action
        assert "crítico" in result.primary_action.lower()

    def test_metrica_amarela_sem_cenario_tambem_aparece_no_resumo(self):
        result, codes = run(Metrics(cpa=55.0), make_targets(max_cpa=50.0))
        assert not codes
        assert "fora da meta" in result.summary
        assert "CPA" in result.summary
        assert "Manter campanha ativa" not in result.primary_action

    def test_campanha_realmente_saudavel_mantem_o_texto_original(self):
        """Não-regressão: sem métrica ruim, o texto positivo continua valendo."""
        result, codes = run(Metrics(cpa=30.0, roas=5.0),
                            make_targets(max_cpa=50.0, min_roas=3.0))
        assert not codes
        assert result.summary.startswith("Campanha operando dentro dos parâmetros esperados")
        assert result.primary_action.startswith("Manter campanha ativa")

    def test_lista_de_metricas_declara_o_que_foi_truncado(self):
        """
        A contagem e a lista não podem se contradizer: "6 métricas críticas:
        A, B, C" fazia a frase parecer completa listando metade.
        """
        from app.service.service import _lista_metricas

        class _Ev:
            def __init__(self, metric): self.metric = metric

        seis = [_Ev(x) for x in ["CPA", "ROAS", "CPC", "CPL", "CPM", "CTR Link"]]
        texto = _lista_metricas(seis, 4)
        assert texto == "CPA, ROAS, CPC, CPL e mais 2"

        tres = [_Ev(x) for x in ["CPA", "ROAS", "CPC"]]
        assert _lista_metricas(tres, 4) == "CPA, ROAS, CPC", "sem truncar não anuncia resto"
