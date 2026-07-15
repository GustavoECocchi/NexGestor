import { IconSpark } from "~components/Icons"
import { Sparkline } from "~components/Sparkline"
import { sanitizeHtml } from "~lib/sanitize"
import { STATUS } from "~lib/status"
import type { CampaignVM } from "~types"

export function CampaignCard({
  c,
  index,
  onOpen
}: {
  c: CampaignVM
  index: number
  onOpen: (id: number) => void
}) {
  const s = STATUS[c.status]
  const td = c.trend > 0 ? "up" : c.trend < 0 ? "down" : "flat"
  return (
    <div className="card" style={{ animationDelay: `${index * 70}ms` }} onClick={() => onOpen(c.id)}>
      <div className="glow" style={{ background: `radial-gradient(180px 90px at 90% 0%, ${s.bg}, transparent 70%)` }} />
      <div className="card-top">
        <div style={{ flex: 1 }}>
          <div className="card-name">{c.name}</div>
          <div className="card-plat"><span className="dot" style={{ background: s.color }} />{c.platform}</div>
        </div>
        <div className="pill" style={{ background: s.bg, color: s.color }}>{s.label}</div>
      </div>
      <div className="card-mid">
        <div className="metrics-row">
          <div className="m"><span className="k">{c.m1.k}</span><span className="v">{c.m1.v}</span></div>
          <div className="m"><span className="k">{c.m2.k}</span><span className="v">{c.m2.v}</span></div>
        </div>
        <div className="spark-box">
          <Sparkline series={c.spark} color={s.color} />
          <div className={`spark-trend ${td}`}>
            <svg width={11} height={11} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              {c.trend > 0 ? <path d="M6 14l5-5 5 5" /> : c.trend < 0 ? <path d="M6 10l5 5 5-5" /> : <path d="M5 12h14" />}
            </svg>
            {c.trend > 0 ? "+" : ""}{c.trend}% / 7d
          </div>
        </div>
      </div>
      <div className="ai-strip">
        <IconSpark className="sp" />
        <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.ai) }} />
      </div>
    </div>
  )
}
