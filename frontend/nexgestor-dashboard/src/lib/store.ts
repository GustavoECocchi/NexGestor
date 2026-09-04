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

/**
 * Garante que a campanha tem um `clientId` estável ANTES de tentar salvar no
 * servidor (achado A4 da auditoria de rede, 2026-09-03). Gerado uma única
 * vez e persistido aqui, não só mantido em memória: um reload no meio do
 * envio geraria outro id na próxima tentativa, e o servidor voltaria a ver
 * duas campanhas onde só existe uma — exatamente o bug que o `clientId`
 * existe para fechar.
 *
 * Sempre persiste, mesmo se `vm` ainda não estiver na lista salva (revisão
 * do Opus, 2026-09-04, achado R4): a versão original só atualizava uma
 * entrada já existente e devolvia o `clientId` gerado sem gravá-lo quando a
 * campanha não era encontrada — nos dois chamadores de hoje isso nunca
 * acontece (ambos persistem antes de chamar esta função), mas quebraria em
 * silêncio a garantia de idempotência pro próximo chamador que não seguisse
 * essa mesma ordem: uma falha de rede faria o `clientId` se perder e a
 * campanha voltaria a poder duplicar na base.
 */
export function garantirClientId(vm: CampaignVM): CampaignVM {
  if (vm.clientId) return vm
  const comId = { ...vm, clientId: crypto.randomUUID() }
  const list = loadLive()
  const idx = list.findIndex((c) => c.id === vm.id)
  const nova = idx === -1 ? [comId, ...list] : list.map((c, i) => (i === idx ? comId : c))
  persist(nova)
  return comId
}

/**
 * Marca uma campanha como permanentemente impossível de sincronizar (achado
 * A3, só pra causas ligadas ao CONTEÚDO da campanha — hoje, 413): o laço de
 * sincronização (`App.tsx`) para de retentar em silêncio e o card passa a
 * mostrar o motivo, em vez de tentar pra sempre sem que o usuário jamais
 * saiba que aquela campanha específica não vai sair daqui.
 *
 * NÃO use para 507 (base cheia) — é estado do servidor, não desta campanha,
 * e pode se resolver sozinho. Ver `registrarAvisoTransitorio` (achado R1).
 */
export function marcarFalhaPermanente(vm: CampaignVM, explicacao: string): CampaignVM[] {
  const list = loadLive()
  const nova = list.map((c) => (c.id === vm.id ? { ...c, syncFalhouPermanente: explicacao } : c))
  persist(nova)
  return nova
}

/**
 * Registra o resultado da tentativa de sync mais recente SEM tirar a
 * campanha do laço de retry (`App.tsx` continua tentando na próxima
 * abertura). `aviso` undefined limpa um aviso anterior que não se aplica
 * mais — evita mostrar "base cheia" depois que a causa real já mudou.
 *
 * Existe porque a primeira versão do achado A3 tratava 507 como
 * `syncFalhouPermanente` (revisão do Opus, 2026-09-04, achado R1): base
 * cheia é estado do SERVIDOR, não desta campanha — marcar como permanente
 * trocava "retenta pra sempre em silêncio" (o bug original) por "nunca mais
 * tenta, mesmo depois de alguém liberar espaço" (uma regressão nova).
 */
export function registrarAvisoTransitorio(vm: CampaignVM, aviso: string | undefined): CampaignVM[] {
  const list = loadLive()
  const nova = list.map((c) => (c.id === vm.id ? { ...c, syncAviso: aviso } : c))
  persist(nova)
  return nova
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
 *
 * `syncAviso: undefined` (achado R1, revisão do Opus 2026-09-04): uma
 * campanha que teve 507 numa tentativa anterior chega aqui com o aviso
 * ainda no objeto (`registrarAvisoTransitorio` não é chamado de novo no
 * caminho de sucesso) — sem limpar, o card mostraria "base cheia" numa
 * campanha que ACABOU de sincronizar com sucesso.
 */
export function marcarComoSalva(
  vm: CampaignVM,
  serverId: number,
  idLocal: number
): CampaignVM[] {
  const salva = { ...vm, serverId, id: idLocal, syncAviso: undefined }
  const lista = loadLive().filter((c) => c.id !== vm.id && c.id !== idLocal)
  const nova = [salva, ...lista]
  persist(nova)
  return nova
}

/** Remove uma campanha do cache local. Devolve a lista nova. */
export function removeLive(id: number): CampaignVM[] {
  const nova = loadLive().filter((c) => c.id !== id)
  persist(nova)
  return nova
}
