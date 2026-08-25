# -*- coding: utf-8 -*-
"""
Regressão da varredura de 25/08/2026.

Contexto: a suíte tinha 1402 testes verdes e nenhum destes defeitos aparecia,
porque todos os testes usavam metas próximas do default (`min_ctr_link` nunca
abaixo de 1.0, `min_roas` nunca acima de 3.0). Os bugs viviam exatamente fora
dessa faixa — onde cai qualquer gestor que configure as próprias metas. Por
isso vários testes abaixo definem targets deliberadamente distantes do default:
é a região que o engine nunca tinha sido exercitado.

Duas famílias de defeito:

  1. TEXTO QUE AFIRMA COISA FALSA — o diagnóstico é lido como fato por quem não
     entende de tráfego pago. "deficit de -30" quando o volume SUPERA a meta,
     "CTR Link 0.65% crítico" quando 0,65% está acima da meta do gestor.

  2. RECOMENDAÇÕES CONTRADITÓRIAS — dois cards na mesma resposta mandando mexer
     no orçamento em direções opostas.
"""
import pytest

from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service.service import analyze_campaign
from app.enum.campaign import ScenarioCode


def analisar(metrics: dict, targets: dict):
    return analyze_campaign(AnalyzeInput(
        campaign=Campaign(id=1, name="teste"),
        metrics=Metrics(**metrics),
        targets=Targets(**targets),
    ))


def cenario(resp, code: ScenarioCode):
    return next((s for s in resp.scenarios if s.code == code), None)


def nota(resp, metrica: str):
    return next((e for e in resp.metric_evaluations if e.metric == metrica), None)


def textos(resp) -> str:
    return " ".join(f"{s.root_cause} {s.funnel_impact} {s.action}" for s in resp.scenarios)


# ═════════════════════════════════════════════════════════════════════════════
# 1. Texto que contradiz o próprio dado
# ═════════════════════════════════════════════════════════════════════════════

class TestDeficitNegativo:
    """
    Cenário I dispara por `learning_phase=True` OU por volume baixo. Quando
    dispara pelo primeiro com o volume ACIMA da meta, o déficit é negativo — e
    era exibido como déficit ("deficit de -30"), enquanto o semáforo de
    Conversões/semana dizia "✓ Volume suficiente" na mesma resposta.

    Era o achado mais frequente da varredura: 10,2% das análises.
    """

    def test_volume_acima_da_meta_nao_vira_deficit_negativo(self):
        r = analisar(
            dict(learning_phase=True, weekly_conversions=80),
            dict(min_weekly_conversions=50),
        )
        assert "deficit de -" not in textos(r)

    def test_volume_acima_da_meta_e_declarado_como_acima(self):
        r = analisar(
            dict(learning_phase=True, weekly_conversions=80),
            dict(min_weekly_conversions=50),
        )
        causa = cenario(r, ScenarioCode.LEARNING_PHASE).root_cause
        assert "80 conversões" in causa
        assert "acima" in causa  # e não "deficit"

    def test_nao_contradiz_o_semaforo_de_conversoes(self):
        r = analisar(
            dict(learning_phase=True, weekly_conversions=80),
            dict(min_weekly_conversions=50),
        )
        # O semáforo diz que o volume está suficiente; o cenário não pode dizer
        # que falta evento.
        assert nota(r, "Conversões/semana").status.value == "GREEN"
        assert "deficit" not in textos(r).lower()

    def test_deficit_real_continua_sendo_exibido(self):
        """Guard contra 'consertar' removendo a informação útil."""
        r = analisar(
            dict(learning_phase=True, weekly_conversions=20),
            dict(min_weekly_conversions=50),
        )
        assert "deficit de 30" in textos(r)


