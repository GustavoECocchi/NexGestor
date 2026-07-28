// =============================================================================
// Tipos do domínio NexGestor — espelham app/schema/schema.py (engine completa).
// A API (POST /campaign/analyze) recebe AnalyzeInput e devolve
// CampaignAnalysisResponse. A UI consome um view-model (CampaignVM) derivado
// dessa resposta — ver data/mock.ts e lib/api.ts.
// =============================================================================

export type CampaignStatus = "GREEN" | "YELLOW" | "RED" | "PAUSED"
export type ScenarioCode =
  | "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K"
  // L–O entraram em 2026-07-28 fechando lacunas reproduzidas contra o engine:
  // gasto sem retorno, amostra insuficiente, vazamento clique→página e receita
  // abaixo da meta com custo sob controle.
  | "L" | "M" | "N" | "O"

// ---- INPUT (POST /campaign/analyze) ----
export interface Campaign {
  id: number
  name: string
  objective?: string // conversion | lead | traffic
  platform?: string // meta_ads | google_ads
  niche?: string | null
}

export interface Metrics {
  impressions?: number
  reach?: number
  spend?: number
  video_views_3s?: number
  video_views_50pct?: number
  thruplays?: number
  hook_rate?: number
  hold_rate?: number
  link_clicks?: number
  all_clicks?: number
  ctr_link?: number
  ctr_all?: number
  cpm?: number
  cpc?: number
  cpl?: number
  cpa?: number
  roas?: number
  landing_page_views?: number
  lp_conversion_rate?: number
  conversions?: number
  weekly_conversions?: number
  frequency?: number
  learning_phase?: boolean
}

export interface Targets {
  min_hook_rate?: number
  min_hold_rate?: number
  min_ctr_link?: number
  max_ctr_all_ratio?: number
  max_cpa?: number
  max_cpc?: number
  max_cpm?: number
  max_cpl?: number
  min_roas?: number
  min_lp_conversion_rate?: number
  max_frequency_fatigue?: number
  max_frequency_critical?: number
  max_frequency_horizontal?: number
  min_weekly_conversions?: number
  scale_cpa_margin?: number
  scale_frequency_ceiling?: number
}

export interface AnalyzeInput {
  campaign: Campaign
  metrics: Metrics
  targets: Targets
}

// ---- OUTPUT do engine determinístico ----
export interface ScenarioDetail {
  code: ScenarioCode
  title: string
  root_cause: string
  funnel_impact: string
  action: string
  execution_rule: string
  priority: number // 1=crítico, 2=urgente, 3=monitorar
}

export interface MetricEvaluation {
  metric: string
  value: number | null
  status: CampaignStatus
  score: number
  note: string
}

// ---- OUTPUT da IA (Gemini) ----
export interface AIScenario {
  title: string
  description: string
  recommended_action: string
  confidence: "high" | "medium" | "low"
}
export interface AIInsight { title: string; explanation: string }
export interface AIRisk { title: string; explanation: string; timeframe: string }
export interface AIInsights {
  executive_summary: string
  extra_scenarios: AIScenario[]
  contextual_insights: AIInsight[]
  risk_warnings: AIRisk[]
}

// ---- RESPONSE final ----
export type ScoreConfidence = "high" | "medium" | "low"

export interface CampaignAnalysisResponse {
  campaign_id: number
  campaign_name: string
  final_status: CampaignStatus
  overall_score: number
  /** % do peso total de métricas efetivamente avaliado (0–100). */
  score_coverage: number
  /** Confiança do diagnóstico derivada da cobertura: >=70 high, >=40 medium. */
  score_confidence: ScoreConfidence
  summary: string
  scenarios: ScenarioDetail[]
  metric_evaluations: MetricEvaluation[]
  primary_action: string
  ai_insights?: AIInsights | null
}

// =============================================================================
// VIEW-MODEL — o que a UI consome. Resolve o histórico "HealthStatus vs
// CampaignStatus": o engine devolve GREEN/YELLOW/RED/PAUSED; a UI acrescenta
// "BLUE" (escalável) como camada de apresentação, mapeada de GREEN + cenário G.
// =============================================================================

export type UIStatus = "RED" | "YELLOW" | "GREEN" | "BLUE"
export type Priority = "Alta" | "Média" | "Baixa"

export interface PriorityActionVM {
  title: string
  prio: Priority
  why: string
  impact: string
}

export interface SuggestionVM {
  name: string
  impact: string
  effort: string
  urgency: Priority
}

export interface ScenarioVM {
  code: string // ScenarioCode | "—"
  title: string
  root_cause: string
  funnel_impact: string
  action: string
  priority: number
}

export type Tile = [label: string, value: string, color: string, note: string]

export interface CampaignVM {
  id: number
  name: string
  platform: string
  status: UIStatus
  score: number
  invest: number
  revenue: number
  // `null` = métrica NÃO enviada/avaliada. Não confundir com 0, que é um valor
  // medido. Eram `number` com fallback `?? 0` no adapter, e o zero fabricado
  // vazava como fato pela UI: o Copiloto respondia "o CPA atual é R$ 0,00" e o
  // comparador dava vitória de "CPA menor" à campanha que simplesmente não
  // tinha CPA. Quem consome precisa tratar o `null` explicitamente.
  roasNum: number | null
  cpaNum: number | null
  ctrNum: number | null
  freqNum: number | null
  m1: { k: string; v: string }
  m2: { k: string; v: string }
  spark: number[]
  trend: number
  ai: string
  summary: string
  opportunity: string
  tiles: Tile[]
  scenarios: ScenarioVM[]
  actions: PriorityActionVM[]
  sugg: SuggestionVM[]
  /** Presentes apenas em campanhas analisadas ao vivo pelo backend. */
  coverage?: number
  confidence?: ScoreConfidence
  /**
   * `true` só quando a resposta trouxe `ai_insights` de verdade. Campanhas
   * antigas no localStorage não têm o campo — ausente vale como `false`,
   * que é o lado seguro (não promete IA que não houve).
   */
  hasAI?: boolean
}
