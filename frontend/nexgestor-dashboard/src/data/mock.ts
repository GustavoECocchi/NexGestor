import type { CampaignVM } from "~types"

// Dados mockados para a UI rodar sem backend e servir de DEMONSTRAÇÃO.
// Apenas 2 campanhas, de propósito: um par contrastante (uma crítica e uma
// escalável) para o usuário experimentar o comparativo antes de ter dados
// próprios. São marcadas como "exemplo" na UI (ver Home/CampaignCard) — não
// são campanhas reais do usuário. Ids < 1000 (mock); campanhas vivas usam
// ids >= 1000 (ver lib/store.ts / isLiveId).
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
    primaryAction:
      "Reduzir orçamento do conjunto saturado e subir novas variações de criativo imediatamente.",
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
    primaryAction:
      "Aumentar orçamento 15–20% a cada 24h, sem passar de 30% para não resetar o aprendizado.",
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