class TestMetaExibidaComPrecisao:
    """
    `{meta:.0f}` arredondava a meta EXIBIDA. Com `min_hold_rate=3.4` o texto
    saía "Hold Rate 3.1% abaixo da meta de 3%" — falso na própria linha — e o
    tile anunciava "Meta: >3%", que não é a meta que o gestor configurou.
    """

    def test_meta_fracionaria_nao_e_arredondada_no_cenario(self):
        r = analisar(dict(hook_rate=40.0, hold_rate=3.1), dict(min_hold_rate=3.4))
        causa = cenario(r, ScenarioCode.LOW_RETENTION).root_cause
        assert "meta de 3.4%" in causa
        assert "meta de 3%" not in causa

    def test_meta_fracionaria_nao_e_arredondada_na_nota_do_tile(self):
        r = analisar(dict(hold_rate=3.1), dict(min_hold_rate=3.4))
        assert "Meta: >3.4%" in nota(r, "Hold Rate").note

    def test_meta_inteira_continua_sem_casas_decimais(self):
        """35.0 deve sair "35", não "35.0" — legibilidade preservada."""
        r = analisar(dict(hook_rate=10.0), dict(min_hook_rate=35.0))
        assert "meta de 35%" in cenario(r, ScenarioCode.WEAK_HOOK).root_cause

    # 39.66 é o caso que importa: em `.1f` ele arredonda para CIMA ("39.7") e
    # empata com a meta exibida. (39.65 não serve — como float binário é
    # ligeiramente menor que 39,65, então `.1f` já dava "39.6" e o teste passava
    # mesmo com o bug presente. Descoberto no teste de mutação.)
    @pytest.mark.parametrize("valor,meta", [(3.1, 3.4), (39.66, 39.7), (12.04, 12.05)])
    def test_frase_nunca_afirma_abaixo_com_valor_igual_ou_maior(self, valor, meta):
        """
        O valor também precisa da mesma precisão da meta: com o valor em `.1f`,
        39.66 arredondava para "39.7" e empatava com a meta 39.7, produzindo
        "39.7% abaixo da meta de 39.7%".
        """
        r = analisar(dict(hook_rate=90.0, hold_rate=valor), dict(min_hold_rate=meta))
        import re
        for m in re.finditer(r"Hold Rate ([\d.]+)% (?:criticamente )?abaixo da meta de ([\d.]+)%",
                             textos(r)):
            assert float(m.group(1)) < float(m.group(2)), m.group(0)


class TestDesvioZero:
    """`{delta:.0f}%` transformava 0,4% de desvio no aviso "CPA 0% acima da meta"."""

    def test_desvio_menor_que_um_ponto_mantem_casa_decimal(self):
        r = analisar(dict(cpa=50.2), dict(max_cpa=50.0))
        assert "0.4%" in nota(r, "CPA").note

    def test_cpa_exatamente_na_meta_tem_nome_proprio(self):
        r = analisar(dict(cpa=50.0), dict(max_cpa=50.0))
        n = nota(r, "CPA")
        assert n.status.value == "GREEN"
        assert "limite exato" in n.note
        assert "0" not in n.note.split("✓")[1]  # sem "0% abaixo"


# ═════════════════════════════════════════════════════════════════════════════
# 2. Limiares fixos que ignoravam a meta do gestor
# ═════════════════════════════════════════════════════════════════════════════

class TestCtrLinkRespeitaAMeta:
    """
    Cenário C e a nota de CTR Todos usavam `ctr_link < 0.7` cru. Um gestor com
    meta de 0,5% via um CTR de 0,65% — 30% ACIMA da meta dele — ser chamado de
    "crítico" pelo cenário, enquanto o semáforo ao lado marcava GREEN.
    """

    def test_ctr_acima_da_meta_baixa_nao_dispara_click_bait(self):
        r = analisar(dict(ctr_link=0.65, ctr_all=5.0), dict(min_ctr_link=0.5))
        assert cenario(r, ScenarioCode.CLICK_BAIT) is None

    def test_ctr_acima_da_meta_baixa_nao_e_chamado_de_critico(self):
        r = analisar(dict(ctr_link=0.65, ctr_all=5.0), dict(min_ctr_link=0.5))
        assert "crítico" not in textos(r)
        assert nota(r, "CTR Link").status.value == "GREEN"

    def test_cenario_e_semaforo_concordam(self):
        """
        A regra que impede a contradição: o cenário só chama de crítico o que o
        semáforo também marca RED.
        """
        r = analisar(dict(ctr_link=0.65, ctr_all=5.0), dict(min_ctr_link=0.5))
        assert nota(r, "CTR Todos").status.value != "RED"

    def test_ctr_abaixo_da_meta_alta_continua_disparando(self):
        """Meta alta: 1,0% é ruim de verdade e precisa continuar sendo pego."""
        r = analisar(dict(ctr_link=1.0, ctr_all=5.0), dict(min_ctr_link=3.0))
        assert cenario(r, ScenarioCode.CLICK_BAIT) is not None

    def test_comportamento_no_default_preservado(self):
        r = analisar(dict(ctr_link=0.5, ctr_all=5.0), dict())
        assert cenario(r, ScenarioCode.CLICK_BAIT) is not None


