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
  platform?: string // meta_ads | google_ads | tiktok_ads | linkedin_ads
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

// "gestor" (padrão) = meta escolhida por quem preencheu o formulário.
// "sistema" = métrica tem default no schema (CTR Link/Hook Rate/CPM) e o
//   campo ficou em branco — o engine avaliou contra um número que ninguém
//   confirmou. "ausente" = métrica sem default (CPA/CPL/ROAS): meta em
//   branco não tem contra o que comparar, o tile é sintetizado no frontend
//   (ver lib/adapt.ts, fase-2 §11).
export type TileOrigin = "gestor" | "sistema" | "ausente"
// `score` = a nota 0–100 que o engine deu à métrica (MetricEvaluation.score),
// carregada aqui só para o painel do funil (feed reorganizado, rascunho de
// 2026-08-31) desenhar a altura das barras verticais — a mesma nota que já
// decide a cor do tile, nunca um número novo. `undefined` pra tiles sem score
// do engine (Investimento/Receita, e as métricas "ausente" do §11).
export type Tile = [label: string, value: string, color: string, note: string, origem?: TileOrigin, score?: number]

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
  /**
   * Limite de fadiga configurado pelo gestor (`targets.max_frequency_fatigue`),
   * ou o default do backend (2.8) quando não enviado. Campo próprio — antes o
   * Copiloto lia esse número de dentro do texto do tile de Frequência
   * (`tile[3]`), e quando `tileText()` passou a devolver o veredito por
   * extenso em vez do número, a resposta perdeu o valor real e ficou
   * redundante com o próprio veredito. Opcional só pra não quebrar fixtures
   * de teste antigas — sempre presente vindo do adapter real.
   */
  maxFrequencyFatigue?: number
  m1: { k: string; v: string }
  m2: { k: string; v: string }
  spark: number[]
  trend: number
  ai: string
  summary: string
  opportunity: string
  /**
   * A ação recomendada pelo engine — SEMPRE concreta, mesmo sem cenário de
   * causa raiz batendo: `_resumo_sem_cenario` (backend) aponta a pior métrica
   * ("Investigar CPC: está em nível crítico...") em vez de devolver um "nada
   * encontrado" genérico. É o que responde "o que eu faço agora", direto.
   */
  primaryAction: string
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
  /**
   * Padrões cruzados que a IA notou (`contextual_insights`) e alertas
   * preventivos (`risk_warnings`).
   *
   * Ficaram fora da UI da criação da camada de IA até 14/08/2026: o backend
   * devolvia os quatro blocos, o adapter lia só dois, e estes dois eram
   * descartados em silêncio — pagava-se a chamada ao Gemini e o alerta de
   * risco nunca chegava a quem precisava dele.
   *
   * Ausentes em campanhas analisadas antes disso e em campanhas sem IA.
   */
  aiInsights?: AIInsight[]
  aiRisks?: AIRisk[]
  /**
   * Id da linha no servidor, quando a campanha já foi salva lá.
   *
   * Existe porque `id` NÃO serve de identidade na base compartilhada: ele é
   * gerado por navegador (>= 1000), então a primeira campanha da Ana e a do
   * Bruno nascem ambas como 1000. Ausente = existe só neste navegador (salva
   * enquanto o servidor estava fora, ou persistência desligada).
   */
  serverId?: number
  /**
   * Identificador gerado no navegador (`crypto.randomUUID()`), estável por
   * campanha, enviado em toda tentativa de `POST /campaigns` (`lib/api.ts`).
   *
   * Existe pra tornar o salvamento idempotente (auditoria de rede,
   * 2026-09-03, achado A4): sem ele, uma resposta perdida DEPOIS do servidor
   * já ter gravado — abort do timeout, queda de rede no meio do 200 — faz o
   * cliente achar que falhou e tentar de novo na próxima abertura, e o
   * servidor não tem como saber que é a MESMA campanha. Gerado uma única vez
   * por `lib/store.ts:garantirClientId`, persistido ANTES do fetch (pra
   * sobreviver a um reload no meio do envio) e só relevante enquanto
   * `serverId` está ausente — depois que a campanha tem `serverId`, os
   * reenvios já são update-by-id, que já era idempotente.
   */
  clientId?: string
  /**
   * Motivo pelo qual esta campanha NUNCA vai conseguir sincronizar sozinha —
   * ausente enquanto a falha é transitória (rede, servidor fora do ar, base
   * cheia: essas continuam sendo retentadas a cada abertura, como sempre
   * foi — ver `syncAviso` pra base cheia especificamente).
   *
   * Existe porque `salvarCampanha` (`lib/api.ts`) costumava colapsar TODA
   * falha em `null` (auditoria de rede, 2026-09-03, achado A3): 413 (payload
   * grande demais) nunca vai ter sucesso sozinho — nenhuma retentativa muda
   * o tamanho do payload —, mas o laço de sincronização (`App.tsx`) retentava
   * pra sempre, e o usuário nunca era avisado de que aquela campanha
   * específica jamais sairia do navegador dele.
   *
   * SÓ para causas ligadas ao CONTEÚDO desta campanha (hoje, só 413). Um
   * estado do SERVIDOR (base cheia) não entra aqui — ver `syncAviso`.
   */
  syncFalhouPermanente?: string
  /**
   * Aviso da tentativa de sincronização mais recente — a campanha CONTINUA
   * elegível pro laço de sync retentar, diferente de `syncFalhouPermanente`.
   *
   * Existe porque a primeira versão da correção do achado A3 (revisão do
   * Opus, 2026-09-04, achado R1) classificou 507 (base do servidor cheia)
   * como falha PERMANENTE — errado: é estado do servidor, não desta
   * campanha. Alguém libera espaço (a Home tem botão de apagar) e a MESMA
   * campanha passaria a caber, mas `syncFalhouPermanente` já tinha tirado
   * ela do laço pra sempre, sem caminho de volta. `syncAviso` informa o
   * usuário SEM bloquear a recuperação automática: é atualizado (ou limpo,
   * virando `undefined`) a cada tentativa — nunca acumula um aviso velho
   * depois que a causa mudou ou a campanha sincronizou com sucesso.
   */
  syncAviso?: string
}
