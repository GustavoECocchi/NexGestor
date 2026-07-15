import { brl, dec } from "~lib/format"
import { STATUS } from "~lib/status"
import type { CampaignVM, UIStatus } from "~types"

export function Summary({
  campaigns,
  filter,
  onToggle
}: {
  campaigns: CampaignVM[]
  filter?: UIStatus | null
  onToggle?: (s: UIStatus) => void
}) {
  const a = campaigns.reduce(
    (acc, c) => {
      acc[c.status]++
      acc.invest += c.invest
      acc.revenue += c.revenue
      acc.roas += c.roasNum
      acc.cpa += c.cpaNum
      return acc
    },
    { RED: 0, YELLOW: 0, GREEN: 0, BLUE: 0, invest: 0, revenue: 0, roas: 0, cpa: 0 } as any
  )
  const n = campaigns.length
  const roasMed = n ? a.roas / n : 0
  const cpaMed = n ? a.cpa / n : 0

  const chip = (count: number, label: string, key: UIStatus) => {
    if (!count) return null
    const s = STATUS[key]
    const activeF = filter === key
    const dim = filter != null && !activeF
    return (
      <button
        key={key}
        className={`chip chip-btn${activeF ? " active" : ""}${dim ? " dim" : ""}`}
        style={{ background: s.bg, color: s.color }}
        onClick={() => onToggle?.(key)}>
        <span className="cdot" style={{ background: s.color }} />
        <b>{count}</b> {label}
      </button>
    )
  }

  return (
    <div className="summary">
      <div className="sum-head">
        <h2>{n} campanha{n === 1 ? "" : "s"} ativa{n === 1 ? "" : "s"}</h2>
        <span>últimos 7 dias</span>
      </div>
      <div className="chips">
        {chip(a.RED, "crítico", "RED")}
        {chip(a.YELLOW, "atenção", "YELLOW")}
        {chip(a.GREEN, "saudável", "GREEN")}
        {chip(a.BLUE, "escalável", "BLUE")}
      </div>
      <div className="fin-grid">
        <div className="fin"><div className="fk">Investimento</div><div className="fv">R$ {brl(a.invest)}</div></div>
        <div className="fin"><div className="fk">Receita</div><div className="fv" style={{ color: "var(--green)" }}>R$ {brl(a.revenue)}</div></div>
        <div className="fin"><div className="fk">ROAS médio</div><div className="fv">{dec(roasMed)}x</div></div>
        <div className="fin"><div className="fk">CPA médio</div><div className="fv">R$ {brl(cpaMed)}</div></div>
      </div>
    </div>
  )
}