class TestRoasInfladoRespeitaAMeta:
    """
    Cenário K usava `roas > 10.0` cru. Com meta de 15x, um ROAS de 12x disparava
    K ("ilusão estatística", "ROAS alto mascarando problema") ao mesmo tempo que
    o Cenário O dizia "ROAS 12.0x abaixo da meta de 15.0x".
    """

    def test_roas_abaixo_da_meta_nao_e_chamado_de_inflado(self):
        r = analisar(
            dict(roas=12.0, frequency=7.0, cpa=20.0, conversions=100),
            dict(min_roas=15.0, max_cpa=50.0, max_frequency_critical=6.0),
        )
        assert cenario(r, ScenarioCode.RETARGETING_CANNIBAL) is None
        assert "ilusão" not in textos(r)

    def test_K_e_O_nunca_coexistem(self):
        """São afirmações opostas sobre o mesmo número."""
        r = analisar(
            dict(roas=12.0, frequency=7.0, cpa=20.0, conversions=100),
            dict(min_roas=15.0, max_cpa=50.0, max_frequency_critical=6.0),
        )
        codigos = {s.code for s in r.scenarios}
        assert not (ScenarioCode.RETARGETING_CANNIBAL in codigos
                    and ScenarioCode.LOW_REVENUE in codigos)

    def test_roas_acima_da_meta_alta_continua_disparando(self):
        r = analisar(
            dict(roas=20.0, frequency=7.0, ctr_link=0.5, conversions=100),
            dict(min_roas=15.0, max_frequency_critical=6.0),
        )
        assert cenario(r, ScenarioCode.RETARGETING_CANNIBAL) is not None

    def test_comportamento_no_default_preservado(self):
        """Sem meta de ROAS, o limiar continua sendo 10x."""
        r = analisar(dict(roas=12.0, frequency=7.0), dict(max_frequency_critical=6.0))
        assert cenario(r, ScenarioCode.RETARGETING_CANNIBAL) is not None


class TestSeveridadeDoHoldRate:
    """
    O detector do Cenário B usava `hold_rate < 10.0` fixo enquanto o semáforo já
    usava `min(10, 70% da meta)` — corrigido em 26/07/2026 só no semáforo. Com
    metas diferentes do default a severidade chegava a INVERTER: Hold 12 contra
    meta 30 (40% da meta) saía prioridade 2, e Hold 9 contra meta 11 (82% da
    meta) saía prioridade 1 — a campanha pior recebendo o veredito mais brando,
    contrariando o próprio score (62 contra 88).
    """

    def test_prioridade_nao_inverte_em_relacao_ao_score(self):
        pior = analisar(dict(hook_rate=40.0, hold_rate=12.0), dict(min_hold_rate=30.0))
        melhor = analisar(dict(hook_rate=40.0, hold_rate=9.0), dict(min_hold_rate=11.0))

        assert pior.overall_score < melhor.overall_score  # o score ordena certo
        # a prioridade não pode ordenar ao contrário (1 = mais grave)
        assert cenario(pior, ScenarioCode.LOW_RETENTION).priority \
            <= cenario(melhor, ScenarioCode.LOW_RETENTION).priority

    def test_prioridade_concorda_com_o_semaforo(self):
        """Detector e semáforo passam a usar a mesma fonte de limiar."""
        for meta, valor in [(30.0, 12.0), (11.0, 9.0), (15.0, 5.0), (5.0, 2.0)]:
            r = analisar(dict(hook_rate=90.0, hold_rate=valor), dict(min_hold_rate=meta))
            c = cenario(r, ScenarioCode.LOW_RETENTION)
            if c is None:
                continue
            semaforo_red = nota(r, "Hold Rate").status.value == "RED"
            assert (c.priority == 1) == semaforo_red, (meta, valor)

    def test_comportamento_no_default_preservado(self):
        """Meta 15 → limiar 10, exatamente como antes."""
        assert cenario(
            analisar(dict(hook_rate=40.0, hold_rate=9.9), dict(min_hold_rate=15.0)),
            ScenarioCode.LOW_RETENTION,
        ).priority == 1
        assert cenario(
            analisar(dict(hook_rate=40.0, hold_rate=10.1), dict(min_hold_rate=15.0)),
            ScenarioCode.LOW_RETENTION,
        ).priority == 2


