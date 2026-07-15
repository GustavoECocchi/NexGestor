// =============================================================================
// Store de campanhas analisadas AO VIVO pelo backend.
//
// Persistência: localStorage (decisão do projeto — sem @plasmohq/storage).
// IDs vivos começam em 1000 para nunca colidir com os mocks (ids 1..N).
// O mock continua existindo como demo; a Home mescla vivo + mock, com as
// campanhas vivas primeiro (são as do usuário).
// =============================================================================

import type { CampaignVM } from "~types"

const KEY = "nex:live"
const LIVE_ID_BASE = 1000

export function loadLive(): CampaignVM[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CampaignVM[]) : []
  } catch {
    return []
  }
}

function persist(list: CampaignVM[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* quota/serialização — não pode derrubar a UI */
  }
}

/** Insere ou substitui (por id) uma campanha viva. Retorna a lista nova. */
export function upsertLive(vm: CampaignVM): CampaignVM[] {
  const list = loadLive()
  const next = [vm, ...list.filter((c) => c.id !== vm.id)]
  persist(next)
  return next
}

/** Próximo id de campanha viva (>= 1000, nunca colide com mock). */
export function nextLiveId(): number {
  const list = loadLive()
  const max = list.reduce((acc, c) => Math.max(acc, c.id), LIVE_ID_BASE - 1)
  return max + 1
}

export function isLiveId(id: number): boolean {
  return id >= LIVE_ID_BASE
}
