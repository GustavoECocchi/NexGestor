import type { CampaignVM } from "~types"

// Dados mockados para a UI rodar sem backend. Cada item representa o
// view-model derivado de um CampaignAnalysisResponse.
export const CAMPAIGNS: CampaignVM[] = [
  {
    id: 1,
    name: "Black Friday — Conversão",
    platform: "Meta Ads",
    status: "RED",
    score: 28,
    invest: 8420,
    revenue: 9260,
    roasNum: 1.1,
    cpaNum: 92,
    ctrNum: 0.7,
    freqNum: 3.4,
    m1: { k: "CPA", v: "R$ 92" },
    m2: { k: "CTR Link", v: "0,7%" },
    spark: [58, 62, 69, 74, 79, 85, 92],
    trend: -23,
    ai: "<b>CTR despencando com frequência alta</b> — sinal clássico de fadiga de criativo.",
    summary:
      "O público já viu o anúncio vezes demais. O criativo saturou e o CPA sobe a cada dia.",
    opportunity:
      "Você está perdendo aproximadamente <b>R$ 2.300/mês</b> com fadiga criativa. O gargalo está no criativo, não no público.",
    tiles: [
      ["ROAS", "1,1x", "var(--red)", "meta 2,5x"],
      ["CPA", "R$ 92", "var(--red)", "meta R$ 60"],
      ["CTR Link", "0,7%", "var(--red)", "meta 1,5%"],
      ["Frequência", "3,4", "var(--red)", "fadiga >2,8"],
      ["Investimento", "R$ 8.420", "var(--txt)", "7 dias"],
      ["Receita", "R$ 9.260", "var(--txt)", "7 dias"]
    ],
    scenarios: [
      {
        code: "E",
        title: "Fadiga de Criativo",
        priority: 1,
        root_cause:
          "Frequência em 3,4 nos últimos 7 dias, CTR Link caindo de 1,3% para 0,7% e CPA subindo progressivamente.",
        funnel_impact:
          "Topo de funil colapsando — o mesmo público ignora o anúncio repetido.",
        action:
          "Reduzir orçamento do conjunto saturado e subir novas variações de criativo imediatamente."
      }
    ],
    actions: [
      { title: "Subir 3 novos criativos", prio: "Alta", why: "CTR caindo enquanto a frequência sobe — fadiga criativa clássica.", impact: "Recuperação do CTR e queda do CPA" },
      { title: "Reduzir orçamento do conjunto saturado em 30%", prio: "Alta", why: "O conjunto atual já não entrega eficiência no leilão.", impact: "Estancar o desperdício imediato" },
      { title: "Testar novo ângulo de copy", prio: "Média", why: "A mesma mensagem repetida perde impacto no público.", impact: "Reengajar o público existente" },
      { title: "Variação com novo gancho nos 3s iniciais", prio: "Média", why: "O hook precisa quebrar padrão para recapturar atenção.", impact: "Aumentar hook rate" }
    ],
    sugg: [
      { name: "Subir 3 novos criativos", impact: "Recuperar CTR", effort: "Médio", urgency: "Alta" },
      { name: "Reduzir orçamento 30%", impact: "Cortar desperdício", effort: "Baixo", urgency: "Alta" },
      { name: "Novo ângulo de copy", impact: "Reengajar público", effort: "Médio", urgency: "Média" }
    ]
  },
  {
    id: 2,
    name: "Lançamento SaaS — Trial",
    platform: "Meta Ads",
    status: "YELLOW",
    score: 61,
    invest: 5110,
    revenue: 11750,
    roasNum: 2.3,
    cpaNum: 47,
    ctrNum: 1.2,
    freqNum: 1.9,
    m1: { k: "CPA", v: "R$ 47" },
    m2: { k: "CTR Link", v: "1,2%" },
    spark: [2.7, 2.6, 2.5, 2.4, 2.45, 2.35, 2.3],
    trend: -6,
    ai: "<b>O gancho funciona, mas o vídeo perde atenção</b> logo após os 3 primeiros segundos.",
    summary:
      "Hook rate ótimo (41%), mas o Hold rate caiu para 9%. O miolo do vídeo está entediante antes da oferta.",
    opportunity:
      "Recuperando o Hold rate para a meta de 15%, dá pra puxar o ROAS de <b>2,3x para ~3x</b> sem aumentar 1 real de verba.",
    tiles: [
      ["ROAS", "2,3x", "var(--amber)", "meta 2,5x"],
      ["CPA", "R$ 47", "var(--green)", "meta R$ 60"],
      ["Hook Rate", "41%", "var(--green)", "meta 35%"],
      ["Hold Rate", "9%", "var(--red)", "meta 15%"],
      ["Investimento", "R$ 5.110", "var(--txt)", "7 dias"],
      ["Conversões", "108", "var(--txt)", "7 dias"]
    ],
    scenarios: [
      {
        code: "B",
        title: "Retenção Baixa",
        priority: 2,
        root_cause:
          "Hook rate em 41% (bom), mas Hold rate em 9% e baixo volume de cliques — abandono no meio do vídeo.",
        funnel_impact: "Atenção capturada, mas o interesse morre antes do CTA.",
        action: "Encurtar o criativo, cortes a cada 2–3s e legendas dinâmicas no miolo."
      }
    ],
    actions: [
      { title: "Encurtar o vídeo", prio: "Alta", why: "Hold rate em 9% contra a meta de 15% indica abandono no meio.", impact: "Mais ThruPlays e cliques" },
      { title: "Adicionar cortes a cada 2–3 segundos", prio: "Alta", why: "O ritmo lento gera dispersão antes da oferta.", impact: "Manter atenção até o CTA" },
      { title: "Reescrever o miolo do criativo", prio: "Média", why: "A introdução corporativa entedia antes do CTA.", impact: "Aumentar o Hold rate" },
      { title: "Adicionar legenda dinâmica", prio: "Baixa", why: "A maioria assiste sem som.", impact: "Reter o público mudo" }
    ],
    sugg: [
      { name: "Editar e encurtar o vídeo", impact: "Subir Hold rate", effort: "Médio", urgency: "Alta" },
      { name: "Cortes dinâmicos", impact: "Reter atenção", effort: "Médio", urgency: "Média" },
      { name: "Legenda no miolo", impact: "Público sem som", effort: "Baixo", urgency: "Baixa" }
    ]
  },
  {
    id: 3,
    name: "Remarketing — 30 dias",
    platform: "Meta Ads",
    status: "GREEN",
    score: 88,
    invest: 3290,
    revenue: 15790,
    roasNum: 4.8,
    cpaNum: 31,
    ctrNum: 2.1,
    freqNum: 2.6,
    m1: { k: "ROAS", v: "4,8x" },
    m2: { k: "CPA", v: "R$ 31" },
    spark: [4.6, 4.7, 4.7, 4.8, 4.7, 4.8, 4.8],
    trend: 4,
    ai: "<b>Campanha saudável</b> e dentro de todas as metas definidas.",
    summary:
      "Todas as métricas dentro do alvo. Sem gargalo crítico — a frequência em 2,6 começa a merecer atenção.",
    opportunity:
      "Campanha estável e eficiente. A frequência em 2,6 sinaliza saturação chegando — janela para <b>preparar um novo público antes do CPA subir</b>.",
    tiles: [
      ["ROAS", "4,8x", "var(--green)", "meta 3,0x"],
      ["CPA", "R$ 31", "var(--green)", "meta R$ 50"],
      ["CTR Link", "2,1%", "var(--green)", "meta 1,5%"],
      ["Frequência", "2,6", "var(--amber)", "limite 6,0"],
      ["Investimento", "R$ 3.290", "var(--txt)", "7 dias"],
      ["Receita", "R$ 15.790", "var(--txt)", "7 dias"]
    ],
    scenarios: [
      {
        code: "—",
        title: "Sem gargalo crítico",
        priority: 3,
        root_cause:
          "Todas as métricas dentro das metas. A frequência em 2,6 é o único ponto a vigiar.",
        funnel_impact: "Funil equilibrado em todas as etapas.",
        action: "Manter e preparar novo público para antecipar a saturação."
      }
    ],
    actions: [
      { title: "Manter orçamento atual", prio: "Baixa", why: "Métricas dentro de todas as metas.", impact: "Preservar a eficiência" },
      { title: "Preparar novo público (LAL 1%)", prio: "Média", why: "Frequência subindo — antecipar a saturação.", impact: "Evitar fadiga futura" },
      { title: "Vigiar frequência diariamente", prio: "Baixa", why: "Teto de canibalização do retargeting.", impact: "Detectar saturação cedo" }
    ],
    sugg: [
      { name: "Manter orçamento", impact: "Preservar eficiência", effort: "Baixo", urgency: "Baixa" },
      { name: "Preparar novo público", impact: "Evitar fadiga", effort: "Médio", urgency: "Média" }
    ]
  },
  {
    id: 4,
    name: "Topo de Funil — LAL 1%",
    platform: "Meta Ads",
    status: "BLUE",
    score: 92,
    invest: 4870,
    revenue: 25320,
    roasNum: 5.2,
    cpaNum: 24,
    ctrNum: 2.4,
    freqNum: 1.6,
    m1: { k: "ROAS", v: "5,2x" },
    m2: { k: "CPA", v: "R$ 24" },
    spark: [4.3, 4.5, 4.7, 4.8, 5.0, 5.1, 5.2],
    trend: 12,
    ai: "<b>Janela de escala vertical ativa</b> — CPA 28% abaixo da meta e leilão favorável.",
    summary:
      "CPA bem abaixo do alvo, ROAS acima do histórico e frequência controlada. Há margem para injetar caixa com segurança.",
    opportunity:
      "Existe margem para <b>escalar até 35%</b> mantendo o CPA dentro da meta. Cada dia parado é receita não capturada.",
    tiles: [
      ["ROAS", "5,2x", "var(--blue)", "meta 3,0x"],
      ["CPA", "R$ 24", "var(--blue)", "meta R$ 33"],
      ["CTR Link", "2,4%", "var(--green)", "meta 1,5%"],
      ["Frequência", "1,6", "var(--green)", "teto 1,8"],
      ["Investimento", "R$ 4.870", "var(--txt)", "7 dias"],
      ["Receita", "R$ 25.320", "var(--txt)", "7 dias"]
    ],
    scenarios: [
      {
        code: "G",
        title: "Escala Vertical Ativa",
        priority: 2,
        root_cause:
          "CPA 28% abaixo da meta, ROAS acima do histórico, frequência em 1,6 e conjunto fora do aprendizado.",
        funnel_impact: "Tração máxima no público atual com leilão favorável.",
        action:
          "Aumentar orçamento 15–20% a cada 24h, sem passar de 30% para não resetar o aprendizado."
      }
    ],
    actions: [
      { title: "Aumentar orçamento em 15%", prio: "Alta", why: "CPA 28% abaixo da meta e leilão favorável.", impact: "Mais volume mantendo eficiência" },
      { title: "Monitorar CPA nas próximas 24h", prio: "Alta", why: "A escala pode pressionar o custo.", impact: "Travar a escala se o CPA subir >10%" },
      { title: "Duplicar conjunto vencedor", prio: "Média", why: "Escala horizontal protege contra saturação.", impact: "Distribuir entrega em novos públicos" },
      { title: "Criar variação para evitar saturação", prio: "Baixa", why: "Antecipar fadiga durante a escala.", impact: "Sustentar a performance" }
    ],
    sugg: [
      { name: "Escalar +15%", impact: "Mais volume", effort: "Baixo", urgency: "Alta" },
      { name: "Duplicar conjunto", impact: "Escala horizontal", effort: "Médio", urgency: "Média" },
      { name: "Monitorar CPC 48h", impact: "Proteger CPA", effort: "Baixo", urgency: "Média" }
    ]
  }
]

export const findCampaign = (id: number) => CAMPAIGNS.find((c) => c.id === id)!
