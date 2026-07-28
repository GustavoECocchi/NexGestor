"""
Prompts e formatadores usados pela camada de IA.

Separado do ai_service.py para facilitar iterar o texto do prompt
sem mexer na lógica de chamada à API. Se você quer ajustar o tom,
a profundidade ou o foco da IA, edite SYSTEM_PROMPT abaixo.
"""
from __future__ import annotations
from typing import Any, Optional


# ─────────────────────────────────────────────────────────────────────────────
# Persona da IA — instruções fixas enviadas em todas as chamadas
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Você é um analista sênior de tráfego pago com 10+ anos de experiência \
em Meta Ads, Google Ads e plataformas de mídia paga. Você trabalha como inteligência \
embarcada no NexGestor — um sistema de decisão para gestores de tráfego.

Sua missão é analisar as métricas de uma campanha publicitária e gerar diagnósticos \
acionáveis. Sempre entregue algo útil — mas útil inclui dizer com clareza o que os \
dados ainda NÃO permitem concluir. Apontar a lacuna certa vale mais que preencher \
o espaço com suposição.

PRINCÍPIOS OBRIGATÓRIOS:

0. NÃO INVENTE. Trabalhe apenas com os números recebidos. Métrica ausente é \
DESCONHECIDA, nunca "provavelmente boa". Não cite benchmark de mercado, média do \
setor nem estatística externa: você não tem essa fonte aqui e o gestor decide verba \
com o que você escreve. Não prometa resultado ("vai dobrar o ROAS") — descreva a \
mudança esperada e o que observar para confirmar.

1. SEJA ESPECÍFICO: cite os números reais que recebeu (R$, %, ratios). Nunca \
respostas genéricas como "monitore as métricas". Sempre cite causas e ações concretas.

2. EXPLIQUE CAUSAS, NÃO SINTOMAS: não diga apenas "CTR está baixo". Diga POR QUE \
está baixo (gancho fraco, público errado, oferta sem apelo) e O QUE FAZER.

3. ANALISE PADRÕES CRUZADOS: o engine de regras avalia métricas isoladas. Seu \
valor está em ver conexões — ex: CPM subindo + frequência subindo = leilão saturado \
E audiência cansada simultaneamente.

4. PORTUGUÊS BRASILEIRO DIRETO: tom de profissional experiente conversando com outro \
profissional. Sem jargão de marketing genérico. Sem termos em inglês quando há \
equivalente em português.

5. PRIORIZE AÇÃO: cada cenário/insight/risco deve ter algo que o gestor possa fazer \
HOJE. Sem "considere monitorar" ou "avalie a possibilidade".

REFERÊNCIAS DE QUALIDADE (vocabulário e profundidade esperados):

O sistema também conhece padrões clássicos como: Gancho Fraco (Hook Rate baixo), \
Retenção Baixa (Hold Rate baixo), Click-Bait (CTR Todos alto vs CTR Link baixo), \
Desalinhamento com Landing Page, Fadiga de Criativo, Lead Frio, Janela de Escala \
Vertical, Escala Horizontal por fadiga iminente, Learning Phase Hell, Overspending, \
Canibalização de Retargeting, Gasto sem Retorno (zero conversão), Amostra Insuficiente, \
Vazamento entre Clique e Página, Receita Abaixo da Meta com custo sob controle. \
Use essa profundidade como referência — mas você não está limitado a esses padrões. \
Detecte QUALQUER coisa relevante nos dados.

LIMITES DE QUANTIDADE (forçam foco):
- Máximo 3 cenários extras
- Máximo 3 insights contextuais
- Máximo 2 alertas de risco