# ═════════════════════════════════════════════════════════════════════════════
# 3. Recomendações contraditórias
# ═════════════════════════════════════════════════════════════════════════════

# Cenários que mandam AUMENTAR e cenários que mandam REDUZIR/PARAR o orçamento
# do mesmo conjunto. Nenhuma resposta pode conter os dois lados.
SOBE_ORCAMENTO = {ScenarioCode.VERTICAL_SCALE}
DESCE_ORCAMENTO = {ScenarioCode.CREATIVE_FATIGUE, ScenarioCode.OVERSPENDING,
                   ScenarioCode.NO_RETURN}


class TestGastoSemRetornoVenceQuemMandaGastar:
    """
    Com ZERO conversão sobre gasto relevante, o Cenário L manda pausar. Sem
    regra de supressão, o Cenário D aparecia junto afirmando literalmente
    "Pausar seria um erro" e virava a ação principal, e o Cenário H mandava
    duplicar a estrutura para novos públicos.
    """

    CASO_D = dict(conversions=0, spend=2000, ctr_link=4.0, lp_conversion_rate=0.1,
                  landing_page_views=500, link_clicks=600)
    CASO_H = dict(conversions=0, spend=2000, cpa=30.0, frequency=2.6, link_clicks=800)

    def test_L_suprime_D(self):
        r = analisar(self.CASO_D, dict(max_cpa=50.0))
        assert cenario(r, ScenarioCode.NO_RETURN) is not None
        assert cenario(r, ScenarioCode.LP_MISMATCH) is None

    def test_acao_principal_nao_contradiz_cenario_listado(self):
        r = analisar(self.CASO_D, dict(max_cpa=50.0))
        assert "Pausar" in r.primary_action
        assert "Pausar seria um erro" not in textos(r)

    def test_L_suprime_H(self):
        r = analisar(self.CASO_H, dict(max_cpa=50.0))
        assert cenario(r, ScenarioCode.NO_RETURN) is not None
        assert cenario(r, ScenarioCode.HORIZONTAL_SCALE) is None

    def test_nunca_pausar_e_expandir_juntos(self):
        for caso in (self.CASO_D, self.CASO_H):
            r = analisar(caso, dict(max_cpa=50.0))
            acoes = " ".join(s.action.lower() for s in r.scenarios)
            assert not ("pausar a veicula" in acoes and "duplicar estrutura" in acoes)


class TestNaoEscalarCriativoReprovado:
    """
    O Cenário G ("aumentar orçamento agora") tem prioridade 1 e por isso virava
    a ação principal mesmo com o Cenário A (prioridade 2) dizendo, na mesma
    resposta, "Pausar o criativo atual". O engine recomendava escalar o criativo
    que ele acabara de reprovar.
    """

    SAUDAVEL = dict(cpa=20.0, roas=5.0, frequency=1.2, learning_phase=False,
                    conversions=100, cpm=20.0)
    METAS = dict(max_cpa=50.0, min_roas=3.0)

    def test_gancho_fraco_suprime_escala_vertical(self):
        r = analisar({**self.SAUDAVEL, "hook_rate": 30.0},
                     {**self.METAS, "min_hook_rate": 35.0})
        assert cenario(r, ScenarioCode.WEAK_HOOK) is not None
        assert cenario(r, ScenarioCode.VERTICAL_SCALE) is None
        assert "aumentar orçamento" not in r.primary_action.lower()

    def test_click_bait_suprime_escala_vertical(self):
        r = analisar({**self.SAUDAVEL, "ctr_link": 0.3, "ctr_all": 6.0}, self.METAS)
        assert cenario(r, ScenarioCode.CLICK_BAIT) is not None
        assert cenario(r, ScenarioCode.VERTICAL_SCALE) is None

    def test_fadiga_suprime_escala_vertical(self):
        """
        Com os defaults os dois nunca coexistiam (teto de escala 1.8 < fadiga
        2.8), o que escondia o conflito. Os dois limiares são configuráveis.
        """
        r = analisar({**self.SAUDAVEL, "frequency": 3.0},
                     {**self.METAS, "max_frequency_fatigue": 2.0,
                      "scale_frequency_ceiling": 4.0})
        assert cenario(r, ScenarioCode.CREATIVE_FATIGUE) is not None
        assert cenario(r, ScenarioCode.VERTICAL_SCALE) is None

    def test_escala_intacta_quando_o_criativo_esta_ok(self):
        """Guard: a supressão não pode matar o Cenário G no caminho saudável."""
        r = analisar({**self.SAUDAVEL, "hook_rate": 50.0},
                     {**self.METAS, "min_hook_rate": 35.0})
        assert cenario(r, ScenarioCode.VERTICAL_SCALE) is not None


