/** Total em reais, sem centavos — para somas grandes (Investimento, Receita). */
export const brl = (n: number) => Math.round(n).toLocaleString("pt-BR")

/**
 * Custo unitário em reais, com centavos — para CPA, CPC, CPL e CPM.
 *
 * Arredondar custo unitário para inteiro exibe número falso: CPC de R$0,45 —
 * valor comum no mercado brasileiro — virava "R$ 0" na tela, e a meta ao lado
 * dizia "meta <R$1.50". CPA de R$39,90 virava "R$ 40". Os gerenciadores de
 * anúncio mostram centavos nessas métricas justamente por isso.
 */
export const brlCents = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dec = (n: number) => n.toFixed(1).replace(".", ",")
