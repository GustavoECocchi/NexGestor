import { useState } from "react"

import { CampaignCard } from "~components/CampaignCard"
import { IconCompare, IconPlus, IconSpark } from "~components/Icons"
import { Summary } from "~components/Summary"
import { isLiveId } from "~lib/store"
import { STATUS } from "~lib/status"
import type { CampaignVM, UIStatus } from "~types"

export function Home({
  campaigns,
  liveCount,
  onOpenCampaign,
  onNew,
  onCompare,
  onDelete
}: {
  campaigns: CampaignVM[]
  liveCount: number
  onOpenCampaign: (id: number) => void
  onNew: () => void
  onCompare: () => void
  onDelete: (id: number) => Promise<boolean>
}) {
  const [filter, setFilter] = useState<UIStatus | null>(null)
  const toggle = (s: UIStatus) => setFilter((f) => (f === s ? null : s))
  const list = filter ? campaigns.filter((c) => c.status === filter) : campaigns
  // Usuário nunca analisou uma campanha própria: só há demos na tela.
  const noneOwn = liveCount === 0

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

      {campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-ico"><IconSpark /></div>
          <h3>Nenhuma campanha ainda</h3>
          <p>Analise sua primeira campanha pra começar a ver o diagnóstico aqui.</p>
        </div>
      ) : (
        <>
          {noneOwn && !filter && (
            <div className="demo-note">
              <IconSpark />
              <div>
                <b>Você ainda não criou nenhuma campanha.</b>
                <span>As abaixo são exemplos para explorar — clique em “Nova campanha” para analisar a sua.</span>
              </div>
            </div>
          )}
          {list.length === 0 ? (
            <div className="empty-state empty-state-sm">
              <p>Nenhuma campanha com esse status.</p>
            </div>
          ) : (
            <div className="feed">
              {list.map((c, i) => (
                <CampaignCard
                  key={c.id}
                  c={c}
                  index={i}
                  demo={!isLiveId(c.id)}
                  onOpen={onOpenCampaign}
                  // Exemplo não é apagável: não pertence a ninguém e volta no
                  // próximo carregamento (vem do mock, não do servidor).
                  onDelete={isLiveId(c.id) ? onDelete : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ padding: "0 16px 22px" }}>
        <button className="new-btn" onClick={onNew}><IconPlus />Nova campanha</button>
      </div>
    </div>
  )
}