class TestNenhumaRespostaMandaGastarEParar:
    """Invariante global, sobre uma grade de casos que cruzam os gatilhos."""

    @pytest.mark.parametrize("metrics,targets", [
        (dict(conversions=0, spend=2000, cpa=30.0, frequency=2.6, link_clicks=800),
         dict(max_cpa=50.0)),
        (dict(cpa=20.0, roas=5.0, frequency=3.0, learning_phase=False, conversions=100),
         dict(max_cpa=50.0, min_roas=3.0, max_frequency_fatigue=2.0,
              scale_frequency_ceiling=4.0)),
        (dict(cpa=20.0, roas=5.0, frequency=1.2, learning_phase=False, conversions=100,
              hook_rate=10.0, cpm=20.0),
         dict(max_cpa=50.0, min_roas=3.0, min_hook_rate=35.0)),
        (dict(cpa=20.0, roas=5.0, frequency=1.2, learning_phase=False, conversions=100,
              ctr_link=0.2, ctr_all=7.0, cpm=20.0),
         dict(max_cpa=50.0, min_roas=3.0)),
    ])
    def test_direcoes_opostas_nunca_coexistem(self, metrics, targets):
        r = analisar(metrics, targets)
        codigos = {s.code for s in r.scenarios}
        assert not (codigos & SOBE_ORCAMENTO and codigos & DESCE_ORCAMENTO), \
            f"{[c.value for c in codigos]}"


# ═════════════════════════════════════════════════════════════════════════════
# 4. Números inventados
# ═════════════════════════════════════════════════════════════════════════════

class TestSemPrevisaoFabricada:
    """
    O engine emitia dois números que não vinham de dado nenhum — o mesmo pecado
    que o Princípio 0 do prompt proíbe à IA:

      • Cenário J: "Com redução de 15% do orçamento, CPA estimado: R$X" dividia
        85% do gasto pelas MESMAS conversões, ou seja, assumia que cortar verba
        não custa conversão. Por construção prometia sempre um CPA 15% menor.
      • Cenário H: "Estimativa: N dia(s) antes do colapso" dividia a distância
        até o limite de fadiga por uma taxa de 0,3/dia que não existe no input
        (não há série histórica).
    """

    def test_J_nao_promete_cpa_futuro(self):
        r = analisar(
            dict(cpm=80.0, lp_conversion_rate=2.0, cpa=90.0, spend=5000, conversions=55),
            dict(max_cpa=50.0, max_cpm=50.0),
        )
        causa = cenario(r, ScenarioCode.OVERSPENDING).root_cause
        assert "CPA estimado" not in causa
        assert "estimado" not in causa

    def test_J_ainda_quantifica_o_excesso_medido(self):
        """Remover a previsão não pode deixar o card sem número."""
        r = analisar(
            dict(cpm=80.0, lp_conversion_rate=2.0, cpa=90.0, spend=5000, conversions=55),
            dict(max_cpa=50.0, max_cpm=50.0),
        )
        assert "60%" in cenario(r, ScenarioCode.OVERSPENDING).root_cause  # 80/50-1

    def test_H_nao_preve_dias_ate_o_colapso(self):
        r = analisar(dict(frequency=2.6, cpa=30.0, conversions=100), dict(max_cpa=50.0))
        causa = cenario(r, ScenarioCode.HORIZONTAL_SCALE).root_cause
        assert "dia(s) antes do colapso" not in causa
        assert "Estimativa" not in causa

    def test_H_informa_a_distancia_medida(self):
        r = analisar(dict(frequency=2.6, cpa=30.0, conversions=100), dict(max_cpa=50.0))
        causa = cenario(r, ScenarioCode.HORIZONTAL_SCALE).root_cause
        assert "0.2" in causa and "frequência até o limite" in causa


