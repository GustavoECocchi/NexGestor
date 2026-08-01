import math

from app.schema.schema import (
    AnalyzeInput,
    CampaignAnalysisResponse,
    ScenarioDetail,
    MetricEvaluation,
    Metrics,
    Targets,
)
from app.enum.campaign import CampaignStatus, ScenarioCode


# ─────────────────────────────────────────────────────────────────────────────
# STEP 0 — PRÉ-PROCESSAMENTO
# Calcula métricas derivadas se os dados brutos foram enviados mas a taxa não.
# ─────────────────────────────────────────────────────────────────────────────

def _derivado(valor: float) -> float | None:
    """
    Devolve o valor derivado só se ele for um número utilizável.

    O schema já garante que a ENTRADA é finita, mas a derivação multiplica e
    divide: `spend=1e308` com `impressions=1` produz um CPM infinito a partir de
    dois números perfeitamente válidos. O infinito atravessava o engine, virava
    `"value": null` na resposta (JSON não tem infinito) e a UI exibia uma métrica
    com status RED e nenhum número — pior que não avaliar, porque afirma ter
    avaliado. Não conseguindo calcular, o honesto é não registrar a métrica.
    """
    return valor if math.isfinite(valor) else None


def _preprocess(m: Metrics) -> Metrics:
    """
    Calcula métricas derivadas a partir dos dados brutos quando o usuário
    enviou os números absolutos mas não a taxa. Por exemplo: se enviou
    `video_views_3s=12000` e `impressions=50000`, calcula `hook_rate=24.0`.

    Não sobrescreve métricas que o usuário já enviou prontas.

    Todos os guards usam `is not None` (e nunca truthiness): gasto 0, alcance 0
    ou cliques 0 são medições válidas. Com `if data.spend`, uma campanha recém
    ligada com spend=0 simplesmente não ganhava CPM/CPC/CPA — perdia cobertura
    de score sem que nada avisasse. É a mesma armadilha que já tinha causado o
    HTTP 500 do Cenário F em 2026-07-26.
    """
    data = m.model_copy()

    # Derivações que dependem de impressions > 0 — agrupadas para um único guard.
    # Cada tupla: (campo destino, valor numerador, fator multiplicador)
    if data.impressions is not None and data.impressions > 0:
        rate_derivations = [
            ("hook_rate", data.video_views_3s, 100),
            ("hold_rate", data.thruplays, 100),
            ("ctr_link", data.link_clicks, 100),
            ("ctr_all", data.all_clicks, 100),
        ]
        for field, numerator, factor in rate_derivations:
            if getattr(data, field) is None and numerator is not None:
                setattr(data, field, _derivado(round(numerator / data.impressions * factor, 2)))

        if data.frequency is None and data.reach is not None and data.reach > 0:
            data.frequency = _derivado(round(data.impressions / data.reach, 2))

        if data.cpm is None and data.spend is not None:
            data.cpm = _derivado(round(data.spend / data.impressions * 1000, 2))

    # Derivações independentes de impressions.
    if data.lp_conversion_rate is None and data.conversions is not None \
            and data.landing_page_views is not None and data.landing_page_views > 0:
        data.lp_conversion_rate = _derivado(round(data.conversions / data.landing_page_views * 100, 2))

    if data.cpc is None and data.spend is not None \
            and data.link_clicks is not None and data.link_clicks > 0:
        data.cpc = _derivado(round(data.spend / data.link_clicks, 2))

    if data.cpa is None and data.spend is not None \
            and data.conversions is not None and data.conversions > 0:
        data.cpa = _derivado(round(data.spend / data.conversions, 2))

    return data


# ─────────────────────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _status(value: float, red: float, yellow: float, inverted: bool = False) -> CampaignStatus:
    """
    Converte um valor numérico em CampaignStatus (GREEN/YELLOW/RED) com thresholds.

    Args:
        inverted=False: maior é melhor (Hook Rate, CTR, ROAS)
        inverted=True:  menor é melhor (CPA, CPM, Frequência)
    """
    if inverted:
        if value > red:    return CampaignStatus.RED
        if value > yellow: return CampaignStatus.YELLOW
        return CampaignStatus.GREEN
    else:
        if value < red:    return CampaignStatus.RED
        if value < yellow: return CampaignStatus.YELLOW
        return CampaignStatus.GREEN




# ─────────────────────────────────────────────────────────────────────────────
# SCORE — 0 a 100 por métrica
# Calcula a distância proporcional do valor ao target.
# inverted=False → maior é melhor (Hook Rate, CTR, ROAS)
# inverted=True  → menor é melhor (CPA, CPM, Frequência)
# ─────────────────────────────────────────────────────────────────────────────

def _calc_score(value: float, target: float, inverted: bool = False, floor: float = 0.3) -> int:
    """
    Retorna score 0–100.
    floor: pior caso relativo ao target (ex: 0.3 = valor 70% pior que o target = score 0)
    """
    if target <= 0:
        return 50

    if not inverted:
        # Maior é melhor: score 100 quando value >= target
        if value >= target:
            return 100
        # score 0 quando value <= target * floor
        worst = target * floor
        if value <= worst:
            return 0
        return round((value - worst) / (target - worst) * 100)
    else:
        # Menor é melhor: score 100 quando value <= target
        if value <= target:
            return 100
        # score 0 quando value >= target * (1 + (1 - floor))
        worst = target * (2 - floor)
        if value >= worst:
            return 0
        return round((worst - value) / (worst - target) * 100)


# Pesos por métrica para o overall_score (soma = 1.0)
_METRIC_WEIGHTS = {
    "CPA":              0.25,
    "ROAS":             0.20,
    "CTR Link":         0.12,
    "Hook Rate":        0.10,
    "Hold Rate":        0.08,
    "Conversão LP":     0.08,
    "Frequência":       0.07,
    "CPM":              0.05,
    "CPC":              0.03,
    "CPL":              0.02,
    "CTR Todos":        0.00,   # informativo — não entra no score geral
    "Conversões/semana": 0.00,  # informativo — não entra no score geral
}

# ─────────────────────────────────────────────────────────────────────────────
# DETECTORES — CENÁRIOS A → K
# ─────────────────────────────────────────────────────────────────────────────

