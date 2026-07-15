import { useState } from "react"

import { CampaignCard } from "~components/CampaignCard"
import { IconCompare, IconPlus } from "~components/Icons"
import { Summary } from "~components/Summary"
import { STATUS } from "~lib/status"
import type { CampaignVM, UIStatus } from "~types"

export function Home({
  campaigns,
  onOpenCampaign,
  onNew,
  onCompare
}: {
  campaigns: CampaignVM[]
  onOpenCampaign: (id: number) => void
  onNew: () => void
  onCompare: () => void
}) {
  const [filter, setFilter] = useState<UIStatus | null>(null)
  const toggle = (s: UIStatus) => setFilter((f) => (f === s ? null : s))
  const list = filter ? campaigns.filter((c) => c.status === filter) : campaigns

  return (
    <div className="scroll fade-in">
      <div className="sec-label">Resumo geral <span className="ln" /></div>
      <Summary campaigns={campaigns} filter={filter} onToggle={toggle} />

      <div className="sec-label">
        Campanhas ativas
        {filter && (
          <button className="filter-tag" onClick={() => setFilter(null)}>
            {STATUS[filter].label} <span>✕</span>
          </button>
        )}
        <span className="ln" />
        <button className="mini-btn" onClick={onCompare}><IconCompare />Comparar</button>
      </div>

      <div className="feed">
        {list.map((c, i) => (
          <CampaignCard key={c.id} c={c} index={i} onOpen={onOpenCampaign} />
        ))}
      </div>

      <div style={{ padding: "0 16px 22px" }}>
        <button className="new-btn" onClick={onNew}><IconPlus />Nova campanha</button>
      </div>
    </div>
  )
}