# ═════════════════════════════════════════════════════════════════════════════
# 5. Coerência de apresentação
# ═════════════════════════════════════════════════════════════════════════════

class TestScoreAltoComStatusCritico:
    """
    "Crítico" ao lado de "97/100" aparece em ~8% das análises e é legítimo — o
    score mede as métricas recebidas, o status inclui a causa raiz. Sem
    explicação, porém, lê como erro do produto. Aqui nenhum número muda: só se
    diz por que divergem.
    """

    CASO = dict(learning_phase=True, weekly_conversions=80, spend=1000,
                conversions=80, cpa=12.5)
    METAS = dict(max_cpa=50.0, min_weekly_conversions=50)

    def test_summary_explica_a_divergencia(self):
        r = analisar(self.CASO, self.METAS)
        assert r.final_status.value == "RED"
        assert r.overall_score >= 70
        assert "reflete só as métricas recebidas" in r.summary
        assert "Cenário I" in r.summary

    def test_nao_polui_quando_score_e_status_concordam(self):
        r = analisar(dict(cpa=200.0, roas=0.3), dict(max_cpa=50.0, min_roas=3.0))
        assert "reflete só as métricas recebidas" not in r.summary

    def test_nao_aparece_em_campanha_saudavel(self):
        r = analisar(dict(cpa=20.0, roas=5.0), dict(max_cpa=50.0, min_roas=3.0))
        assert "reflete só as métricas recebidas" not in r.summary


class TestFallbackPreservaRessalvaDeCobertura:
    """
    `_apply_minimal_fallback` sobrescrevia o summary e descartava o
    "Diagnóstico parcial (cobertura X%) — envie Y" que o engine tinha acabado de
    montar, justamente no caminho em que os dados são mais escassos (sem cenário
    e sem IA).
    """

    def test_ressalva_sobrevive_ao_fallback(self):
        from app.service.service import _apply_minimal_fallback

        entrada = AnalyzeInput(
            campaign=Campaign(id=1, name="teste"),
            metrics=Metrics(cpc=40.0, cpm=90.0),
            targets=Targets(max_cpc=5.0, max_cpm=50.0),
        )
        r = _apply_minimal_fallback(analyze_campaign(entrada), entrada)
        assert not r.scenarios
        assert "cobertura" in r.summary.lower()
        assert "Análise baseada nas métricas individuais" in r.summary


# ═════════════════════════════════════════════════════════════════════════════
# 6. Catálogo público não pode mentir sobre o engine
# ═════════════════════════════════════════════════════════════════════════════

class TestCatalogoDeCenarios:
    """
    `GET /campaign/scenarios` é servido ao frontend como documentação. O verbete
    do Cenário G não mencionava nem o gate de evidência (2026-07-28) nem a
    condição de CPM, e os de B, C e K anunciavam os limiares fixos já removidos.
    """

    def _verbete(self, code: ScenarioCode) -> dict:
        from app.routes.routes import _SCENARIO_CATALOG
        return next(s for s in _SCENARIO_CATALOG if s["code"] == code)

    def test_G_documenta_o_gate_de_evidencia(self):
        t = self._verbete(ScenarioCode.VERTICAL_SCALE)["trigger"]
        assert "evidência" in t.lower()
        assert "cpm" in t.lower()

    def test_C_nao_anuncia_mais_o_limiar_fixo(self):
        assert "0.7%" not in self._verbete(ScenarioCode.CLICK_BAIT)["trigger"]

    def test_K_documenta_o_limiar_relativo_a_meta(self):
        assert "min_roas" in self._verbete(ScenarioCode.RETARGETING_CANNIBAL)["trigger"]

    def test_B_documenta_a_prioridade_relativa_a_meta(self):
        assert "70%" in self._verbete(ScenarioCode.LOW_RETENTION)["priority"]
