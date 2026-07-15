import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from "react"

import { IconCompare, IconPlus, IconSearch } from "~components/Icons"
import { STATUS } from "~lib/status"
import type { CampaignVM, UIStatus } from "~types"

type Item =
  | { kind: "campaign"; id: number; label: string; status: UIStatus }
  | { kind: "action"; label: string; run: () => void }

export function CommandPalette({
  campaigns,
  onClose,
  onSelectCampaign,
  onNew,
  onCompare
}: {
  campaigns: CampaignVM[]
  onClose: () => void
  onSelectCampaign: (id: number) => void
  onNew: () => void
  onCompare: () => void
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const items = useMemo<Item[]>(() => {
    const all: Item[] = [
      ...campaigns.map(
        (c): Item => ({ kind: "campaign", id: c.id, label: c.name, status: c.status })
      ),
      { kind: "action", label: "Nova campanha", run: onNew },
      { kind: "action", label: "Comparar campanhas", run: onCompare }
    ]
    const term = q.trim().toLowerCase()
    return term ? all.filter((i) => i.label.toLowerCase().includes(term)) : all
  }, [q, campaigns, onNew, onCompare])

  useEffect(() => {
    setActive(0)
  }, [q])

  const run = (i: Item) => (i.kind === "campaign" ? onSelectCampaign(i.id) : i.run())

  function onKey(e: RKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, items.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (items[active]) run(items[active])
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="cmdk-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" onKeyDown={onKey}>
        <div className="cmdk-search">
          <IconSearch />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar campanha ou ação…"
          />
          <span className="cmdk-kbd">esc</span>
        </div>
        <div className="cmdk-list">
          {items.length === 0 && <div className="cmdk-empty">Nada encontrado</div>}
          {items.map((i, idx) => (
            <div
              key={i.kind === "campaign" ? `c${i.id}` : `a${i.label}`}
              className={`cmdk-item${idx === active ? " active" : ""}`}
              onMouseEnter={() => setActive(idx)}
              onClick={() => run(i)}>
              {i.kind === "campaign" ? (
                <>
                  <span className="cmdk-ic"><span className="cmdk-dot" style={{ background: STATUS[i.status].color }} /></span>
                  <span className="cmdk-label">{i.label}</span>
                  <span className="cmdk-tag" style={{ background: STATUS[i.status].bg, color: STATUS[i.status].color }}>{STATUS[i.status].label}</span>
                </>
              ) : (
                <>
                  <span className="cmdk-ic">{i.label === "Nova campanha" ? <IconPlus /> : <IconCompare />}</span>
                  <span className="cmdk-label">{i.label}</span>
                  <span className="cmdk-tag ghost">ação</span>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
