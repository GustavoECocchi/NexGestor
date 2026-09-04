import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  garantirClientId,
  isLiveId,
  loadDoneActions,
  loadLive,
  marcarFalhaPermanente,
  nextLiveId,
  toggleDoneAction,
  upsertLive
} from "~lib/store"
import type { CampaignVM } from "~types"

function vm(id: number, name = `Campanha ${id}`): CampaignVM {
  return {
    id,
    name,
    platform: "Meta Ads",
    status: "GREEN",
    score: 80,
    invest: 100,
    revenue: 400,
    roasNum: 4,
    cpaNum: 20,
    ctrNum: 1.5,
    freqNum: 1.2,
    m1: { k: "CPA", v: "R$ 20" },
    m2: { k: "CTR Link", v: "1,5%" },
    spark: [80, 80, 80, 80, 80, 80, 80],
    trend: 0,
    ai: "",
    summary: "",
    opportunity: "",
    primaryAction: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: []
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe("isLiveId", () => {
  it("ids >= 1000 são vivos; ids de mock (1..N) não são", () => {
    expect(isLiveId(1000)).toBe(true)
    expect(isLiveId(1001)).toBe(true)
    expect(isLiveId(1)).toBe(false)
    expect(isLiveId(999)).toBe(false)
    expect(isLiveId(0)).toBe(false)
  })
})

describe("loadLive / upsertLive", () => {
  it("começa vazio", () => {
    expect(loadLive()).toEqual([])
  })

  it("insere no início da lista", () => {
    upsertLive(vm(1000))
    const list = upsertLive(vm(1001))
    expect(list.map((c) => c.id)).toEqual([1001, 1000])
  })

  it("upsert por id substitui em vez de duplicar", () => {
    upsertLive(vm(1000, "Original"))
    const list = upsertLive(vm(1000, "Reanalisada"))
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("Reanalisada")
  })

  it("persiste entre chamadas (via localStorage)", () => {
    upsertLive(vm(1000))
    expect(loadLive()).toHaveLength(1)
    expect(loadLive()[0].id).toBe(1000)
  })

  it("localStorage corrompido não derruba a UI — volta lista vazia", () => {
    localStorage.setItem("nex:live", "{not json")
    expect(loadLive()).toEqual([])
  })

  it("valor salvo que não é array vira lista vazia", () => {
    localStorage.setItem("nex:live", JSON.stringify({ not: "an array" }))
    expect(loadLive()).toEqual([])
  })
})

describe("nextLiveId", () => {
  it("começa em 1000 sem campanhas vivas", () => {
    expect(nextLiveId()).toBe(1000)
  })

  it("incrementa a partir do maior id existente", () => {
    upsertLive(vm(1000))
    upsertLive(vm(1005))
    expect(nextLiveId()).toBe(1006)
  })

  it("nunca colide com ids de mock, mesmo que o histórico esteja vazio", () => {
    expect(nextLiveId()).toBeGreaterThanOrEqual(1000)
  })
})

describe("garantirClientId — achado A4 (auditoria de rede, 2026-09-03)", () => {
  it("gera um UUID e devolve a campanha com ele", () => {
    const comId = garantirClientId(vm(1000))
    expect(comId.clientId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it("campanha já com clientId não gera outro (idempotente por si só)", () => {
    const original = { ...vm(1000), clientId: "ja-existente" }
    expect(garantirClientId(original).clientId).toBe("ja-existente")
  })

  it("persiste o clientId quando a campanha JÁ está na lista salva", () => {
    upsertLive(vm(1000))
    const comId = garantirClientId(vm(1000))
    expect(loadLive()[0].clientId).toBe(comId.clientId)
  })

  // Revisão do Opus (2026-09-04), achado R4: a versão original devolvia o
  // clientId gerado SEM persistir quando a campanha não era encontrada na
  // lista — uma falha silenciosa que quebraria a garantia de idempotência
  // pro próximo chamador que não persistisse antes de chamar esta função.
  it("persiste o clientId MESMO quando a campanha ainda não está na lista salva", () => {
    // Nada em localStorage — nenhum upsertLive chamado antes.
    const comId = garantirClientId(vm(1000))
    expect(loadLive()).toHaveLength(1)
    expect(loadLive()[0].clientId).toBe(comId.clientId)
  })

  it("o clientId sobrevive a uma leitura nova (sobrevive a reload no meio do envio)", () => {
    const comId = garantirClientId(vm(1000))
    // Simula reload: nova leitura do zero, não a mesma referência em memória.
    const relido = garantirClientId(loadLive()[0])
    expect(relido.clientId).toBe(comId.clientId)
  })
})

describe("marcarFalhaPermanente — achado A3 (auditoria de rede, 2026-09-03)", () => {
  it("marca a campanha com a explicação", () => {
    upsertLive(vm(1000))
    marcarFalhaPermanente(vm(1000), "Campanha grande demais para o servidor aceitar.")
    expect(loadLive()[0].syncFalhouPermanente).toBe("Campanha grande demais para o servidor aceitar.")
  })

  it("não mexe nas outras campanhas", () => {
    upsertLive(vm(1000))
    upsertLive(vm(1001))
    marcarFalhaPermanente(vm(1000), "motivo")
    const outras = loadLive().filter((c) => c.id !== 1000)
    expect(outras.every((c) => c.syncFalhouPermanente === undefined)).toBe(true)
  })
})

describe("checkmarks de ações prioritárias", () => {
  it("nenhum feito por padrão", () => {
    expect(loadDoneActions(1000)).toEqual(new Set())
  })

  it("toggle marca e desmarca", () => {
    const after1 = toggleDoneAction(1000, "Trocar criativo")
    expect(after1.has("Trocar criativo")).toBe(true)
    expect(loadDoneActions(1000).has("Trocar criativo")).toBe(true)

    const after2 = toggleDoneAction(1000, "Trocar criativo")
    expect(after2.has("Trocar criativo")).toBe(false)
    expect(loadDoneActions(1000).has("Trocar criativo")).toBe(false)
  })

  it("checkmarks são isolados por campanha", () => {
    toggleDoneAction(1000, "Ação X")
    expect(loadDoneActions(1000).has("Ação X")).toBe(true)
    expect(loadDoneActions(1001).has("Ação X")).toBe(false)
  })

  it("quota estourada (setItem lança) não derruba a UI", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError")
    })
    expect(() => toggleDoneAction(1000, "Ação Y")).not.toThrow()
    spy.mockRestore()
  })
})