def _detect_weak_hook(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário A — Hook Rate abaixo do target indica que o criativo não capta atenção."""
    if m.hook_rate is None:
        return None

    critico = m.hook_rate < t.min_hook_rate * 0.70
    alerta  = m.hook_rate < t.min_hook_rate

    if not alerta:
        return None

    evidencias = []
    if m.ctr_link is not None and m.ctr_link < t.min_ctr_link:
        evidencias.append(f"CTR Link {m.ctr_link:.2f}% abaixo do mínimo confirma abandono antes do clique")
    if m.cpc is not None and t.max_cpc is not None and m.cpc > t.max_cpc:
        evidencias.append(f"CPC R${m.cpc:.2f} inflado por baixo engajamento")
    if m.cpm is not None and m.cpm > t.max_cpm:
        evidencias.append(f"CPM R${m.cpm:.2f} — algoritmo penalizando anúncio com baixa relevância")

    suporte = ". ".join(evidencias) + "." if evidencias else ""

    return ScenarioDetail(
        code=ScenarioCode.WEAK_HOOK,
        title="Cenário A — Gancho Fraco (Falta de Atenção)",
        root_cause=(
            f"Hook Rate {m.hook_rate:.1f}% está {'criticamente ' if critico else ''}"
            f"abaixo da meta de {t.min_hook_rate:.0f}%. "
            f"O público ignora o anúncio nos primeiros 3 segundos. {suporte}"
        ),
        funnel_impact=(
            "Topo do funil comprometido. Menos usuários entram no funil, "
            "inflando CPC e CPA artificialmente."
        ),
        action="Pausar o criativo atual e substituir os primeiros 3 segundos.",
        execution_rule=(
            "Refazer abertura com 'Pattern Interrupt': headline visual agressiva, cores de alto contraste "
            "ou movimento rápido. Trocar abordagem institucional por dor imediata do usuário. "
            f"Meta: Hook Rate acima de {t.min_hook_rate:.0f}% antes de reativar."
        ),
        priority=1 if critico else 2,
    )


def _detect_low_retention(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário B — Hook OK mas Hold Rate baixo: vídeo perde o público no meio."""
    if m.hook_rate is None or m.hold_rate is None:
        return None

    hook_ok   = m.hook_rate >= t.min_hook_rate * 0.70
    hold_ruim = m.hold_rate < t.min_hold_rate

    if not (hook_ok and hold_ruim):
        return None

    critico = m.hold_rate < 10.0

    evidencias = []
    if m.thruplays is not None and m.video_views_3s and m.video_views_3s > 0:
        retencao = round(m.thruplays / m.video_views_3s * 100, 1)
        evidencias.append(f"Apenas {retencao}% dos que passaram dos 3s assistiram até o fim")

    suporte = ". ".join(evidencias) + "." if evidencias else ""

    return ScenarioDetail(
        code=ScenarioCode.LOW_RETENTION,
        title="Cenário B — Retenção Baixa (Vídeo Entediante ou Longo)",
        root_cause=(
            f"Hook Rate {m.hook_rate:.1f}% capta atenção inicial. "
            f"Porém Hold Rate {m.hold_rate:.1f}% {'criticamente ' if critico else ''}"
            f"abaixo da meta de {t.min_hold_rate:.0f}% — o vídeo perde o público logo após a abertura. {suporte}"
        ),
        funnel_impact=(
            "Usuário entra no funil mas abandona antes de ver a oferta e a CTA. "
            "CPL e CPA inflados por visualizações sem intenção."
        ),
        action="Solicitar edição do vídeo atual — não substituir, editar o desenvolvimento.",
        execution_rule=(
            "Encurtar criativo eliminando introduções corporativas. "
            "Aplicar cortes dinâmicos a cada 2–3 segundos. "
            "Adicionar B-rolls, legendas dinâmicas e capturas de tela da ferramenta em uso. "
            f"Meta: Hold Rate acima de {t.min_hold_rate:.0f}% antes de escalar."
        ),
        priority=1 if critico else 2,
    )


def _detect_click_bait(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário C — Muito engajamento (likes/coments) mas pouco clique no link."""
    if m.ctr_all is None or m.ctr_link is None:
        return None

    if not (m.ctr_all > t.max_ctr_all_ratio and m.ctr_link < 0.7):
        return None

    ratio = round(m.ctr_all / m.ctr_link, 1) if m.ctr_link > 0 else 0

    gasto_info = ""
    if m.spend is not None and m.all_clicks and m.all_clicks > 0:
        custo_engajamento = m.spend / m.all_clicks
        gasto_info = f" Custo médio por engajamento vazio: R${custo_engajamento:.2f}."

    return ScenarioDetail(
        code=ScenarioCode.CLICK_BAIT,
        title="Cenário C — Click-Bait / Falta de Intenção Comercial",
        root_cause=(
            f"CTR Todos {m.ctr_all:.1f}% muito alto com CTR Link {m.ctr_link:.2f}% crítico. "
            f"Razão de desperdício: {ratio}x mais engajamento social do que cliques comerciais. "
            f"O anúncio não deixa claro que é um produto/serviço.{gasto_info}"
        ),
        funnel_impact=(
            "Orçamento consumido por curtidas e comentários sem valor comercial. "
            "Algoritmo do Meta otimiza para engajamento em vez de intenção de compra."
        ),
        action="Substituir criativo por abordagem direta com CTA comercial explícita.",
        execution_rule=(
            "Inserir CTA clara no áudio e no visual, no meio e no fim do vídeo. "
            "Mostrar o produto sendo usado em contexto real. "
            "Usar linguagem que filtra intenção: 'Para quem quer X', 'Ideal para empresas que Y'."
        ),
        priority=1,
    )


def _detect_lp_mismatch(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário D — Anúncio funciona (CTR ótimo) mas Landing Page mata a conversão."""
    if m.ctr_link is None or m.lp_conversion_rate is None:
        return None

    ctr_excelente = m.ctr_link > t.min_ctr_link * 1.5
    lp_ruim       = m.lp_conversion_rate < t.min_lp_conversion_rate

    if not (ctr_excelente and lp_ruim):
        return None

    desperdicio = ""
    if m.spend is not None and m.landing_page_views and m.landing_page_views > 0:
        custo_por_view = m.spend / m.landing_page_views
        desperdicio = f" Custo por visita à LP: R${custo_por_view:.2f} sendo desperdiçado por baixa conversão."

    return ScenarioDetail(
        code=ScenarioCode.LP_MISMATCH,
        title="Cenário D — Desalinhamento com Landing Page (Quebra de Expectativa)",
        root_cause=(
            f"CTR Link {m.ctr_link:.2f}% excelente confirma que o anúncio funciona. "
            f"Taxa de conversão LP {m.lp_conversion_rate:.1f}% abaixo da meta de {t.min_lp_conversion_rate:.1f}% "
            f"— gargalo está na página: lenta, proposta de valor diferente ou alta fricção no formulário.{desperdicio}"
        ),
        funnel_impact=(
            "Cliques pagos desperdiçados na entrada da LP. "
            "CPA distorcido por problema externo à campanha. Pausar seria um erro."
        ),
        action="Manter campanhas ativas e abrir auditoria urgente na Landing Page.",
        execution_rule=(
            "1. Verificar carregamento no mobile — meta: abaixo de 3s. "
            "2. Primeira dobra da LP deve usar a mesma headline do anúncio campeão. "
            "3. Reduzir campos do formulário (cada campo extra reduz conversão ~10%). "
            "4. Testar versão simplificada com headline, benefícios e CTA único."
        ),
        priority=1,
    )


def _detect_creative_fatigue(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário E — Frequência alta indica que o criativo saturou no público atual."""
    if m.frequency is None:
        return None

    if m.frequency <= t.max_frequency_fatigue:
        return None

    sinais = []
    if m.ctr_link is not None and m.ctr_link < t.min_ctr_link:
        sinais.append(f"CTR Link {m.ctr_link:.2f}% despencando")
    if m.cpa is not None and t.max_cpa is not None and m.cpa > t.max_cpa:
        sinais.append(f"CPA R${m.cpa:.2f} acima do teto de R${t.max_cpa:.2f}")
    if m.cpm is not None and m.cpm > t.max_cpm:
        sinais.append(f"CPM R${m.cpm:.2f} subindo")

    # Crítico por 2 vias:
    #   a) frequência já perto do limite crítico (saturação extrema), OU
    #   b) fadiga CONFIRMADA por dano financeiro ativo (>=2 sinais corroborantes).
    # Fadiga com CPA estourado e CTR despencando não é "ponto de atenção" —
    # é sangria em andamento. Um analista sênior trata como crítico.
    critico = (m.frequency > t.max_frequency_critical * 0.8) or (len(sinais) >= 2)

    confirmacao = (". Confirmado por: " + "; ".join(sinais)) if sinais else ""

    return ScenarioDetail(
        code=ScenarioCode.CREATIVE_FATIGUE,
        title="Cenário E — Fadiga de Criativo (Anúncio Saturado)",
        root_cause=(
            f"Frequência {m.frequency:.1f} — público viu o anúncio {m.frequency:.1f}x em média "
            f"(limite saudável: {t.max_frequency_fatigue}){confirmacao}. Criativo saturado."
        ),
        funnel_impact=(
            "CPA subindo progressivamente. CTR Link em queda. "
            "Orçamento queimado em audiência que já decidiu sobre o anúncio."
        ),
        action="Reduzir orçamento do conjunto saturado e subir novos criativos.",
        execution_rule=(
            "Reduzir orçamento em 30–50% imediatamente. "
            "Subir pelo menos 3 variações novas (ângulos diferentes, cores, formatos). "
            "Se usar Advantage+: inserir novas peças para forçar o algoritmo a testar novos caminhos. "
            f"Meta: frequência abaixo de {t.max_frequency_fatigue} antes de escalar novamente."
        ),
        priority=1 if critico else 2,
    )


def _detect_cold_lead(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário F — Custo de aquisição ok, mas qualidade dos leads é péssima."""
    if t.max_cpa is None or m.lp_conversion_rate is None:
        return None

    cpa_ok    = m.cpa is not None and m.cpa <= t.max_cpa
    cpl_ok    = m.cpl is not None and t.max_cpl is not None and m.cpl <= t.max_cpl
    lp_critica = m.lp_conversion_rate < t.min_lp_conversion_rate * 0.5

    if not ((cpa_ok or cpl_ok) and lp_critica):
        return None

    # O texto precisa descrever o sinal de custo que REALMENTE qualificou o cenário.
    # Antes o ramo era escolhido por `if m.cpa` (truthiness), o que causava dois
    # defeitos distintos:
    #   1. CPA=0 é falsy mas é um valor válido — caía no ramo do CPL e estourava
    #      TypeError quando m.cpl/t.max_cpl eram None (virava HTTP 500).
    #   2. Um CPA ACIMA do teto (que portanto não qualificou; quem qualificou foi o
    #      CPL) era descrito como "dentro do teto" — afirmação factualmente falsa
    #      dentro do diagnóstico que o gestor lê.
    # `cpa_ok or cpl_ok` é garantido acima, então o else implica cpl_ok, o que por
    # sua vez garante m.cpl e t.max_cpl não-nulos.
    if cpa_ok:
        custo_info = f"CPA R${m.cpa:.2f}"
        meta_info  = f"teto de R${t.max_cpa:.2f}"
    else:
        custo_info = f"CPL R${m.cpl:.2f}"
        meta_info  = f"teto de R${t.max_cpl:.2f}"

    return ScenarioDetail(
        code=ScenarioCode.COLD_LEAD,
        title="Cenário F — Lead Frio / Persona Incorreta",
        root_cause=(
            f"{custo_info} dentro do {meta_info} — anúncio atrai volume. "
            f"Porém conversão LP {m.lp_conversion_rate:.1f}% próxima de zero indica leads desqualificados: "
            "'caçadores de coisas grátis' ou público sem fit com o ticket do produto."
        ),
        funnel_impact=(
            "CAC real muito acima do CPA registrado. Leads chegando mas não virando clientes. "
            "Time de vendas sobrecarregado com leads que não convertem."
        ),
        action="Mudar comunicação dos anúncios para qualificar o público na entrada.",
        execution_rule=(
            "Adicionar barreiras de qualificação na cópia: mencionar ticket, porte ou perfil-alvo explicitamente. "
            "Mudar CTA de 'Cadastre-se grátis' para 'Solicitar Demonstração'. "
            "Testar LAL de clientes pagantes em vez de segmentação por interesse amplo."
        ),
        priority=2,
    )


def _cpa_com_folga(m: Metrics, t: Targets) -> bool:
    """CPA presente e abaixo da margem de escala — o gatilho de custo do Cenário G."""
    return (
        m.cpa is not None
        and t.max_cpa is not None
        and m.cpa <= t.max_cpa * t.scale_cpa_margin
    )


def _evidencia_faltante_para_escala(m: Metrics, t: Targets) -> list[str]:
    """
    Dados que faltam para AFIRMAR que a janela de escala está aberta.
    Lista vazia = evidência completa; qualquer item = não dá para recomendar
    aumento de orçamento.

    Por que isto existe (achado em 2026-07-28): o Cenário G tratava dado ausente
    como condição favorável (`m.frequency is None or ...`). Só CPA + meta de CPA
    já abria "Janela de Escala Vertical" com cobertura de 25% e ação primária
    "aumentar orçamento agora" — uma recomendação financeira sem nenhuma
    evidência de que a audiência não está saturando ou de que o algoritmo saiu
    do aprendizado. As três regras de supressão que existiriam para barrar isso
    (I→G por aprendizado, K→G por canibalização) dependem justamente dos dados
    que faltavam, então também ficavam inertes.

    G é o único detector que recomenda GASTAR MAIS. Nos outros dez, o gatilho é
    dano já observado num número presente; aqui o gatilho é ausência de alarme —
    e ausência de dado não é ausência de alarme.
    """
    faltando: list[str] = []
    if m.frequency is None:
        faltando.append("frequência (ou impressões + alcance)")
    if m.learning_phase is None and m.weekly_conversions is None:
        faltando.append("fase de aprendizado (learning_phase) ou conversões da semana")
    # ROAS só é exigido quando o gestor definiu meta de ROAS: sem meta, não há
    # como afirmar que o retorno "está adequado" nem que deixou de estar.
    if t.min_roas is not None and m.roas is None:
        faltando.append("ROAS")
    if m.conversions is not None and m.conversions < _MIN_CONVERSOES_CONFIAVEL:
        # Volume de resultado é evidência tanto quanto frequência ou aprendizado:
        # um CPA ótimo apurado sobre 2 conversões não é um CPA ótimo, é um acaso
        # com duas casas decimais. (Cenário M também suprime G — este guard
        # cobre o caso em que M não dispara por falta de `spend`.)
        faltando.append(f"volume de conversões (mínimo {_MIN_CONVERSOES_CONFIAVEL} para apurar CPA)")
    return faltando


def _detect_vertical_scale(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário G — Performance excelente com folga: janela para aumentar orçamento."""
    if m.cpa is None or t.max_cpa is None:
        return None

    # Evidência mínima obrigatória — sem ela o cenário não dispara (ver docstring
    # de _evidencia_faltante_para_escala). O gestor não fica no escuro: o summary
    # informa quais dados destravam a análise (ver _nota_escala_bloqueada).
    if _evidencia_faltante_para_escala(m, t):
        return None

    cpa_otimo       = m.cpa <= t.max_cpa * t.scale_cpa_margin
    freq_controlada = m.frequency < t.scale_frequency_ceiling
    roas_ok         = t.min_roas is None or m.roas is None or m.roas >= t.min_roas
    # Leilão caro é contraindicação de escala: injetar orçamento num CPM já
    # acima do teto compra impressão mais cara ainda. Reproduzido em 2026-07-28:
    # CPM 3x o teto com CPA ainda ok abria janela de escala.
    leilao_ok       = m.cpm is None or m.cpm <= t.max_cpm
    nao_aprendendo  = (
        m.learning_phase is False
        if m.learning_phase is not None
        else m.weekly_conversions >= t.min_weekly_conversions
    )

    if not (cpa_otimo and freq_controlada and roas_ok and nao_aprendendo and leilao_ok):
        return None

    margem_pct = round((1 - m.cpa / t.max_cpa) * 100, 1)
    # `is not None` e não truthiness: ROAS 0.0 e frequência 0.0 são valores
    # medidos, não ausência de medição.
    roas_info  = f" ROAS {m.roas:.1f}x acima da meta de {t.min_roas:.1f}x." if (m.roas is not None and t.min_roas is not None) else ""
    freq_info  = f" Frequência {m.frequency:.1f} — audiência ainda fresca." if m.frequency is not None else ""

    return ScenarioDetail(
        code=ScenarioCode.VERTICAL_SCALE,
        title="Cenário G — Janela de Escala Vertical Ativa (Alta Performance)",
        root_cause=(
            f"CPA R${m.cpa:.2f} está {margem_pct:.0f}% abaixo da meta de R${t.max_cpa:.2f}.{roas_info}{freq_info} "
            "Criativo com tração máxima. Leilão favorável. Margem para injetar orçamento sem estourar o CPA."
        ),
        funnel_impact=(
            "Orçamento estático nesta janela = oportunidade desperdiçada. "
            "Algoritmo estável e otimizado — cada R$ adicional tende a gerar retorno proporcional."
        ),
        action="Executar Escala Vertical Automatizada — aumentar orçamento agora.",
        execution_rule=(
            "Aumentar orçamento entre 15% e 20% a cada 24h. "
            "Nunca aumentar mais de 30% de uma vez — reinicia o aprendizado do algoritmo. "
            "Monitorar CPC e CPM nas próximas 48h após cada aumento. "
            f"Regra de parada: se CPA subir mais de 10% (acima de R${t.max_cpa * 1.1:.2f}), estabilizar."
        ),
        priority=1,
    )


def _detect_horizontal_scale(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário H — Frequência subindo mas CPA ainda ok: hora de expandir para novos públicos."""
    if m.frequency is None or m.cpa is None or t.max_cpa is None:
        return None

    freq_subindo = m.frequency > t.max_frequency_horizontal
    cpa_ok       = m.cpa <= t.max_cpa
    nao_fadiga   = m.frequency <= t.max_frequency_fatigue  # Fadiga plena já é Cenário E

    if not (freq_subindo and cpa_ok and nao_fadiga):
        return None

    cpm_info = f" CPM R${m.cpm:.2f} subindo — leilão ficando mais caro." if (m.cpm is not None and m.cpm > t.max_cpm) else ""
    estimativa = round((t.max_frequency_fatigue - m.frequency) / 0.3)
    prazo = f" Estimativa: {estimativa} dia(s) antes do colapso se não agir." if estimativa > 0 else ""

    return ScenarioDetail(
        code=ScenarioCode.HORIZONTAL_SCALE,
        title="Cenário H — Escala Horizontal por Fadiga Iminente de Público",
        root_cause=(
            f"Frequência {m.frequency:.1f} crescendo (limite de alerta: {t.max_frequency_horizontal}). "
            f"CPA R${m.cpa:.2f} ainda dentro da meta — anúncio performa, mas audiência está saturando.{cpm_info}{prazo}"
        ),
        funnel_impact=(
            "Campanha ainda entrega, mas prestes a colapsar. "
            "Manter orçamento só na audiência atual vai causar queda abrupta de performance."
        ),
        action="Duplicar estrutura para novos públicos — Escala Horizontal.",
        execution_rule=(
            "Manter conjunto atual ativo sem alterar orçamento. "
            "Criar novos conjuntos com mesmo perfil comprador: LAL de 1% dos clientes com maior LTV. "
            "Distribuição: 80% verba para novos públicos, 20% para retenção. "
            "Excluir compradores dos últimos 180 dias nas campanhas de prospecção."
        ),
        priority=2,
    )


def _detect_learning_phase(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário I — Conjunto em aprendizado limitado ou volume insuficiente para o algoritmo otimizar."""
    em_aprendizado = m.learning_phase is True
    volume_baixo   = m.weekly_conversions is not None and m.weekly_conversions < t.min_weekly_conversions

    if not (em_aprendizado or volume_baixo):
        return None

    conv_info = ""
    if m.weekly_conversions is not None:
        deficit = t.min_weekly_conversions - m.weekly_conversions
        conv_info = (
            f" {m.weekly_conversions} conversões nos últimos 7 dias "
            f"(meta: {t.min_weekly_conversions}+ — deficit de {deficit})."
        )

    gasto_info = f" Gasto R${m.spend:.2f} com CPA instável de R${m.cpa:.2f}." if (m.spend is not None and m.cpa is not None) else ""

    return ScenarioDetail(
        code=ScenarioCode.LEARNING_PHASE,
        title="Cenário I — Gargalo de Aprendizado Limitado (Learning Phase Hell)",
        root_cause=(
            f"{'Conjunto com status Aprendizado Limitado no Meta Ads.' if em_aprendizado else ''}"
            f"{conv_info}{gasto_info} "
            "Estrutura muito fragmentada ou evento de otimização raro — Meta sem dados suficientes para otimizar."
        ),
        funnel_impact=(
            "Entrega instável, CPC volátil, CPA imprevisível. "
            "Orçamento consumido sem aprendizado real."
        ),
        action="Consolidação de conjuntos e subida de funil de otimização.",
        execution_rule=(
            "1. Fundir conjuntos semelhantes que competem no mesmo leilão. "
            f"2. Se orçamento insuficiente para {t.min_weekly_conversions} conversões/semana, "
            "mudar evento de otimização para passo anterior do funil: "
            "Purchase → Initiate Checkout → Add to Cart → Trial Started → Lead. "
            "3. Quando atingir volume no evento intermediário, subir o funil novamente."
        ),
        priority=1,
    )


def _detect_overspending(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário J — CPM caro com LP ok e CPA alto: orçamento além do ponto de eficiência."""
    if m.cpm is None or m.lp_conversion_rate is None or m.cpa is None or t.max_cpa is None:
        return None

    cpm_alto    = m.cpm > t.max_cpm
    lp_saudavel = m.lp_conversion_rate >= t.min_lp_conversion_rate
    cpa_alto    = m.cpa > t.max_cpa

    if not (cpm_alto and lp_saudavel and cpa_alto):
        return None

    economia = ""
    if m.spend is not None and m.conversions is not None and m.conversions > 0:
        cpa_estimado = (m.spend * 0.85) / m.conversions
        economia = f" Com redução de 15% do orçamento, CPA estimado: R${cpa_estimado:.2f}."

    return ScenarioDetail(
        code=ScenarioCode.OVERSPENDING,
        title="Cenário J — Janela de Eficiência (Overspending sem Retorno)",
        root_cause=(
            f"CPM R${m.cpm:.2f} acima do teto de R${t.max_cpm:.2f} com LP convertendo bem "
            f"({m.lp_conversion_rate:.1f}%). Orçamento ultrapassou ponto de inflexão do público — "
            f"campanha força entrega em horários de alta concorrência.{economia}"
        ),
        funnel_impact=(
            "Retornos decrescentes: vendas estagnadas com custo subindo. "
            "CPA acima do teto mesmo com funil saudável — problema estrutural de orçamento."
        ),
        action="Reduzir teto de gastos e ativar programação de horário.",
        execution_rule=(
            "1. Reduzir orçamento diário em 15%. "
            "2. Mudar para veiculação 'Programada' (Orçamento Total). "
            "3. Concentrar exibição nos horários com maior volume histórico de conversões "
            "(geralmente seg–sex 08h–20h para B2B; noite/fim de semana para B2C). "
            "4. Monitorar CPM e CPA nas 72h seguintes."
        ),
        priority=2,
    )


# ─────────────────────────────────────────────────────────────────────────────
# CENÁRIOS L–O — lacunas fechadas em 2026-07-28
#
# Levantadas rodando situações comuns de tráfego pago contra o engine e vendo
# o que ele respondia. As cinco piores respostas eram todas variações de
# "Manter campanha ativa. Monitorar métricas nas próximas 48h." em cima de
# problema real. Nenhum campo novo de schema: os dados já chegavam.
# ─────────────────────────────────────────────────────────────────────────────

# Abaixo disto, a média de custo é ruído: um resultado a mais ou a menos muda o
# CPA em dezenas de por cento. Não é um limiar estatístico formal — é o piso a
# partir do qual faz sentido conversar sobre CPA sem enganar o gestor.
_MIN_CONVERSOES_CONFIAVEL = 10
_MIN_CONVERSOES_ESTAVEL = 30


def _detect_no_return(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """
    Cenário L — Gasto relevante sem NENHUMA conversão.

    O buraco mais grave que o engine tinha: com `conversions=0` o CPA não é
    derivável (divisão por zero), então nenhum detector de custo disparava e a
    campanha que mais sangra dinheiro recebia "manter ativa, monitorar 48h".
    Reproduzido: R$ 2.000 gastos, 1.600 cliques, zero conversão → score 84,
    nenhum cenário.

    `conversions == 0` precisa ser explícito (não `None`): campanha de tráfego
    ou awareness que nem envia conversões não deve ser acusada de nada.
    """
    if m.conversions is None or m.conversions != 0 or m.spend is None or m.spend <= 0:
        return None

    # "Gasto relevante" = já passou do ponto em que uma conversão na meta
    # deveria ter acontecido. Sem meta de CPA, exige volume de clique real,
    # para não acusar campanha que mal começou a rodar.
    if t.max_cpa is not None:
        relevante = m.spend >= t.max_cpa
        referencia = f"o teto de CPA (R${t.max_cpa:.2f})"
    else:
        relevante = (m.link_clicks or 0) >= 100
        referencia = "volume de cliques suficiente para esperar resultado"
    if not relevante:
        return None

    perdido = f"R${m.spend:.2f}"
    sinais = []
    if m.link_clicks is not None:
        sinais.append(f"{m.link_clicks} cliques no link")
    if m.landing_page_views is not None:
        sinais.append(f"{m.landing_page_views} visitas à página")
    trafego = f" Tráfego entregue: {', '.join(sinais)}." if sinais else ""

    return ScenarioDetail(
        code=ScenarioCode.NO_RETURN,
        title="Cenário L — Gasto sem Retorno (Zero Conversão)",
        root_cause=(
            f"{perdido} investidos e NENHUMA conversão registrada — o gasto já passou "
            f"{referencia}.{trafego} Quando há tráfego mas nenhuma conversão, o problema "
            "está depois do clique: rastreamento quebrado, página fora do ar/lenta, "
            "formulário com erro ou oferta sem aderência ao público."
        ),
        funnel_impact=(
            "Cada real a mais é perda direta: não existe CPA para otimizar porque não "
            "existe conversão. O algoritmo também não aprende — sem evento de conversão "
            "ele não tem sinal para otimizar entrega."
        ),
        action="Pausar a veiculação e validar rastreamento e página antes de gastar mais.",
        execution_rule=(
            "1. Conferir se o pixel/evento de conversão está disparando (Gerenciador de Eventos / teste ao vivo). "
            "2. Abrir a página do anúncio no celular, em rede móvel, e completar a conversão manualmente. "
            "3. Se a conversão manual funciona, o problema é rastreamento; se não funciona, é a página. "
            "4. Só religar a campanha depois de uma conversão de teste registrada de ponta a ponta."
        ),
        priority=1,
    )


def _detect_low_sample(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """
    Cenário M — Poucas conversões: a amostra não sustenta conclusão.

    Reproduzido: 2 conversões, todas as métricas "ótimas" → score 100, status
    Escalável, ação "aumentar orçamento agora". Duas conversões não sustentam
    afirmação nenhuma sobre CPA — a próxima conversão (ou a falta dela) muda o
    número em 50%. Este cenário existe para o produto dizer "ainda não sei",
    que é diferente de "está tudo bem".

    Prioridade 3 (monitorar) de propósito: não é um problema da campanha, é um
    limite do que dá para afirmar sobre ela. Quem barra a escala é a regra de
    supressão M→G, não a severidade.
    """
    if m.conversions is None or m.spend is None or m.spend <= 0:
        return None
    # Zero conversão é o Cenário L, que é mais grave e tem outra ação.
    if m.conversions == 0 or m.conversions >= _MIN_CONVERSOES_CONFIAVEL:
        return None

    cpa_info = ""
    if m.cpa is not None:
        variacao = m.spend / (m.conversions + 1)
        cpa_info = (
            f" O CPA de R${m.cpa:.2f} vem de {m.conversions} resultado(s): "
            f"uma única conversão a mais já o levaria para R${variacao:.2f}."
        )

    return ScenarioDetail(
        code=ScenarioCode.LOW_SAMPLE,
        title="Cenário M — Amostra Insuficiente para Conclusão",
        root_cause=(
            f"Apenas {m.conversions} conversão(ões) registrada(s) com R${m.spend:.2f} investidos."
            f"{cpa_info} Com esse volume, qualquer leitura de CPA, ROAS ou eficiência é ruído — "
            "não há dados para separar acerto de sorte."
        ),
        funnel_impact=(
            "Decidir escala, pausa ou troca de criativo agora é apostar, não otimizar. "
            "O algoritmo do Meta também precisa de volume de evento para sair do aprendizado."
        ),
        action="Acumular volume antes de tomar decisão de orçamento ou de criativo.",
        execution_rule=(
            f"1. Manter a campanha rodando estável até somar pelo menos {_MIN_CONVERSOES_ESTAVEL} conversões "
            "(ou 7 dias completos, o que vier primeiro) — sem mexer em público, criativo ou orçamento. "
            "2. Se o volume não vier no prazo, mudar o evento de otimização para um passo anterior do funil "
            "(Compra → Início de Checkout → Lead). "
            "3. Só comparar criativos ou escalar depois desse volume."
        ),
        priority=3,
    )


def _detect_click_leak(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """
    Cenário N — O clique não vira visita.

    Reproduzido: 1.600 cliques no link → 300 visitas à LP (81% evaporou) →
    status Saudável, nenhum cenário. É o vazamento mais caro e mais invisível
    do funil: paga-se o clique e o usuário some antes de a página carregar.
    Alguma perda é normal (10–20%: cliques duplos, desistência no carregamento);
    acima de 30% é sintoma.
    """
    if m.link_clicks is None or m.landing_page_views is None:
        return None
    if m.link_clicks < 50:   # abaixo disso a proporção é ruído
        return None

    aproveitamento = m.landing_page_views / m.link_clicks
    if aproveitamento >= 0.7:
        return None

    perdidos = m.link_clicks - m.landing_page_views
    perda_pct = (1 - aproveitamento) * 100
    custo_info = ""
    if m.spend is not None and m.link_clicks > 0:
        custo_clique = m.spend / m.link_clicks
        custo_info = f" A perda equivale a R${perdidos * custo_clique:.2f} do investimento."

    return ScenarioDetail(
        code=ScenarioCode.CLICK_LEAK,
        title="Cenário N — Vazamento entre o Clique e a Página",
        root_cause=(
            f"{m.link_clicks} cliques no link geraram apenas {m.landing_page_views} visitas à página "
            f"— {perda_pct:.0f}% se perderam no caminho ({perdidos} cliques pagos sem chegada)."
            f"{custo_info} Perda normal fica entre 10% e 20%; acima disso o padrão é página lenta no "
            "celular, redirecionamento na chegada ou pixel de visita não disparando."
        ),
        funnel_impact=(
            "O anúncio funciona e o dinheiro é gasto, mas o funil começa vazio. "
            "Toda métrica abaixo deste ponto (conversão da LP, CPA) fica distorcida para pior "
            "sem que a causa esteja no anúncio nem na oferta."
        ),
        action="Medir o tempo de carregamento no celular e conferir o disparo do evento de visita.",
        execution_rule=(
            "1. Testar a página no PageSpeed Insights em modo celular — alvo abaixo de 3s. "
            "2. Abrir o anúncio pelo próprio app (Instagram/Facebook) e cronometrar até a página aparecer. "
            "3. Conferir no Gerenciador de Eventos se o evento de visita dispara em todo carregamento. "
            "4. Eliminar redirecionamentos e parâmetros de rastreio que atrasem a primeira renderização."
        ),
        priority=1 if aproveitamento < 0.5 else 2,
    )


def _detect_low_revenue(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """
    Cenário O — Vende, mas não lucra.

    Reproduzido: ROAS 1,2x contra meta de 3,0x, CPA dentro do teto → nenhum
    cenário, "monitorar". O ROAS aparecia vermelho no semáforo e nada explicava
    a causa. Quando o custo de aquisição está sob controle mas o retorno não
    fecha, o gargalo não é mídia: é ticket médio, mix de produto ou margem.
    """
    if m.roas is None or t.min_roas is None or m.cpa is None or t.max_cpa is None:
        return None

    roas_baixo = m.roas < t.min_roas
    custo_ok = m.cpa <= t.max_cpa
    if not (roas_baixo and custo_ok):
        return None

    critico = m.roas < t.min_roas * 0.5
    ticket_info = ""
    if m.conversions is not None and m.conversions > 0 and m.spend is not None:
        ticket_atual = (m.spend * m.roas) / m.conversions
        ticket_alvo = (m.spend * t.min_roas) / m.conversions
        ticket_info = (
            f" Ticket médio atual: R${ticket_atual:.2f}; para bater a meta seria preciso "
            f"R${ticket_alvo:.2f} por conversão."
        )

    return ScenarioDetail(
        code=ScenarioCode.LOW_REVENUE,
        title="Cenário O — Receita Abaixo da Meta com Custo sob Controle",
        root_cause=(
            f"ROAS {m.roas:.1f}x {'criticamente ' if critico else ''}abaixo da meta de {t.min_roas:.1f}x, "
            f"mas o CPA de R${m.cpa:.2f} está dentro do teto de R${t.max_cpa:.2f} — a campanha compra "
            f"conversão pelo preço combinado.{ticket_info} O gargalo não está na mídia: está no valor "
            "de cada conversão (ticket, mix de produtos ou desconto)."
        ),
        funnel_impact=(
            "Baixar mais o CPA tem pouco espaço para resolver — mesmo comprando mais barato, "
            "a conta não fecha se cada venda vale pouco. Escalar assim multiplica o prejuízo "
            "em vez do lucro."
        ),
        action="Atacar o valor por conversão em vez do custo por conversão.",
        execution_rule=(
            "1. Conferir se o valor de conversão enviado ao Meta é o real (frete/imposto/desconto). "
            "2. Subir ticket com order bump, upsell no checkout ou kit/combo na oferta principal. "
            "3. Direcionar a campanha para o produto de maior margem, não para o mais vendido. "
            f"4. Recalcular: com o ticket atual, o CPA que fecha a meta de {t.min_roas:.1f}x é menor que o teto vigente."
        ),
        priority=1 if critico else 2,
    )


def _detect_retargeting_cannibal(m: Metrics, t: Targets) -> ScenarioDetail | None:
    """Cenário K — ROAS absurdamente alto + frequência crítica: retargeting "roubando" vendas orgânicas."""
    if m.roas is None or m.frequency is None:
        return None

    if not (m.roas > 10.0 and m.frequency > t.max_frequency_critical):
        return None

    topo_info = ""
    if m.ctr_link is not None and m.ctr_link < t.min_ctr_link:
        topo_info = (
            f" CTR Link {m.ctr_link:.2f}% em queda — "
            "topo de funil desabastecido confirmando que não entram novos usuários na base."
        )

    return ScenarioDetail(
        code=ScenarioCode.RETARGETING_CANNIBAL,
        title="Cenário K — Otimização de Retargeting Ineficiente (Efeito Canibalização)",
        root_cause=(
            f"ROAS {m.roas:.1f}x com frequência {m.frequency:.1f} — ilusão estatística. "
            "Retargeting coletando apenas quem compraria organicamente de qualquer forma. "
            f"Marca pagando por cliques redundantes.{topo_info}"
        ),
        funnel_impact=(
            "Novas visitas caindo. Base de clientes estagnada. "
            "ROAS alto mascarando problema estrutural: sem topo de funil, retargeting colapsa em semanas."
        ),
        action="Rebalanceamento urgente de verba entre prospecção e retargeting.",
        execution_rule=(
            "1. Reduzir verba de retargeting para no máximo 10–15% do orçamento total. "
            "2. Redirecionar verba para campanhas de prospecção (topo de funil). "
            "3. Excluir visitantes dos últimos 30 dias e compradores dos últimos 180 dias nas campanhas de prospecção. "
            "4. Mudar criativo de retargeting de 'institucional' para 'quebra de objeções' ou 'oferta de urgência com escassez'."
        ),
        priority=1,
    )


# ─────────────────────────────────────────────────────────────────────────────
# AVALIAÇÃO INDIVIDUAL DE MÉTRICAS
# ─────────────────────────────────────────────────────────────────────────────

# Tabela de configuração das métricas avaliáveis.
# Cada entrada: (campo do Metrics, label, attr_target, fator_red, inverted, notas_por_status)
# - fator_red: multiplicador aplicado ao target para definir o threshold de RED
# - notas_por_status: textos para GREEN/YELLOW/RED — usar {meta} e {value} como placeholders
_METRIC_EVAL_CONFIG = [
    ("hook_rate", "Hook Rate", "min_hook_rate", 0.7, False, {
        "GREEN":  "Meta: >{meta:.0f}%. ✓ Criativo capta atenção no feed.",
        "YELLOW": "Meta: >{meta:.0f}%. ⚠ Gancho fraco — público rola sem parar.",
        "RED":    "Meta: >{meta:.0f}%. ✗ Crítico — criativo invisível no feed. Refazer abertura.",
    }),
    # Hold Rate usa threshold fixo de 10% (não proporcional ao target)
    ("hold_rate", "Hold Rate", "min_hold_rate", None, False, {
        "GREEN":  "Meta: >{meta:.0f}%. ✓ Vídeo mantém atenção até a oferta.",
        "YELLOW": "Meta: >{meta:.0f}%. ⚠ Abandono precoce — revisar ritmo do vídeo.",
        "RED":    "Meta: >{meta:.0f}%. ✗ Crítico — público abandona antes da CTA.",
    }),
    ("ctr_link", "CTR Link", "min_ctr_link", 0.5, False, {
        "GREEN":  "Meta: >{meta:.1f}%. ✓ Intenção de clique saudável.",
        "YELLOW": "Meta: >{meta:.1f}%. ⚠ CTR Link abaixo do esperado.",
        "RED":    "Meta: >{meta:.1f}%. ✗ Sem intenção comercial — CTA ausente ou fraca.",
    }),
    ("cpa", "CPA", "max_cpa", 1.3, True, None),  # CPA tem nota customizada com delta %
    ("cpl", "CPL", "max_cpl", 1.3, True, {
        "GREEN":  "Meta: <R${meta:.2f}. ✓ Custo por lead dentro da meta.",
        "YELLOW": "Meta: <R${meta:.2f}. ⚠ CPL acima da meta.",
        "RED":    "Meta: <R${meta:.2f}. ✗ CPL crítico — lead saindo caro demais.",
    }),
    ("roas", "ROAS", "min_roas", 0.7, False, {
        "GREEN":  "Meta: >{meta:.1f}x. ✓ ROAS {value:.1f}x — retorno saudável.",
        "YELLOW": "Meta: >{meta:.1f}x. ⚠ ROAS abaixo da meta.",
        "RED":    "Meta: >{meta:.1f}x. ✗ ROAS crítico — campanha destruindo caixa.",
    }),
    ("cpc", "CPC", "max_cpc", 1.3, True, {
        "GREEN":  "Meta: <R${meta:.2f}. ✓ Custo por clique dentro do teto.",
        "YELLOW": "Meta: <R${meta:.2f}. ⚠ CPC acima do teto.",
        "RED":    "Meta: <R${meta:.2f}. ✗ CPC crítico — cada clique caro demais.",
    }),
    ("lp_conversion_rate", "Conversão LP", "min_lp_conversion_rate", 0.5, False, {
        "GREEN":  "Meta: >{meta:.1f}%. ✓ Landing Page convertendo bem.",
        "YELLOW": "Meta: >{meta:.1f}%. ⚠ Conversão abaixo do esperado.",
        "RED":    "Meta: >{meta:.1f}%. ✗ LP com problema crítico — gargalo fora da campanha.",
    }),
]


def _evaluate_one(field: str, label: str, target_attr: str, fator_red,
                  inverted: bool, notas: dict, m: Metrics, t: Targets) -> MetricEvaluation | None:
    """Avalia uma métrica genérica usando a config da tabela _METRIC_EVAL_CONFIG."""
    value = getattr(m, field, None)
    target = getattr(t, target_attr, None)
    if value is None or target is None:
        return None

    # Hold Rate usa um piso absoluto de 10% para RED em vez de proporção ao target.
    # O `min` com 70% do target é o que mantém as faixas ordenadas: com um piso fixo
    # de 10, um gestor que baixasse min_hold_rate para menos de 10 teria o limiar de
    # RED ACIMA da própria meta, invertendo o semáforo — um valor que SUPERA a meta
    # saía RED com score 100 (métrica "crítica" e "perfeita" na mesma tela).
    # Com o default (target 15) o resultado continua exatamente 10.0.
    threshold_red = (target * fator_red) if fator_red is not None else min(10.0, target * 0.7)
    st = _status(value, threshold_red, target, inverted=inverted)
    note = notas[st.value].format(meta=target, value=value)
    score = _calc_score(value, target, inverted=inverted)
    return MetricEvaluation(
        metric=label, value=float(value), status=st,
        score=max(0, min(100, score)), note=note,
    )


def _evaluate_metrics(m: Metrics, t: Targets) -> list[MetricEvaluation]:
    """
    Avalia cada métrica individualmente — status semafórico + score 0–100.
    Métricas ausentes são puladas. Algumas métricas (CTR Todos, Conversões/semana,
    CPM, Frequência, CPA) têm lógica customizada e ficam fora da tabela.
    """
    evals: list[MetricEvaluation] = []

    # Métricas com avaliação padronizada (tabela)
    for field, label, target_attr, fator_red, inverted, notas in _METRIC_EVAL_CONFIG:
        if notas is None:
            continue  # CPA é tratado abaixo (precisa de delta %)
        result = _evaluate_one(field, label, target_attr, fator_red, inverted, notas, m, t)
        if result is not None:
            evals.append(result)

    # CPA — nota customizada com delta percentual em relação à meta
    if m.cpa is not None and t.max_cpa is not None:
        st = _status(m.cpa, t.max_cpa * 1.3, t.max_cpa, inverted=True)
        delta = ((m.cpa / t.max_cpa) - 1) * 100
        notas_cpa = {
            CampaignStatus.GREEN:  f"Meta: <R${t.max_cpa:.2f}. ✓ CPA {abs(delta):.0f}% abaixo da meta.",
            CampaignStatus.YELLOW: f"Meta: <R${t.max_cpa:.2f}. ⚠ CPA {delta:.0f}% acima da meta.",
            CampaignStatus.RED:    f"Meta: <R${t.max_cpa:.2f}. ✗ CPA {delta:.0f}% acima — campanha no vermelho.",
        }
        score = _calc_score(m.cpa, t.max_cpa, inverted=True)
        evals.append(MetricEvaluation(
            metric="CPA", value=float(m.cpa), status=st,
            score=max(0, min(100, score)), note=notas_cpa[st],
        ))

    # CTR Todos — lógica especial (cruza com CTR Link para detectar click-bait)
    if m.ctr_all is not None:
        if m.ctr_link is not None and m.ctr_all > t.max_ctr_all_ratio and m.ctr_link < 0.7:
            st = CampaignStatus.RED
            note = f"✗ Click-Bait detectado: CTR Todos {m.ctr_all:.1f}% vs CTR Link {m.ctr_link:.2f}%."
        elif m.ctr_all > t.max_ctr_all_ratio:
            st = CampaignStatus.YELLOW
            note = f"⚠ CTR Todos {m.ctr_all:.1f}% elevado — monitorar se CTR Link acompanha."
        else:
            st = CampaignStatus.GREEN
            note = "✓ Proporção de engajamento saudável."
        evals.append(MetricEvaluation(metric="CTR Todos", value=float(m.ctr_all), status=st, score=50, note=note))

    # CPM — threshold padrão de R$50 (sem target customizável)
    if m.cpm is not None:
        st = _status(m.cpm, t.max_cpm * 1.3, t.max_cpm, inverted=True)
        notas_cpm = {
            CampaignStatus.GREEN:  f"Referência: <R${t.max_cpm:.2f}. ✓ Leilão eficiente.",
            CampaignStatus.YELLOW: f"Referência: <R${t.max_cpm:.2f}. ⚠ CPM elevado — leilão competitivo.",
            CampaignStatus.RED:    f"Referência: <R${t.max_cpm:.2f}. ✗ CPM crítico — público exaurido ou anúncio penalizado.",
        }
        score = _calc_score(m.cpm, t.max_cpm, inverted=True)
        evals.append(MetricEvaluation(
            metric="CPM", value=float(m.cpm), status=st,
            score=max(0, min(100, score)), note=notas_cpm[st],
        ))

    # Frequência — thresholds alinhados aos detectores para não contradizer os cards:
    #   RED    quando freq > max_frequency_fatigue (2.8)  → mesmo gatilho do Cenário E (Fadiga)
    #   YELLOW quando freq > max_frequency_horizontal (2.5) → mesma zona do Cenário H (escala horizontal)
    # Antes o RED só vinha em 2.8*1.2=3.36, o que deixava o semáforo AMARELO enquanto
    # o card de Fadiga já gritava "saturado" — contradição na mesma tela.
    if m.frequency is not None:
        st = _status(m.frequency, t.max_frequency_fatigue, t.max_frequency_horizontal, inverted=True)
        notas_freq = {
            CampaignStatus.GREEN:  f"Limite de fadiga: {t.max_frequency_fatigue}. ✓ Audiência fresca.",
            CampaignStatus.YELLOW: f"Limite de fadiga: {t.max_frequency_fatigue}. ⚠ Frequência subindo — fadiga iminente, considerar escala horizontal.",
            CampaignStatus.RED:    f"Limite de fadiga: {t.max_frequency_fatigue}. ✗ Saturação — criativo esgotado no público atual.",
        }
        score = _calc_score(m.frequency, t.max_frequency_fatigue, inverted=True)
        evals.append(MetricEvaluation(
            metric="Frequência", value=float(m.frequency), status=st,
            score=max(0, min(100, score)), note=notas_freq[st],
        ))

    # Conversões/semana — score fixo 50 (informativo, não entra no overall)
    if m.weekly_conversions is not None:
        st = _status(m.weekly_conversions, t.min_weekly_conversions * 0.5, t.min_weekly_conversions)
        notas_conv = {
            CampaignStatus.GREEN:  f"Meta: >{t.min_weekly_conversions}/semana. ✓ Volume suficiente para aprendizado estável.",
            CampaignStatus.YELLOW: f"Meta: >{t.min_weekly_conversions}/semana. ⚠ Volume baixo — risco de aprendizado limitado.",
            CampaignStatus.RED:    f"Meta: >{t.min_weekly_conversions}/semana. ✗ Volume crítico — algoritmo sem dados para otimizar.",
        }
        evals.append(MetricEvaluation(
            metric="Conversões/semana", value=float(m.weekly_conversions),
            status=st, score=50, note=notas_conv[st],
        ))

    return evals




def _calc_overall_score(metric_evals: list) -> tuple[int, int]:
    """
    Agrega os scores individuais em um score único 0–100, ponderado por relevância.
    Métricas sem peso em _METRIC_WEIGHTS (ex: CTR Todos, Conversões/semana) são
    informativas e não entram no agregado.

    Retorna (score, coverage):
      • score: 0–100, média ponderada dos scores presentes. 50 (neutro) se nada presente.
      • coverage: 0–100, % do peso TOTAL possível que foi de fato avaliado.
        Score alto com coverage baixo = poucos dados → baixa confiança.
        (Ex: só CPM presente → score pode dar 100, mas coverage ≈ 5.)
    """
    total_peso  = 0.0
    total_score = 0.0

    for ev in metric_evals:
        peso = _METRIC_WEIGHTS.get(ev.metric, 0.0)
        if peso > 0:
            total_score += ev.score * peso
            total_peso  += peso

    # Soma de todos os pesos possíveis (≈1.0) — base para o coverage.
    peso_total_possivel = sum(_METRIC_WEIGHTS.values())
    coverage = round(total_peso / peso_total_possivel * 100) if peso_total_possivel > 0 else 0

    if total_peso == 0:
        return 50, coverage

    return round(total_score / total_peso), coverage


def _score_confidence(coverage: int, m: Metrics | None = None) -> str:
    """
    Confiança no score — combina COBERTURA (quantas métricas) com AMOSTRA
    (quantos resultados sustentam as métricas de custo).

    Eram eixos separados e só o primeiro era medido, o que produzia o absurdo
    reproduzido em 2026-07-28: campanha com 2 conversões e todas as métricas
    preenchidas saía com cobertura 57% e confiança suficiente para ser rotulada
    "Escalável". Cobertura responde "quantos ângulos eu vi"; amostra responde
    "quantas vezes isso aconteceu". Um CPA apurado sobre 2 eventos não fica
    confiável só porque veio acompanhado de Hook Rate e CTR.

    A confiança é o TETO das duas leituras — a mais fraca manda.
    """
    if coverage >= 70:
        por_cobertura = "high"
    elif coverage >= 40:
        por_cobertura = "medium"
    else:
        por_cobertura = "low"

    if m is None or m.conversions is None:
        return por_cobertura

    if m.conversions < _MIN_CONVERSOES_CONFIAVEL:
        por_amostra = "low"
    elif m.conversions < _MIN_CONVERSOES_ESTAVEL:
        por_amostra = "medium"
    else:
        por_amostra = "high"

    ordem = {"low": 0, "medium": 1, "high": 2}
    return min(por_cobertura, por_amostra, key=lambda c: ordem[c])


# ─────────────────────────────────────────────────────────────────────────────
# REGRAS DE CONFLITO E SOBREPOSIÇÃO
#
# Hierarquia de supressão:
#   I  (Learning Phase)    → suprime G e H (não faz sentido escalar sem aprendizado)
#   E  (Fadiga Plena)      → suprime H (H é fadiga iminente, E já é o estado crítico)
#   D  (LP Mismatch)       → suprime F (não acusar lead frio quando o gargalo é a LP)
#   A  (Gancho Fraco)      → suprime B (se não capta atenção, retenção é irrelevante)
#   K  (Retargeting Caníbal) → suprime G (ROAS alto do retargeting não é janela de escala real)
#   G  (Escala Vertical)   → suprime H (escala vertical e horizontal são mutuamente exclusivas)
# ─────────────────────────────────────────────────────────────────────────────

def _apply_conflict_rules(scenarios: list[ScenarioDetail]) -> list[ScenarioDetail]:
    """
    Aplica regras de supressão entre cenários para evitar diagnósticos contraditórios.
    Ex: se A (Gancho Fraco) está ativo, suprime B (Retenção) — sem atenção inicial,
    falar de retenção é irrelevante.
    """
    if not scenarios:
        return scenarios

    active_codes = {s.code for s in scenarios}
    suppressed: set[ScenarioCode] = set()

    # Cada regra: SE cenário-pai presente, suprime cenários-filhos.
    suppression_rules = [
        # I (Learning Phase) → suprime G e H: não escalar sem aprendizado
        (ScenarioCode.LEARNING_PHASE, {ScenarioCode.VERTICAL_SCALE, ScenarioCode.HORIZONTAL_SCALE}),
        # E (Fadiga Plena) → suprime H: E já engloba o estado crítico
        (ScenarioCode.CREATIVE_FATIGUE, {ScenarioCode.HORIZONTAL_SCALE}),
        # D (LP Mismatch) → suprime F: gargalo é a LP, não a persona
        (ScenarioCode.LP_MISMATCH, {ScenarioCode.COLD_LEAD}),
        # A (Gancho Fraco) → suprime B: sem atenção inicial, retenção é secundária
        (ScenarioCode.WEAK_HOOK, {ScenarioCode.LOW_RETENTION}),
        # K (Retargeting Caníbal) → suprime G: ROAS alto do retargeting não é escala real
        (ScenarioCode.RETARGETING_CANNIBAL, {ScenarioCode.VERTICAL_SCALE}),
        # G (Escala Vertical) → suprime H: escalas vertical e horizontal são excludentes
        (ScenarioCode.VERTICAL_SCALE, {ScenarioCode.HORIZONTAL_SCALE}),
        # M (Amostra Insuficiente) → suprime G e H: com menos de 10 conversões não
        # há base para afirmar que a campanha suporta MAIS orçamento. Mesmo
        # princípio de I→G, mas por volume de resultado em vez de fase do algoritmo.
        (ScenarioCode.LOW_SAMPLE, {ScenarioCode.VERTICAL_SCALE, ScenarioCode.HORIZONTAL_SCALE}),
        # L (Gasto sem Retorno) → suprime M: zero conversão já é o diagnóstico;
        # dizer "amostra pequena" ao lado seria suavizar o que é crítico.
        (ScenarioCode.NO_RETURN, {ScenarioCode.LOW_SAMPLE}),
    ]

    for parent, children in suppression_rules:
        if parent in active_codes:
            suppressed.update(children)

    return [s for s in scenarios if s.code not in suppressed]

# ─────────────────────────────────────────────────────────────────────────────
# STATUS FINAL E SUMÁRIO
# ─────────────────────────────────────────────────────────────────────────────

_STATUS_SEVERITY = {
    CampaignStatus.GREEN: 0,
    CampaignStatus.YELLOW: 1,
    CampaignStatus.RED: 2,
}


def _weighted_reds(metric_evals: list) -> list:
    """Métricas em RED que têm peso no score (informativas ficam de fora)."""
    return [
        e for e in metric_evals
        if e.status == CampaignStatus.RED and _METRIC_WEIGHTS.get(e.metric, 0.0) > 0
    ]


def _weighted_yellows(metric_evals: list) -> list:
    """Métricas em YELLOW que têm peso no score (informativas ficam de fora)."""
    return [
        e for e in metric_evals
        if e.status == CampaignStatus.YELLOW and _METRIC_WEIGHTS.get(e.metric, 0.0) > 0
    ]


def _resolve_final_status(
    scenarios: list[ScenarioDetail],
    metric_evals: list | None = None,
    overall_score: int | None = None,
) -> CampaignStatus:
    """
    Calcula o status final combinando DUAS fontes de evidência:

      1. Cenários detectados (causa raiz confirmada) — regra original.
      2. Evidência métrica crua (dano observado) — escalonamento novo.

    O status final é o PIOR dos dois. Isso corrige a falha em que baixa
    cobertura de dados impedia detectores críticos de disparar e a campanha
    parecia "mais verde" do que era (ex: ROAS 1.1x + CPA 53% estourado = YELLOW).
    Severidade responde a "quão grave é a situação"; a cobertura responde a
    "quão certo o engine está da causa" — são eixos separados.

    Regra especial preservada: cenário de escala (G) sozinho não é RED.
    """
    # ── Fonte 1: status por cenários (lógica original) ──
    nao_escala = [s for s in scenarios if s.code != ScenarioCode.VERTICAL_SCALE]
    if not nao_escala:
        scenario_status = CampaignStatus.GREEN
    elif any(s.priority == 1 for s in nao_escala):
        scenario_status = CampaignStatus.RED
    else:
        scenario_status = CampaignStatus.YELLOW

    # Compat: chamadas antigas sem métricas mantêm comportamento original.
    if metric_evals is None or overall_score is None:
        return scenario_status

    # ── Fonte 2: status por evidência métrica ──
    reds = _weighted_reds(metric_evals)
    yellows = _weighted_yellows(metric_evals)
    if overall_score < 40 or len(reds) >= 3:
        metric_status = CampaignStatus.RED
    elif overall_score < 60 or reds or yellows:
        metric_status = CampaignStatus.YELLOW
    else:
        metric_status = CampaignStatus.GREEN

    return max(scenario_status, metric_status, key=_STATUS_SEVERITY.get)


# Campos de input que destravam os detectores de causa raiz mais importantes.
# Usado para orientar o gestor sobre O QUE enviar quando o diagnóstico é parcial.
_MISSING_DATA_HINTS = [
    ("hook_rate", "Hook Rate (ou video_views_3s + impressões)"),
    ("hold_rate", "Hold Rate (ou thruplays)"),
    ("ctr_all", "CTR Todos (ou all_clicks)"),
    ("lp_conversion_rate", "conversão de LP (ou landing_page_views + conversões)"),
]


def _partial_diagnosis_note(
    m: Metrics, metric_evals: list, coverage: int,
    scenarios: list[ScenarioDetail] | None = None,
) -> str:
    """
    Quando existem métricas RED ponderadas sem cobertura completa de dados,
    o engine pode ter perdido a causa raiz real (detectores sem input não disparam).
    Em vez de silêncio, devolvemos orientação acionável: quais métricas estão
    críticas SEM explicação (as citadas nos cenários detectados já têm causa)
    e quais dados enviar para completar o diagnóstico.
    """
    if coverage >= 100:
        return ""
    reds = _weighted_reds(metric_evals)
    if not reds:
        return ""

    # Métricas já citadas na causa raiz de algum cenário detectado têm explicação.
    # Heurística textual (labels do engine aparecem literalmente nos root_cause).
    texto_cenarios = " ".join(
        f"{s.title} {s.root_cause}" for s in (scenarios or [])
    ).lower()
    reds = [e for e in reds if e.metric.lower() not in texto_cenarios]
    if not reds:
        return ""

    nomes_red = ", ".join(e.metric for e in reds[:4])
    faltantes = [hint for field, hint in _MISSING_DATA_HINTS if getattr(m, field, None) is None]
    orientacao = f" Envie {'; '.join(faltantes[:3])} para diagnóstico completo." if faltantes else ""

    return (
        f" Diagnóstico parcial (cobertura {coverage}%): "
        f"{nomes_red} em nível crítico sem causa raiz totalmente confirmada.{orientacao}"
    )


def _nota_escala_bloqueada(m: Metrics, t: Targets, scenarios: list[ScenarioDetail]) -> str:
    """
    CPA com folga mas sem evidência para confirmar a janela de escala.

    Sem esta nota o gestor veria apenas "campanha dentro dos parâmetros" e não
    saberia que existe um CPA folgado nem o que enviar para destravar a análise
    de escala. A diferença em relação ao comportamento antigo é o verbo: aqui o
    engine diz "não posso afirmar", em vez de recomendar aumento de orçamento.
    """
    if scenarios or not _cpa_com_folga(m, t):
        return ""
    faltando = _evidencia_faltante_para_escala(m, t)
    if not faltando:
        return ""
    return (
        f" CPA com folga em relação à meta, mas sem evidência suficiente para "
        f"confirmar janela de escala — envie {'; '.join(faltando)} "
        "para avaliar aumento de orçamento com segurança."
    )


def _build_summary(
    scenarios: list[ScenarioDetail],
    status: CampaignStatus,
    metric_evals: list | None = None,
    m: Metrics | None = None,
    coverage: int = 100,
    t: Targets | None = None,
) -> str:
    """Monta o resumo textual da análise — achados principais + ressalva de cobertura."""
    nota_parcial = ""
    if metric_evals is not None and m is not None:
        nota_parcial = _partial_diagnosis_note(m, metric_evals, coverage, scenarios)
    if m is not None and t is not None:
        nota_parcial += _nota_escala_bloqueada(m, t, scenarios)

    if not scenarios:
        base = (
            "Campanha operando dentro dos parâmetros esperados. "
            "Nenhum gargalo crítico identificado. Manter monitoramento regular."
        )
        return base + nota_parcial

    criticos = [s for s in scenarios if s.priority == 1 and s.code != ScenarioCode.VERTICAL_SCALE]
    urgentes = [s for s in scenarios if s.priority == 2]
    escala   = [s for s in scenarios if s.code == ScenarioCode.VERTICAL_SCALE]

    partes = []
    if criticos:
        partes.append(f"{len(criticos)} problema(s) crítico(s): {', '.join(s.title.split('—')[0].strip() for s in criticos)}")
    if urgentes:
        partes.append(f"{len(urgentes)} ponto(s) de atenção: {', '.join(s.title.split('—')[0].strip() for s in urgentes)}")
    if escala:
        partes.append("1 janela de escala vertical identificada — oportunidade de crescimento")

    return ". ".join(partes) + ". Resolver em ordem de prioridade." + nota_parcial


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def analyze_campaign(data: AnalyzeInput) -> CampaignAnalysisResponse:
    """
    Entry point síncrono — analisa uma campanha usando apenas o engine de regras.
    NÃO chama a IA (para isso use `analyze_campaign_async`).
    Útil para testes, scripts em background, ou quando IA não é necessária.
    """
    # 1. Calcular métricas derivadas dos dados brutos
    m = _preprocess(data.metrics)
    t = data.targets

    # 2. Rodar todos os detectores
    detectors = [
        _detect_learning_phase,        # I — infra primeiro (compromete tudo)
        _detect_weak_hook,             # A — atenção
        _detect_low_retention,         # B — retenção
        _detect_click_bait,            # C — intenção comercial
        _detect_lp_mismatch,           # D — landing page
        _detect_creative_fatigue,      # E — saturação
        _detect_cold_lead,             # F — qualidade de lead
        _detect_vertical_scale,        # G — oportunidade de escala
        _detect_horizontal_scale,      # H — expansão de audiência
        _detect_overspending,          # J — eficiência de orçamento
        _detect_retargeting_cannibal,  # K — canibalização
        _detect_no_return,             # L — gasto sem nenhuma conversão
        _detect_low_sample,            # M — amostra insuficiente
        _detect_click_leak,            # N — clique que não vira visita
        _detect_low_revenue,           # O — receita abaixo da meta
    ]

    scenarios = []
    for detect in detectors:
        result = detect(m, t)
        if result:
            scenarios.append(result)

    # 3. Aplicar regras de conflito e sobreposição
    scenarios = _apply_conflict_rules(scenarios)

    # 4. Ordenar por prioridade (1 = crítico primeiro)
    scenarios.sort(key=lambda s: s.priority)

    # 5. Avaliar métricas individualmente
    metric_evals = _evaluate_metrics(m, t)

    # 6. Montar resposta
    # Ordem importa: score e cobertura primeiro (o status agora depende deles),
    # depois status (pior entre cenários e evidência métrica), depois summary.
    overall_score, score_coverage = _calc_overall_score(metric_evals)
    score_confidence = _score_confidence(score_coverage, m)
    final_status   = _resolve_final_status(scenarios, metric_evals, overall_score)
    summary        = _build_summary(scenarios, final_status, metric_evals, m, score_coverage, t)
    primary_action = scenarios[0].action if scenarios else "Manter campanha ativa. Monitorar métricas nas próximas 48h."

    return CampaignAnalysisResponse(
        campaign_id=data.campaign.id,
        campaign_name=data.campaign.name,
        final_status=final_status,
        overall_score=overall_score,
        score_coverage=score_coverage,
        score_confidence=score_confidence,
        summary=summary,
        scenarios=scenarios,
        metric_evaluations=metric_evals,
        primary_action=primary_action,
    )


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT ASYNC — engine primeiro, IA em cima do resultado dele
# ─────────────────────────────────────────────────────────────────────────────

async def analyze_campaign_async(data: AnalyzeInput) -> CampaignAnalysisResponse:
    """
    Versão assíncrona: roda o engine e, em seguida, a IA sobre o resultado dele.

    Os dois NÃO rodam em paralelo — a IA depende dos cenários do engine para o
    "modo complementar", então a ordem é sequencial por necessidade. O ganho do
    async aqui é não bloquear o event loop (engine vai para executor, IA aguarda
    I/O de rede), não sobrepor as duas etapas. A latência total é engine + IA,
    mas o engine roda em <50ms, então quem domina o tempo é a IA.

    Garantias:
      • Engine sempre roda (rápido, determinístico)
      • Nenhuma das duas etapas bloqueia o event loop
      • Se IA falhar/timeout, response.ai_insights = None — não afeta o resto
      • Se engine não detectar cenários E IA falhar, gera fallback mínimo
        para garantir que NUNCA retornamos análise vazia
    """
    import asyncio
    from app.service.ai_service import analyze_with_ai, is_ai_available

    # ── Engine roda em executor (é síncrono, não pode bloquear o event loop) ──
    loop = asyncio.get_running_loop()

    def run_engine():
        return analyze_campaign(data)

    engine_task = loop.run_in_executor(None, run_engine)

    # ── Aguarda o engine ──
    # A IA precisa dos cenários do engine para o "modo complementar", então esta
    # espera é obrigatória, não uma escolha de implementação.
    engine_response = await engine_task

    # Se IA não está disponível, retorna resposta do engine direta
    if not is_ai_available():
        # Fallback: se engine também não detectou nada, garantir análise mínima
        if not engine_response.scenarios:
            engine_response = _apply_minimal_fallback(engine_response, data)
        return engine_response

    # ── Disparar IA com contexto do engine ──
    m = _preprocess(data.metrics)

    try:
        ai_result = await analyze_with_ai(
            metrics=m,
            targets=data.targets,
            campaign=data.campaign,
            engine_scenarios=engine_response.scenarios,
            metric_evaluations=engine_response.metric_evaluations,
            coverage=engine_response.score_coverage,
            confidence=engine_response.score_confidence,
        )
    except Exception:
        import logging
        import traceback
        from app.service.ai_service import _redact_key
        logging.getLogger(__name__).error(
            "IA falhou inesperadamente:\n%s", _redact_key(traceback.format_exc())
        )
        ai_result = None

    # ── Converter resposta da IA em AIInsights (se veio) ──
    # ai_result é um dict. A validação aqui é a 2ª (o SDK já validou contra o
    # schema). Se falhar, logamos a CAUSA — não some silenciosamente.
    ai_insights = None
    if ai_result is not None:
        from app.schema.schema import AIInsights
        try:
            ai_insights = AIInsights.model_validate(ai_result)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                "IA: resposta não bate com o schema AIInsights — ignorando. Causa: %s", e
            )
            ai_insights = None

    # ── Combinar resultado final ──
    engine_response.ai_insights = ai_insights

    # ── Fallback de garantia: engine vazio + IA falhou ──
    if not engine_response.scenarios and ai_insights is None:
        engine_response = _apply_minimal_fallback(engine_response, data)

    return engine_response


# ─────────────────────────────────────────────────────────────────────────────
# FALLBACK MÍNIMO
# Garante que NUNCA retornamos análise vazia, mesmo se engine e IA falharem.
# ─────────────────────────────────────────────────────────────────────────────

def _apply_minimal_fallback(response: CampaignAnalysisResponse, data: AnalyzeInput) -> CampaignAnalysisResponse:
    """
    Quando engine não detectou cenários E IA não está disponível/falhou,
    construímos uma análise mínima a partir das métricas avaliadas.
    Garantia: o usuário nunca vê uma resposta "vazia".
    """
    evals = response.metric_evaluations

    if not evals:
        # Caso extremo: nem métricas avaliáveis foram fornecidas
        response.summary = (
            "Dados insuficientes para análise. Forneça pelo menos: "
            "impressões, gasto, conversões e CPA-meta para receber diagnóstico."
        )
        response.primary_action = (
            "Adicione mais métricas no formulário para receber análise detalhada."
        )
        return response

    # Identificar pontos de atenção a partir dos status
    criticos = [e for e in evals if e.status.value == "RED"]
    atencao  = [e for e in evals if e.status.value == "YELLOW"]
    saudaveis = [e for e in evals if e.status.value == "GREEN"]

    partes = []
    if criticos:
        nomes = ", ".join(e.metric for e in criticos[:3])
        partes.append(f"{len(criticos)} métrica(s) crítica(s): {nomes}")
    if atencao:
        nomes = ", ".join(e.metric for e in atencao[:3])
        partes.append(f"{len(atencao)} em atenção: {nomes}")
    if saudaveis and not criticos and not atencao:
        partes.append(f"{len(saudaveis)} métrica(s) saudável(eis)")

    response.summary = (
        f"Análise baseada nas métricas individuais ({len(evals)} avaliadas). "
        + ". ".join(partes) + "."
    )

    # Ação principal: focar na pior métrica
    if criticos:
        pior = min(criticos, key=lambda e: e.score)
        response.primary_action = (
            f"Prioridade: investigar {pior.metric} (score {pior.score}/100). {pior.note}"
        )
    elif atencao:
        pior = min(atencao, key=lambda e: e.score)
        response.primary_action = (
            f"Atenção: {pior.metric} (score {pior.score}/100). {pior.note}"
        )
    else:
        # Mesmo princípio do Cenário G: só sugerir expansão de orçamento quando
        # existe evidência para tanto. "Nenhuma métrica ruim entre as poucas que
        # recebi" não é o mesmo que "pode escalar".
        faltando = _evidencia_faltante_para_escala(_preprocess(data.metrics), data.targets)
        if faltando:
            response.primary_action = (
                "Métricas recebidas dentro do esperado. Antes de considerar aumento de "
                f"orçamento, envie {'; '.join(faltando)} — sem esses dados não é possível "
                "confirmar que a campanha suporta escala."
            )
        else:
            response.primary_action = (
                "Métricas dentro do esperado. Continuar monitorando e considerar "
                "expansão de orçamento ou novos públicos para escalar."
            )

    return response
