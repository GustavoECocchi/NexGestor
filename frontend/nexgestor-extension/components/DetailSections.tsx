import { useState } from "react"

import { IconBolt, IconBulb, IconTrendUp } from "~components/Icons"
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

export function MetricTiles({ c }: { c: CampaignVM }) {
  return (
    <div className="mgrid">
      {c.tiles.map((t, i) => (
        <div className="mtile" key={t[0]} style={{ animationDelay: `${i * 55}ms` }}>
          <div className="mk">{t[0]}</div>
          <div className="mv" style={{ color: t[2] }}>{t[1]}</div>
          <div className="md">{t[3]}</div>
        </div>
      ))}
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

function PriorityActionItem({ a }: { a: CampaignVM["actions"][number] }) {
  const [done, setDone] = useState(false)
  const p = PA_COLOR[a.prio]
  return (
    <div className={`pa${done ? " checked" : ""}`} onClick={() => setDone((d) => !d)}>
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
        <PriorityActionItem key={a.title} a={a} />
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
