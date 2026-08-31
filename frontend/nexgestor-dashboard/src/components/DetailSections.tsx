import { useState } from "react"

import { IconAlert, IconBolt, IconBulb, IconTrendUp } from "~components/Icons"
import { loadDoneActions, toggleDoneAction } from "~lib/store"
import { sanitizeHtml } from "~lib/sanitize"
import { PA_COLOR, PRIO, STATUS, URG_COLOR } from "~lib/status"
import type { CampaignVM } from "~types"

export function OpportunityCard({ c }: { c: CampaignVM }) {
  return (
    <div className="opp">
      <div className="oh"><IconBulb /><span>Oportunidade detectada</span></div>
      <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.opportunity) }} />
    </div>
  )
}

export function DiagnosisCards({ c }: { c: CampaignVM }) {
  const s = STATUS[c.status]
  return (
    <>
      {c.scenarios.map((sc) => {
        const p = PRIO[sc.priority]
        return (
          <div className="diag" key={sc.code} style={{ borderLeftColor: s.color }}>
            <div className="dh">
              <span className="code" style={{ background: s.bg, color: s.color }}>Cenário {sc.code}</span>
              <span className="dt">{sc.title}</span>
              <span className="prio" style={{ background: p.b, color: p.c }}>{p.t}</span>
            </div>
            <div className="lbl">Causa raiz</div>
            <p>{sc.root_cause}</p>
            <div className="lbl">Impacto no funil</div>
            <p>{sc.funnel_impact}</p>
            <div className="act"><IconBolt /><p>{sc.action}</p></div>
          </div>
        )
      })}
    </>
  )
}

function PriorityActionItem({
  a,
  campaignId
}: {
  a: CampaignVM["actions"][number]
  campaignId: number
}) {
  const [doneSet, setDoneSet] = useState(() => loadDoneActions(campaignId))
  const done = doneSet.has(a.title)
  const p = PA_COLOR[a.prio]
  const toggle = () => setDoneSet(toggleDoneAction(campaignId, a.title))
  return (
    <div
      className={`pa${done ? " checked" : ""}`}
      role="checkbox"
      aria-checked={done}
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle())}>
      <div className="cb">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <div className="pa-body">
        <div className="pa-head">
          <span className="pa-title">{a.title}</span>
          <span className="pa-prio" style={{ background: p.b, color: p.c }}>{a.prio}</span>
        </div>
        <div className="pa-why">{a.why}</div>
        <div className="pa-impact"><IconTrendUp />{a.impact}</div>
      </div>
    </div>
  )
}

export function PriorityActions({ c }: { c: CampaignVM }) {
  return (
    <>
      {c.actions.map((a) => (
        <PriorityActionItem key={a.title} a={a} campaignId={c.id} />
      ))}
    </>
  )
}

export function Suggestions({ c }: { c: CampaignVM }) {
  return (
    <div className="sug-wrap">
      {c.sugg.map((s) => (
        <div className="sg2" key={s.name}>
          <div className="sn"><IconBolt />{s.name}</div>
          <div className="sm">
            <span className="tag">Impacto <b style={{ color: "var(--txt)" }}>{s.impact}</b></span>
            <span className="tag">Esforço <b style={{ color: "var(--txt)" }}>{s.effort}</b></span>
            <span className="tag">Urgência <b style={{ color: URG_COLOR[s.urgency] }}>{s.urgency}</b></span>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Insights e riscos vindos da camada de IA.
 *
 * Estes dois blocos existiam na resposta do backend desde sempre e nunca eram
 * exibidos — a chamada ao Gemini era paga, o alerta de risco era escrito, e
 * morria no adapter. Renderizados como TEXTO puro (sem `dangerouslySetInnerHTML`):
 * é conteúdo gerado por modelo, então não há motivo para deixá-lo injetar HTML.
 */
export function AIExtras({ c }: { c: CampaignVM }) {
  const insights = c.aiInsights ?? []
  const riscos = c.aiRisks ?? []
  if (insights.length === 0 && riscos.length === 0) return null

  return (
    <div className="ai-extras">
      {insights.map((i) => (
        <div className="ai-extra" key={`i-${i.title}`}>
          <div className="ai-extra-h"><IconBulb />{i.title}</div>
          <p>{i.explanation}</p>
        </div>
      ))}
      {riscos.map((r) => (
        <div className="ai-extra risco" key={`r-${r.title}`}>
          <div className="ai-extra-h">
            <IconAlert />
            {r.title}
            {/* A janela estimada é o que torna o alerta acionável ("48h" muda a
                decisão de hoje); sem ela vira aviso genérico. */}
            {r.timeframe && <span className="ai-prazo">{r.timeframe}</span>}
          </div>
          <p>{r.explanation}</p>
        </div>
      ))}
    </div>
  )
}
