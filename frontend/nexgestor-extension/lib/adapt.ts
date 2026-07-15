// =============================================================================
// Adapter: CampaignAnalysisResponse (backend) → CampaignVM (UI).
//
// Regras principais:
//   • UIStatus é camada de APRESENTAÇÃO: GREEN + cenário G ⇒ BLUE (escalável).
//     PAUSED (reservado no backend) é exibido como YELLOW até existir UI própria.
//   • O backend não devolve série histórica ainda — spark é uma linha flat no
//     valor do score (honesto: "sem histórico"), trend = 0. Quando o histórico
//     existir na API, só este arquivo muda.
//   • Nada aqui inventa números: invest/receita só aparecem se o gestor enviou
//     spend/roas no input.
// =============================================================================

import type {
  AnalyzeInput,
  CampaignAnalysisResponse,
  CampaignVM,
  MetricEvaluation,
  Priority,
  ScenarioDetail,
  SuggestionVM,
  Tile,
  UIStatus
} from "~types"
import { brl, dec } from "~lib/format"

// ── helpers ─────────────────────────────────────────────────────────────────

const PRIO_LABEL: Record<number, Priority> = { 1: "Alta", 2: "Média", 3: "Baixa" }

const STATUS_COLOR: Record<string, string> = {
  GREEN: "var(--green)",
  YELLOW: "var(--amber)",
  RED: "var(--red)",
  PAUSED: "var(--amber)"
}

/** "Cenário E — Fadiga de Criativo (Anúncio Saturado)" → "Fadiga de Criativo" */
function shortTitle(title: string): string {
  const afterDash = title.split("—").slice(1).join("—").trim() || title
  return afterDash.replace(/\s*\(.*\)\s*$/, "").trim()
}

function fmtMetric(ev: MetricEvaluation): string {
  const v = ev.value
  if (v == null) return "—"
  const m = ev.metric
  if (m === "CPA" || m === "CPC" || m === "CPL" || m === "CPM") return `R$ ${brl(v)}`
  if (m === "ROAS") return `${dec(v)}x`
  if (m === "Frequência") return dec(v)
  if (m === "Conversões/semana") return String(Math.round(v))
  return `${dec(v)}%` // Hook, Hold, CTRs, Conversão LP
}

function findEval(evals: MetricEvaluation[], metric: string) {
  return evals.find((e) => e.metric === metric)
}

function resolveUIStatus(res: CampaignAnalysisResponse): UIStatus {
  const hasScaleWindow = res.scenarios.some((s) => s.code === "G")
  if (res.final_status === "GREEN" && hasScaleWindow) return "BLUE"
  if (res.final_status === "PAUSED") return "YELLOW"
  return res.final_status
}

// ── adapter ─────────────────────────────────────────────────────────────────

export function responseToVM(
  res: CampaignAnalysisResponse,
  input: AnalyzeInput
): CampaignVM {
  const m = input.metrics
  const evals = res.metric_evaluations

  // Números-base: preferir o que o gestor enviou; cair para o avaliado.
  const roasNum = m.roas ?? findEval(evals, "ROAS")?.value ?? 0
  const cpaNum = m.cpa ?? findEval(evals, "CPA")?.value ?? 0
  const ctrNum = m.ctr_link ?? findEval(evals, "CTR Link")?.value ?? 0
  const freqNum = m.frequency ?? findEval(evals, "Frequência")?.value ?? 0
  const invest = m.spend ?? 0
  const revenue = invest && roasNum ? Math.round(invest * roasNum) : 0

  // Destaques do card: CPA e CTR quando existem; senão, os 2 primeiros avaliados.
  const cpaEval = findEval(evals, "CPA")
  const ctrEval = findEval(evals, "CTR Link")
  const m1 = cpaEval
    ? { k: "CPA", v: fmtMetric(cpaEval) }
    : evals[0]
      ? { k: evals[0].metric, v: fmtMetric(evals[0]) }
      : { k: "Score", v: `${res.overall_score}` }
  const m2 = ctrEval
    ? { k: "CTR Link", v: fmtMetric(ctrEval) }
    : evals[1]
      ? { k: evals[1].metric, v: fmtMetric(evals[1]) }
      : { k: "Cobertura", v: `${res.score_coverage}%` }

  // Tiles: cada métrica avaliada vira um tile; investimento/receita fecham a grade.
  const tiles: Tile[] = evals.map((ev) => [
    ev.metric,
    fmtMetric(ev),
    STATUS_COLOR[ev.status] ?? "var(--txt)",
    ev.note.replace(/^Meta:\s*/i, "meta ").split(".")[0].slice(0, 28)
  ])
  if (invest) tiles.push(["Investimento", `R$ ${brl(invest)}`, "var(--txt)", "período informado"])
  if (revenue) tiles.push(["Receita", `R$ ${brl(revenue)}`, "var(--txt)", "spend × ROAS"])

  // Cenários → VM (título curto no padrão da UI).
  const scenarios = res.scenarios.map((s) => ({
    code: s.code as string,
    title: shortTitle(s.title),
    root_cause: s.root_cause,
    funnel_impact: s.funnel_impact,
    action: s.action,
    priority: s.priority
  }))

  // Ações prioritárias: derivadas 1:1 dos cenários (a fonte de verdade do engine).
  const actions = res.scenarios.map((s) => ({
    title: s.action,
    prio: PRIO_LABEL[s.priority] ?? "Baixa",
    why: s.root_cause,
    impact: s.funnel_impact
  }))

  // Sugestões: execution_rule dos cenários + extras da IA (se houver).
  const sugg: SuggestionVM[] = res.scenarios.slice(0, 3).map((s: ScenarioDetail) => ({
    name: shortTitle(s.title),
    impact: s.execution_rule.split(".")[0].slice(0, 60),
    effort: s.priority === 1 ? "Imediato" : "Planejado",
    urgency: PRIO_LABEL[s.priority] ?? "Baixa"
  }))
  for (const extra of res.ai_insights?.extra_scenarios ?? []) {
    if (sugg.length >= 5) break
    sugg.push({
      name: extra.title,
      impact: extra.recommended_action,
      effort: "IA",
      urgency: extra.confidence === "high" ? "Alta" : extra.confidence === "medium" ? "Média" : "Baixa"
    })
  }

  // Faixa de IA do card: resumo da IA se existir; senão a causa raiz nº 1;
  // senão o summary do engine. (Sanitizado no ponto de render.)
  const ai =
    res.ai_insights?.executive_summary ??
    (res.scenarios[0]
      ? `<b>${shortTitle(res.scenarios[0].title)}</b> — ${res.scenarios[0].root_cause}`
      : res.summary)

  // Oportunidade: janela de escala (G) quando aberta; senão a ação primária.
  const scale = res.scenarios.find((s) => s.code === "G")
  const opportunity = scale
    ? `<b>Janela de escala aberta.</b> ${scale.root_cause}`
    : `<b>Próximo passo:</b> ${res.primary_action}`

  return {
    id: res.campaign_id,
    name: res.campaign_name,
    platform: input.campaign.platform === "google_ads" ? "Google Ads" : "Meta Ads",
    status: resolveUIStatus(res),
    score: res.overall_score,
    invest,
    revenue,
    roasNum,
    cpaNum,
    ctrNum,
    freqNum,
    m1,
    m2,
    spark: Array(7).fill(res.overall_score), // sem histórico ainda — linha flat
    trend: 0,
    ai,
    summary: res.summary,
    opportunity,
    tiles,
    scenarios,
    actions,
    sugg,
    coverage: res.score_coverage,
    confidence: res.score_confidence
  }
}
