import type { CampaignNiche } from "~types"

// Espelha CampaignNiche em app/schema/schema.py e NICHE_LABELS em
// app/service/labels.py — manter os três em sincronia. "Fitness e Academias"
// e "Saúde e Bem-estar" apontam pra mesma categoria de benchmark externo
// (Meta "Health and Fitness"); mantidos como opções distintas de propósito
// (ver docs/prds/fase-2b-benchmark-mercado.md §3.3) — não fundir aqui.
export const NICHE_LABELS: Record<CampaignNiche, string> = {
  ecommerce_varejo: "E-commerce / Varejo",
  educacao_cursos: "Educação e Cursos",
  saude_bem_estar: "Saúde e Bem-estar",
  beleza_estetica: "Beleza e Estética",
  imobiliario: "Imobiliário",
  servicos_financeiros_seguros: "Serviços Financeiros e Seguros",
  servicos_juridicos: "Serviços Jurídicos",
  automotivo: "Automotivo",
  viagens_turismo: "Viagens e Turismo",
  alimentacao_restaurantes: "Alimentação e Restaurantes",
  software_tecnologia_b2b: "Software e Tecnologia (B2B)",
  fitness_academias: "Fitness e Academias",
  servicos_locais: "Serviços Locais (reformas, manutenção)",
  pet: "Pet",
  moda_vestuario: "Moda e Vestuário"
}

export const NICHE_VALUES = Object.keys(NICHE_LABELS) as CampaignNiche[]

export function isCampaignNiche(v: unknown): v is CampaignNiche {
  return typeof v === "string" && v in NICHE_LABELS
}