Se os dados não justificarem o máximo, retorne menos — qualidade > quantidade."""


# ─────────────────────────────────────────────────────────────────────────────
# Builder do prompt do usuário — monta a parte dinâmica para cada análise
# ─────────────────────────────────────────────────────────────────────────────

def _bloco_cobertura(coverage: Optional[int], confidence: Optional[str]) -> str:
    """
    Diz à IA o quanto do quadro ela está enxergando.

    Sem isto, a IA recebia as métricas presentes e nenhuma noção das ausentes —
    e o modo principal a instrui a "identificar oportunidades" quando o engine
    não achou nada. É exatamente a situação em que o engine se recusa a abrir
    janela de escala por falta de evidência (ver `_evidencia_faltante_para_escala`
    no service): seria incoerente o engine calar e a IA, ao lado, mandar subir
    orçamento com os mesmos dados.
    """
    if coverage is None:
        return ""
    regra = (
        "\nREGRA: com cobertura abaixo de 40% NÃO recomende aumento de orçamento "
        "nem afirme que a campanha está saudável. Aponte quais dados faltam."
        if confidence == "low"
        else ""
    )
    return (
        f"\n\n# COBERTURA DOS DADOS\n"
        f"{coverage}% do peso das métricas foi avaliado (confiança: {confidence}). "
        f"O restante não foi enviado — trate como DESCONHECIDO, nunca como saudável.{regra}"
    )


def build_user_prompt(
    metrics: Any,
    targets: Any,
    campaign: Any,
    engine_scenarios: list,
    metric_evaluations: list,
    coverage: Optional[int] = None,
    confidence: Optional[str] = None,
) -> str:
    """
    Monta o prompt específico para a análise atual.
    Decide automaticamente entre modo complementar e modo principal
    baseado se engine_scenarios está vazio ou não.
    """
    plataforma = campaign.platform or "meta_ads"
    # Todo o vocabulário do engine (Hook Rate, ThruPlays, Advantage+, LAL) é do
    # Meta. Numa campanha de Google Ads a IA recomendava recurso que não existe
    # naquela plataforma; a nota abaixo evita a transposição automática.
    nota_plataforma = (
        "\nATENÇÃO: campanha de Google Ads. Não recomende recursos exclusivos do Meta "
        "(Advantage+, Públicos Semelhantes/LAL, Gerenciador de Eventos do Facebook). "
        "Traduza o raciocínio para os equivalentes da plataforma correta."
        if plataforma == "google_ads"
        else ""
    )
    contexto = (
        f"Campanha: {campaign.name}\n"
        f"Plataforma: {plataforma}\n"
        f"Objetivo: {campaign.objective or 'conversion'}\n"
        f"Nicho: {campaign.niche or 'não informado'}{nota_plataforma}"
    )

    # Modo é decidido pela presença de cenários do engine.
    if engine_scenarios:
        instrucao = _instrucao_complementar(engine_scenarios)
    else:
        instrucao = _instrucao_principal()

    return (
        f"# CONTEXTO DA CAMPANHA\n{contexto}\n\n"
        f"# MÉTRICAS RECEBIDAS\n{_format_metrics(metrics)}\n\n"
        f"# METAS DO GESTOR\n{_format_targets(targets)}\n\n"
        f"# AVALIAÇÃO INICIAL DO ENGINE\n{_format_evaluations(metric_evaluations)}"
        f"{_bloco_cobertura(coverage, confidence)}\n\n"
        f"# SITUAÇÃO ATUAL E SUA TAREFA\n{instrucao}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Instruções por modo
# ─────────────────────────────────────────────────────────────────────────────

def _instrucao_complementar(engine_scenarios: list) -> str:
    """Modo complementar — engine já detectou algo, IA agrega."""
    cenarios = _format_engine_scenarios(engine_scenarios)
    return (
        f"O SISTEMA JÁ IDENTIFICOU OS SEGUINTES CENÁRIOS:\n{cenarios}\n\n"
        "SUA TAREFA:\n"
        "NÃO repita os cenários acima. Sua função é COMPLEMENTAR o diagnóstico:\n"
        "- Existe algum cenário ADICIONAL que o sistema não viu? (extra_scenarios)\n"
        "- Quais padrões CRUZADOS entre métricas você consegue identificar? (contextual_insights)\n"
        "- Quais riscos FUTUROS você antecipa baseado nos dados atuais? (risk_warnings)\n"
        "- Sintetize tudo em um executive_summary curto."
    )


def _instrucao_principal() -> str:
    """Modo principal — engine vazio, IA assume análise completa."""
    return (
        "O SISTEMA NÃO IDENTIFICOU CENÁRIOS CLÁSSICOS NESSES DADOS.\n\n"
        "SUA TAREFA é ASSUMIR a análise principal:\n"
        "- Identifique TODOS os cenários relevantes (problemas, oportunidades, padrões atípicos)\n"
        "- Analise conexões entre métricas que não são óbvias isoladamente\n"
        "- Antecipe riscos futuros baseado nos padrões atuais\n"
        "- Construa um executive_summary que diga ao gestor o que está acontecendo\n\n"
        "IMPORTANTE: o usuário precisa receber valor real desta análise.\n"
        "Se as métricas estão \"ok\" mas há oportunidades SUSTENTADAS pelos números, identifique.\n"
        "Se há sinais sutis de problema que regras explícitas não pegam, identifique.\n"
        "Se os dados são insuficientes para concluir algo, diga isso de forma útil\n"
        "(ex: \"Hook Rate ausente impede avaliar topo de funil — adicione esse dado\").\n"
        "Não retorne análise puramente descritiva (repetir os números que já estão na tela).\n"
        "Mas também não force conclusão: 'os dados não permitem afirmar X, envie Y' é uma\n"
        "resposta completa e legítima — preferível a uma hipótese apresentada com confiança."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Formatadores — convertem objetos Pydantic em texto enxuto pro prompt
# ─────────────────────────────────────────────────────────────────────────────

# Tabelas (campo → (label visível, sufixo de unidade))
_METRIC_LABELS = {
    "impressions": ("Impressões", ""),
    "reach": ("Alcance", ""),
    "spend": ("Gasto", "R$"),
    "video_views_3s": ("Views 3s", ""),
    "thruplays": ("ThruPlays", ""),
    "video_views_50pct": ("Views 50%", ""),
    "hook_rate": ("Hook Rate", "%"),
    "hold_rate": ("Hold Rate", "%"),
    "link_clicks": ("Cliques no link", ""),
    "all_clicks": ("Cliques (todos)", ""),
    "ctr_link": ("CTR Link", "%"),
    "ctr_all": ("CTR Todos", "%"),
    "cpm": ("CPM", "R$"),
    "cpc": ("CPC", "R$"),
    "cpl": ("CPL", "R$"),
    "cpa": ("CPA", "R$"),
    "roas": ("ROAS", "x"),
    "landing_page_views": ("LP Views", ""),
    "lp_conversion_rate": ("Conv. LP", "%"),
    "conversions": ("Conversões", ""),
    "weekly_conversions": ("Conv./semana", ""),
    "frequency": ("Frequência", ""),
    "learning_phase": ("Em aprendizado limitado", ""),
}

# Todos os targets que o engine usa para julgar — a tabela cobria 9 de 16, e os
# 7 que faltavam eram justamente limiares que a IA não tinha como adivinhar
# (teto de CPM, faixas de frequência, volume semanal, margens de escala). Sem
# eles a IA opinava sobre "frequência 2,6" sem saber que o limiar do gestor era
# 2,5 — e podia contradizer o card exibido ao lado dela na mesma tela.
_TARGET_LABELS = {
    "max_cpa": ("CPA máximo", "R$"),
    "max_cpc": ("CPC máximo", "R$"),
    "max_cpl": ("CPL máximo", "R$"),
    "max_cpm": ("CPM máximo", "R$"),
    "min_roas": ("ROAS mínimo", "x"),
    "min_hook_rate": ("Hook Rate mínimo", "%"),
    "min_hold_rate": ("Hold Rate mínimo", "%"),
    "min_ctr_link": ("CTR Link mínimo", "%"),
    "max_ctr_all_ratio": ("CTR Todos máximo (suspeita de click-bait)", "%"),
    "min_lp_conversion_rate": ("Taxa de conv. LP mínima", "%"),
    "max_frequency_fatigue": ("Frequência máx. (fadiga)", ""),
    "max_frequency_horizontal": ("Frequência de alerta (escala horizontal)", ""),
    "max_frequency_critical": ("Frequência crítica", ""),
    "min_weekly_conversions": ("Conversões/semana mínimas", ""),
    "scale_cpa_margin": ("Margem de CPA exigida p/ escalar (fração do teto)", ""),
    "scale_frequency_ceiling": ("Frequência máxima p/ liberar escala", ""),
}

# Targets que existem por default no sistema. O gestor pode nunca tê-los
# definido — dizer "sua meta de Hook Rate é 35%" para quem não definiu meta
# nenhuma é atribuir ao usuário uma decisão que foi do sistema.
_TARGETS_COM_DEFAULT = {
    "min_hook_rate", "min_hold_rate", "min_ctr_link", "max_ctr_all_ratio",
    "max_cpm", "min_lp_conversion_rate", "max_frequency_fatigue",
    "max_frequency_critical", "max_frequency_horizontal",
    "min_weekly_conversions", "scale_cpa_margin", "scale_frequency_ceiling",
}

_STATUS_EMOJI = {"GREEN": "🟢", "YELLOW": "🟡", "RED": "🔴", "PAUSED": "⏸"}


def _format_value(value: Any, suffix: str) -> str:
    """Formata um valor numérico com unidade, lidando com bool e int separadamente."""
    if isinstance(value, bool):
        return "Sim" if value else "Não"
    if isinstance(value, float):
        return f"{suffix}{value:.2f}" if suffix == "R$" else f"{value:.2f}{suffix}"
    # int — usa separador de milhar pt-BR
    return f"{value:,}".replace(",", ".")


def _format_metrics(metrics: Any) -> str:
    """Lista só as métricas preenchidas (None é omitido)."""
    lines = [
        f"- {label}: {_format_value(getattr(metrics, field), suffix)}"
        for field, (label, suffix) in _METRIC_LABELS.items()
        if getattr(metrics, field, None) is not None
    ]
    return "\n".join(lines) if lines else "(nenhuma métrica fornecida)"


def _format_targets(targets: Any) -> str:
    """
    Lista os targets, marcando quais são padrão do sistema.

    A marcação `(padrão do sistema)` existe para a IA não atribuir ao gestor uma
    meta que ele nunca escolheu. Quem define CPA máximo e ROAS mínimo é sempre o
    gestor (não têm default); o resto pode ser só o benchmark embutido.
    """
    lines = []
    for field, (label, suffix) in _TARGET_LABELS.items():
        valor = getattr(targets, field, None)
        if valor is None:
            continue
        origem = " (padrão do sistema)" if field in _TARGETS_COM_DEFAULT else " (definido pelo gestor)"
        lines.append(f"- {label}: {_format_value(valor, suffix)}{origem}")
    return "\n".join(lines) if lines else "(nenhum target disponível)"


def _format_evaluations(evaluations: list) -> str:
    """
    Lista a avaliação métrica-por-métrica feita pelo engine.

    A nota do engine vai junto de propósito: sem ela a linha dizia
    "🔴 CPA: 92.0 (score 0/100)" — vermelho contra o quê, o prompt não
    informava. A nota carrega a meta usada no julgamento, que é o que evita a
    IA justificar o vermelho com um limiar inventado por ela.
    """
    if not evaluations:
        return "(nenhuma métrica avaliável)"
    lines = []
    for ev in evaluations:
        status = ev.status.value if hasattr(ev.status, "value") else str(ev.status)
        emoji = _STATUS_EMOJI.get(status, "•")
        nota = f" — {ev.note}" if getattr(ev, "note", "") else ""
        lines.append(f"- {emoji} {ev.metric}: {ev.value} (score {ev.score}/100){nota}")
    return "\n".join(lines)


def _format_engine_scenarios(scenarios: list) -> str:
    """Lista os cenários que o engine já detectou — usado no modo complementar."""
    if not scenarios:
        return "(nenhum)"
    priority_label = {1: "CRÍTICO", 2: "URGENTE", 3: "MONITORAR"}
    lines = []
    for s in scenarios:
        code = s.code.value if hasattr(s.code, "value") else s.code
        label = priority_label.get(s.priority, "")
        lines.append(f"\n[{code}] {s.title} ({label})")
        lines.append(f"  Causa: {s.root_cause}")
        lines.append(f"  Ação: {s.action}")
    return "\n".join(lines)
