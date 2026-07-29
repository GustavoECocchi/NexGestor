"""
NexGestor — Cenários L–O e revisão do prompt (2026-07-28, parte 2)
==================================================================

Arquivo NOVO. Nenhum teste anterior removido; `test_engine.py` teve apenas o
teste do catálogo endurecido (de "total == 11" para "catálogo == enum").

Como estas lacunas foram encontradas: rodando situações comuns de tráfego pago
contra o engine e lendo o que ele respondia. As cinco piores respostas eram
todas variações de "Manter campanha ativa. Monitorar métricas nas próximas 48h."
em cima de problema real. Cada teste de "antes" abaixo documenta a resposta
antiga, para que a regressão seja reconhecível se alguém reverter a regra.
"""

import sys

import pytest

sys.path.insert(0, ".")

from app.enum.campaign import CampaignStatus, ScenarioCode
from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service.service import analyze_campaign


def run(metrics: Metrics, targets: Targets | None = None):
    r = analyze_campaign(AnalyzeInput(
        campaign=Campaign(id=1, name="Teste"),
        metrics=metrics,
        targets=targets or Targets(),
    ))
    return r, {s.code for s in r.scenarios}


# ─────────────────────────────────────────────────────────────────────────────
# Cenário L — Gasto sem Retorno
#
# Antes: R$2.000 gastos, 1.600 cliques, ZERO conversão devolvia
# "Manter campanha ativa. Monitorar métricas nas próximas 48h." com score 84.
# Sem conversão o CPA não é derivável, então nenhum detector de custo disparava
# e o caso mais doloroso do mundo real ficava sem nome.
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioL:
    def test_detecta_gasto_sem_conversao(self):
        r, codes = run(
            Metrics(impressions=80000, spend=2000, reach=60000, link_clicks=1600,
                    conversions=0, landing_page_views=1500),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.NO_RETURN in codes
        assert r.final_status == CampaignStatus.RED
        assert "pausar" in r.primary_action.lower()

    def test_nao_acusa_campanha_que_nao_envia_conversao(self):
        """conversions=None (campanha de tráfego/awareness) não é acusada."""
        _, codes = run(
            Metrics(impressions=80000, spend=2000, link_clicks=1600),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.NO_RETURN not in codes

    def test_nao_acusa_gasto_pequeno_com_meta_de_cpa(self):
        """Gasto abaixo de um CPA-meta ainda não deveria ter gerado conversão."""
        _, codes = run(
            Metrics(impressions=5000, spend=30.0, link_clicks=120, conversions=0),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.NO_RETURN not in codes

    def test_sem_meta_de_cpa_usa_volume_de_cliques(self):
        _, codes = run(Metrics(impressions=40000, spend=500.0, link_clicks=400, conversions=0))
        assert ScenarioCode.NO_RETURN in codes

    def test_sem_meta_de_cpa_e_poucos_cliques_nao_dispara(self):
        _, codes = run(Metrics(impressions=2000, spend=50.0, link_clicks=20, conversions=0))
        assert ScenarioCode.NO_RETURN not in codes

    def test_texto_cita_o_valor_perdido(self):
        r, _ = run(
            Metrics(impressions=80000, spend=2000, link_clicks=1600, conversions=0),
            Targets(max_cpa=80.0),
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.NO_RETURN)
        assert "R$2000.00" in cenario.root_cause
        assert "1600 cliques" in cenario.root_cause

    def test_L_suprime_M(self):
        """Zero conversão é o diagnóstico; 'amostra pequena' ao lado suavizaria."""
        _, codes = run(
            Metrics(impressions=80000, spend=2000, link_clicks=1600, conversions=0),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.NO_RETURN in codes
        assert ScenarioCode.LOW_SAMPLE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# Cenário M — Amostra Insuficiente
#
# Antes: 2 conversões com todas as métricas "ótimas" devolvia score 100, status
# GREEN + Cenário G, e ação primária "aumentar orçamento agora". Duas conversões
# não sustentam afirmação nenhuma sobre CPA.
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioM:
    def test_duas_conversoes_nao_viram_janela_de_escala(self):
        r, codes = run(
            Metrics(impressions=3000, spend=100.0, reach=2800, link_clicks=60,
                    conversions=2, landing_page_views=58, frequency=1.07,
                    learning_phase=False),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.LOW_SAMPLE in codes
        assert ScenarioCode.VERTICAL_SCALE not in codes
        assert "aumentar orçamento" not in r.primary_action.lower()

    def test_confianca_cai_para_low_mesmo_com_cobertura_boa(self):
        """Cobertura e amostra são eixos distintos; a mais fraca manda."""
        r, _ = run(
            Metrics(impressions=3000, spend=100.0, reach=2800, link_clicks=60,
                    conversions=2, landing_page_views=58, frequency=1.07,
                    hook_rate=45.0, hold_rate=25.0, ctr_link=2.0, roas=6.0,
                    learning_phase=False),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert r.score_coverage >= 70, "cobertura alta é premissa deste teste"
        assert r.score_confidence == "low"

    def test_volume_intermediario_limita_confianca_a_medium(self):
        r, _ = run(
            Metrics(impressions=80000, spend=1000.0, reach=60000, link_clicks=2000,
                    conversions=20, landing_page_views=1900, frequency=1.3,
                    hook_rate=45.0, hold_rate=25.0, ctr_link=2.5, roas=6.0,
                    learning_phase=False),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert r.score_confidence == "medium"

    def test_volume_alto_nao_limita_confianca(self):
        r, _ = run(
            Metrics(impressions=80000, spend=2000.0, reach=60000, link_clicks=2000,
                    conversions=50, landing_page_views=1900, frequency=1.2,
                    hook_rate=45.0, hold_rate=25.0, ctr_link=2.5, roas=6.0,
                    learning_phase=False, weekly_conversions=60, cpm=25.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert r.score_confidence == "high"
        assert ScenarioCode.VERTICAL_SCALE in {s.code for s in r.scenarios}

    def test_prioridade_3_nao_pinta_a_campanha_de_vermelho(self):
        """Amostra pequena é limite do que dá para afirmar, não falha da campanha."""
        r, _ = run(
            Metrics(impressions=3000, spend=100.0, conversions=2, frequency=1.07),
            Targets(max_cpa=80.0),
        )
        assert r.final_status != CampaignStatus.RED

    def test_texto_mostra_a_fragilidade_do_cpa(self):
        r, _ = run(
            Metrics(impressions=3000, spend=100.0, conversions=2),
            Targets(max_cpa=80.0),
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LOW_SAMPLE)
        # CPA = 100/2 = 50; com uma conversão a mais seria 100/3 = 33.33
        assert "R$50.00" in cenario.root_cause
        assert "R$33.33" in cenario.root_cause


# ─────────────────────────────────────────────────────────────────────────────
# Cenário N — Vazamento entre Clique e Página
#
# Antes: 1.600 cliques → 300 visitas (81% perdidos) devolvia status Saudável e
# nenhum cenário. É o vazamento mais caro e mais invisível do funil.
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioN:
    def test_detecta_vazamento_grave(self):
        r, codes = run(
            Metrics(impressions=80000, spend=2000, link_clicks=1600,
                    landing_page_views=300, conversions=20, frequency=1.3),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.CLICK_LEAK in codes
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.CLICK_LEAK)
        assert cenario.priority == 1
        assert "81%" in cenario.root_cause

    def test_perda_moderada_e_urgente_nao_critica(self):
        """40% de perda: sintoma real, mas não colapso."""
        _, codes = run(Metrics(link_clicks=1000, landing_page_views=600, spend=500.0))
        r, _ = run(Metrics(link_clicks=1000, landing_page_views=600, spend=500.0))
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.CLICK_LEAK)
        assert cenario.priority == 2

    def test_perda_normal_nao_dispara(self):
        """15% de perda é esperado (clique duplo, desistência no carregamento)."""
        _, codes = run(Metrics(link_clicks=1000, landing_page_views=850, spend=500.0))
        assert ScenarioCode.CLICK_LEAK not in codes

    def test_volume_baixo_de_cliques_nao_dispara(self):
        """Com poucos cliques a proporção é ruído."""
        _, codes = run(Metrics(link_clicks=20, landing_page_views=4, spend=50.0))
        assert ScenarioCode.CLICK_LEAK not in codes

    def test_sem_lp_views_nao_dispara(self):
        _, codes = run(Metrics(link_clicks=1000, spend=500.0))
        assert ScenarioCode.CLICK_LEAK not in codes

    def test_quantifica_o_desperdicio_em_reais(self):
        r, _ = run(Metrics(link_clicks=1000, landing_page_views=300, spend=1000.0))
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.CLICK_LEAK)
        assert "R$700.00" in cenario.root_cause  # 700 cliques perdidos × R$1,00


# ─────────────────────────────────────────────────────────────────────────────
# Cenário O — Receita Abaixo da Meta com Custo sob Controle
#
# Antes: ROAS 1,2x contra meta 3,0x com CPA dentro do teto devolvia
# "monitorar" — o ROAS ficava vermelho no semáforo sem nenhuma causa raiz.
# ─────────────────────────────────────────────────────────────────────────────

class TestCenarioO:
    def test_detecta_roas_baixo_com_cpa_ok(self):
        r, codes = run(
            Metrics(impressions=80000, spend=2000, link_clicks=2000, conversions=40,
                    landing_page_views=1900, roas=1.2, frequency=1.3, learning_phase=False),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.LOW_REVENUE in codes
        assert "valor por conversão" in r.primary_action

    def test_nao_dispara_quando_o_cpa_tambem_estourou(self):
        """CPA alto + ROAS baixo é problema de mídia — outro diagnóstico."""
        _, codes = run(
            Metrics(spend=2000, conversions=10, roas=1.2, cpa=200.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.LOW_REVENUE not in codes

    def test_nao_dispara_com_roas_na_meta(self):
        _, codes = run(
            Metrics(spend=2000, conversions=40, roas=4.0, cpa=50.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        assert ScenarioCode.LOW_REVENUE not in codes

    def test_roas_muito_abaixo_e_critico(self):
        r, _ = run(
            Metrics(spend=2000, conversions=40, roas=1.0, cpa=50.0),
            Targets(max_cpa=80.0, min_roas=3.0),
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LOW_REVENUE)
        assert cenario.priority == 1

    def test_calcula_o_ticket_que_fecharia_a_meta(self):
        r, _ = run(
            Metrics(spend=1000.0, conversions=10, roas=1.0, cpa=100.0),
            Targets(max_cpa=200.0, min_roas=3.0),
        )
        cenario = next(s for s in r.scenarios if s.code == ScenarioCode.LOW_REVENUE)
        assert "R$100.00" in cenario.root_cause   # ticket atual: 1000×1,0/10
        assert "R$300.00" in cenario.root_cause   # ticket alvo: 1000×3,0/10

    def test_sem_meta_de_roas_nao_dispara(self):
        _, codes = run(
            Metrics(spend=2000, conversions=40, roas=1.2, cpa=50.0),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.LOW_REVENUE not in codes


# ─────────────────────────────────────────────────────────────────────────────
# Escala não abre com leilão caro
#
# Antes: CPM 3x acima do teto com CPA ainda dentro da meta abria janela de
# escala. Injetar orçamento num leilão caro compra impressão mais cara ainda.
# ─────────────────────────────────────────────────────────────────────────────

class TestEscalaELeilao:
    def test_cpm_acima_do_teto_bloqueia_escala(self):
        _, codes = run(
            Metrics(impressions=20000, spend=3000, reach=18000, link_clicks=400,
                    conversions=50, landing_page_views=390, frequency=1.1,
                    learning_phase=False),
            Targets(max_cpa=80.0, max_cpm=50.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes

    def test_cpm_dentro_do_teto_libera_escala(self):
        _, codes = run(
            Metrics(impressions=200000, spend=3000, reach=180000, link_clicks=4000,
                    conversions=50, landing_page_views=3900, frequency=1.1,
                    learning_phase=False),
            Targets(max_cpa=80.0, max_cpm=50.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes

    def test_cpm_ausente_nao_bloqueia(self):
        """Ausência de CPM não é evidência de leilão caro — só de CPM não enviado."""
        _, codes = run(
            Metrics(cpa=40.0, frequency=1.2, learning_phase=False, conversions=50),
            Targets(max_cpa=80.0),
        )
        assert ScenarioCode.VERTICAL_SCALE in codes


# ─────────────────────────────────────────────────────────────────────────────
# Revisão do prompt da IA
# ─────────────────────────────────────────────────────────────────────────────

class TestPromptRevisado:
    def _prompt(self, **kwargs):
        from app.service.prompts import build_user_prompt
        base = dict(
            metrics=Metrics(cpa=40.0, frequency=2.6, cpm=80.0),
            targets=Targets(max_cpa=80.0),
            campaign=Campaign(id=1, name="X"),
            engine_scenarios=[],
            metric_evaluations=[],
        )
        base.update(kwargs)
        return build_user_prompt(**base)

    def test_todos_os_targets_do_engine_chegam_a_ia(self):
        """Faltavam 7 dos 16 — a IA julgava sem conhecer os limiares usados."""
        from app.service.prompts import _TARGET_LABELS
        campos_do_engine = set(Targets.model_fields.keys())
        assert campos_do_engine <= set(_TARGET_LABELS), (
            f"target sem rótulo no prompt: {campos_do_engine - set(_TARGET_LABELS)}"
        )

    def test_prompt_marca_target_padrao_e_target_do_gestor(self):
        p = self._prompt()
        assert "CPA máximo: R$80.00 (definido pelo gestor)" in p
        assert "(padrão do sistema)" in p

    def test_prompt_proibe_inventar_benchmark(self):
        from app.service.prompts import SYSTEM_PROMPT
        assert "NÃO INVENTE" in SYSTEM_PROMPT
        assert "benchmark de mercado" in SYSTEM_PROMPT

    def test_prompt_nao_exige_mais_resposta_a_qualquer_custo(self):
        """A frase 'NUNCA deixe o usuário sem resposta' pressionava a inventar."""
        from app.service.prompts import SYSTEM_PROMPT
        assert "NUNCA deixe o usuário sem resposta" not in SYSTEM_PROMPT

    def test_avaliacoes_levam_a_meta_junto(self):
        from app.schema.schema import MetricEvaluation
        ev = MetricEvaluation(metric="CPA", value=92.0, status=CampaignStatus.RED,
                              score=0, note="Meta: <R$80.00. ✗ CPA 15% acima.")
        p = self._prompt(metric_evaluations=[ev])
        assert "Meta: <R$80.00" in p

    def test_google_ads_recebe_aviso_de_plataforma(self):
        p = self._prompt(campaign=Campaign(id=1, name="X", platform="google_ads"))
        assert "Google Ads" in p
        assert "Advantage+" in p

    def test_meta_ads_nao_recebe_o_aviso(self):
        p = self._prompt(campaign=Campaign(id=1, name="X", platform="meta_ads"))
        assert "Não recomende recursos exclusivos do Meta" not in p

    def test_tiktok_ads_recebe_aviso_de_plataforma(self):
        p = self._prompt(campaign=Campaign(id=1, name="X", platform="tiktok_ads"))
        assert "TikTok Ads" in p
        assert "Advantage+" in p

    def test_linkedin_ads_recebe_aviso_de_plataforma(self):
        p = self._prompt(campaign=Campaign(id=1, name="X", platform="linkedin_ads"))
        assert "LinkedIn Ads" in p
        assert "Advantage+" in p

    def test_cenarios_novos_estao_no_vocabulario_da_ia(self):
        from app.service.prompts import SYSTEM_PROMPT
        for termo in ["Gasto sem Retorno", "Amostra Insuficiente",
                      "Vazamento entre Clique e Página", "Receita Abaixo da Meta"]:
            assert termo in SYSTEM_PROMPT, f"{termo} ausente na referência da IA"


# ─────────────────────────────────────────────────────────────────────────────
# Os cinco casos que motivaram tudo isto — reproduzidos como regressão
# ─────────────────────────────────────────────────────────────────────────────

class TestOsCincoCasosReais:
    @pytest.mark.parametrize("nome,metrics,targets,codigo_esperado", [
        (
            "gastou e não vendeu",
            Metrics(impressions=80000, spend=2000, reach=60000, link_clicks=1600,
                    video_views_3s=32000, thruplays=14000, conversions=0,
                    landing_page_views=1500),
            Targets(max_cpa=80.0), ScenarioCode.NO_RETURN,
        ),
        (
            "amostra de 2 conversões",
            Metrics(impressions=3000, spend=100.0, reach=2800, link_clicks=60,
                    conversions=2, landing_page_views=58, frequency=1.07,
                    learning_phase=False),
            Targets(max_cpa=80.0), ScenarioCode.LOW_SAMPLE,
        ),
        (
            "vende mas não lucra",
            Metrics(impressions=80000, spend=2000, reach=60000, link_clicks=2000,
                    conversions=40, landing_page_views=1900, roas=1.2,
                    frequency=1.3, learning_phase=False),
            Targets(max_cpa=80.0, min_roas=3.0), ScenarioCode.LOW_REVENUE,
        ),
        (
            "clique que não vira visita",
            Metrics(impressions=80000, spend=2000, reach=60000, link_clicks=1600,
                    landing_page_views=300, conversions=20, frequency=1.3),
            Targets(max_cpa=80.0), ScenarioCode.CLICK_LEAK,
        ),
    ])
    def test_caso_real_recebe_diagnostico(self, nome, metrics, targets, codigo_esperado):
        r, codes = run(metrics, targets)
        assert codigo_esperado in codes, f"'{nome}' voltou a ficar sem diagnóstico"
        assert r.primary_action != "Manter campanha ativa. Monitorar métricas nas próximas 48h.", (
            f"'{nome}' recebeu a ação genérica de 'está tudo bem'"
        )

    def test_leilao_caro_nao_recebe_convite_para_escalar(self):
        """Quinto caso: aqui a correção é não dar conselho ruim, não um cenário novo."""
        r, codes = run(
            Metrics(impressions=20000, spend=3000, reach=18000, link_clicks=400,
                    conversions=50, landing_page_views=390, frequency=1.1,
                    learning_phase=False),
            Targets(max_cpa=80.0, max_cpm=50.0),
        )
        assert ScenarioCode.VERTICAL_SCALE not in codes
        assert "aumentar orçamento" not in r.primary_action.lower()
        # O CPM segue visível como métrica crítica, com causa no semáforo.
        cpm = next(e for e in r.metric_evaluations if e.metric == "CPM")
        assert cpm.status == CampaignStatus.RED
