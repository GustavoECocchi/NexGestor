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
import { brl, brlCents, dec } from "~lib/format"

// ── helpers ─────────────────────────────────────────────────────────────────

const PRIO_LABEL: Record<number, Priority> = { 1: "Alta", 2: "Média", 3: "Baixa" }

// Espelha CampaignPlatform em app/schema/schema.py — manter em sincronia.
const PLATFORM_LABELS: Record<string, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  tiktok_ads: "TikTok Ads",
  linkedin_ads: "LinkedIn Ads"
}

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
  if (m === "CPA" || m === "CPC" || m === "CPL" || m === "CPM") return `R$ ${brlCents(v)}`
  if (m === "ROAS") return `${dec(v)}x`
  if (m === "Frequência") return dec(v)
  if (m === "Conversões/semana") return String(Math.round(v))
  return `${dec(v)}%` // Hook, Hold, CTRs, Conversão LP
}

function findEval(evals: MetricEvaluation[], metric: string) {
  return evals.find((e) => e.metric === metric)
}

/**
 * Legenda curta do tile: primeira frase da nota do engine.
 *
 * Cortar em `.` seco quebra número decimal — o ponto de "R$39.90" é o mesmo
 * caractere que encerra a frase. Isso exibia a meta do gestor errada na tela:
 * `Meta: <R$39.90.` virava "meta <R$39", e `Limite de fadiga: 2.8.` virava
 * "Limite de fadiga: 2". Só encerra frase o ponto seguido de espaço (ou de
 * fim de string), então é isso que separa.
 */
function tileNote(note: string): string {
  return note
    .replace(/^Meta:\s*/i, "meta ")
    .split(/\.(?=\s|$)/)[0]
    .slice(0, 28)
}

/**
 * Primeira frase de um texto longo do engine ou da IA, para caber num card.
 *
 * Três armadilhas, todas observadas em texto real:
 *
 *  1. Metade das `execution_rule` do engine é lista numerada ("1. Conferir o
 *     pixel. 2. Abrir..."). Cortar no primeiro ponto devolvia literalmente
 *     `"1"` — e o card exibia "Impacto 1", o Copiloto dizia "impacto 1".
 *     O marcador de lista é removido antes de procurar o fim da frase.
 *  2. Ponto decimal não encerra frase (mesma questão de `tileNote`).
 *  3. Cortar no caractere 60 partia palavra e número no meio ("headline
 *     visual ag", "reduzir em 3" onde o texto dizia 30%). Agora corta na
 *     última palavra inteira e marca com reticências, para o corte ficar
 *     evidente em vez de passar por texto completo.
 */
function primeiraFrase(texto: string, limite: number): string {
  const semMarcador = texto.replace(/^\s*\d+\s*[.)]\s*/, "")
  const frase = semMarcador.split(/\.(?=\s|$)/)[0].trim()
  if (frase.length <= limite) return frase

  const corte = frase.slice(0, limite)
  const ultimoEspaco = corte.lastIndexOf(" ")
  // Só volta até a palavra anterior se isso não jogar fora quase todo o texto.
  const base = ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte
  return base.replace(/[\s,;:—-]+$/, "") + "…"
}

function resolveUIStatus(res: CampaignAnalysisResponse): UIStatus {
  const hasScaleWindow = res.scenarios.some((s) => s.code === "G")
  // "Escalável" é um convite a gastar mais: exige janela de escala E confiança
  // que não seja baixa. O engine já não abre a janela sem evidência (ver
  // _evidencia_faltante_para_escala no backend); esta é a segunda barreira, no
  // lugar onde o rótulo vira decisão de verba — as duas camadas caem juntas
  // só se ambas falharem.
  const confiavel = res.score_confidence !== "low"
  if (res.final_status === "GREEN" && hasScaleWindow && confiavel) return "BLUE"
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

  // Números-base: preferir o que o gestor enviou; cair para o avaliado; se não
  // existe em lugar nenhum, fica `null` — ausência é ausência, não zero.
  const roasNum = m.roas ?? findEval(evals, "ROAS")?.value ?? null
  const cpaNum = m.cpa ?? findEval(evals, "CPA")?.value ?? null
  const ctrNum = m.ctr_link ?? findEval(evals, "CTR Link")?.value ?? null
  const freqNum = m.frequency ?? findEval(evals, "Frequência")?.value ?? null
  const invest = m.spend ?? 0
  const revenue = invest > 0 && roasNum != null ? Math.round(invest * roasNum) : 0

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
    tileNote(ev.note)
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
    impact: primeiraFrase(s.execution_rule, 60),
    effort: s.priority === 1 ? "Imediato" : "Planejado",
    urgency: PRIO_LABEL[s.priority] ?? "Baixa"
  }))
  for (const extra of res.ai_insights?.extra_scenarios ?? []) {
    if (sugg.length >= 5) break
    sugg.push({
      name: extra.title,
      // Mesmo corte aplicado à sugestão vinda do engine (execution_rule acima).
      // Sem ele, uma ação longa da IA estourava o card — o schema da IA não tem
      // limite de tamanho, então o controle tem que ser aqui.
      impact: primeiraFrase(extra.recommended_action, 60),
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
    platform: PLATFORM_LABELS[input.campaign.platform ?? "meta_ads"] ?? "Meta Ads",
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
    primaryAction: res.primary_action,
    tiles,
    scenarios,
    actions,
    sugg,
    coverage: res.score_coverage,
    confidence: res.score_confidence,
    // Só é "IA" o que veio da camada de IA. Sem isso a UI chamava de
    // "Diagnóstico IA" um texto do engine determinístico.
    hasAI: res.ai_insights != null,
    // Estes dois blocos eram descartados: a IA os produzia (e eram cobrados),
    // mas nada na tela os lia. `?? []` porque a IA pode responder sem eles.
    aiInsights: res.ai_insights?.contextual_insights ?? [],
    aiRisks: res.ai_insights?.risk_warnings ?? []
  }
}
