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

// =============================================================================
// Checkmarks das "Ações prioritárias" — por campanha, chave = título da ação
// (não há id estável vindo do engine). Sobrevive a sair/voltar do detalhe.
// =============================================================================

const DONE_KEY = "nex:doneActions"

function loadDoneMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function loadDoneActions(campaignId: number): Set<string> {
  return new Set(loadDoneMap()[String(campaignId)] ?? [])
}

export function toggleDoneAction(campaignId: number, title: string): Set<string> {
  const map = loadDoneMap()
  const key = String(campaignId)
  const cur = new Set(map[key] ?? [])
  cur.has(title) ? cur.delete(title) : cur.add(title)
  map[key] = [...cur]
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(map))
  } catch {
    /* quota — não pode derrubar a UI */
  }
  return cur
}

// =============================================================================
// Sincronização com a base COMPARTILHADA do servidor.
//
// ⚠️ TEMPORÁRIO — período de testes (14/08/2026). Sem login e sem dono: todo
//    mundo vê as mesmas campanhas. Ver `lib/api.ts` e o storage.py do backend.
//
// O localStorage deixa de ser a verdade e passa a ser cache: sobrevive a
// servidor fora do ar e mantém a tela populada enquanto a lista chega.
// =============================================================================

/**
 * Mescla a lista do servidor com o que existe neste navegador.
 *
 * Regras, nesta ordem:
 *
 * 1. O servidor manda no que já foi salvo lá (`serverId`). Uma campanha que
 *    sumiu de lá foi apagada por alguém da equipe e some daqui também — é o
 *    preço combinado da base compartilhada.
 * 2. Campanha local SEM `serverId` nunca chegou ao servidor (analisada com ele
 *    fora do ar, ou com a persistência desligada). É a única fonte desse dado,
 *    então JAMAIS pode ser descartada — vai para o topo, por ser a mais nova.
 */
export function mesclarComServidor(
  doServidor: CampaignVM[],
  locais: CampaignVM[] = loadLive()
): CampaignVM[] {
  const soLocais = locais.filter((c) => c.serverId === undefined)
  const mesclada = [...soLocais, ...doServidor]
  persist(mesclada)
  return mesclada
}

/**
 * Marca uma campanha local como salva no servidor, reancorando o id.
 *
 * O id muda porque na base compartilhada quem identifica é o servidor: o id
 * local (>= 1000, por navegador) colidiria entre pessoas diferentes.
 */
export function marcarComoSalva(
  vm: CampaignVM,
  serverId: number,
  idLocal: number
): CampaignVM[] {
  const salva = { ...vm, serverId, id: idLocal }
  const lista = loadLive().filter((c) => c.id !== vm.id && c.id !== idLocal)
  const nova = [salva, ...lista]
  persist(nova)
  return nova
}
