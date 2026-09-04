import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apagarCampanha, listarCampanhasSalvas, salvarCampanha, idLocalDoServidor } from "~lib/api"
import { loadLive, marcarComoSalva, mesclarComServidor, removeLive, upsertLive } from "~lib/store"
import type { CampaignVM } from "~types"

/**
 * Sincronização com a base COMPARTILHADA (temporária — período de testes).
 * O risco central aqui não é a UI ficar feia: é apagar campanha de alguém.
 */

function vm(over: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1000,
    name: "Campanha",
    platform: "Meta Ads",
    status: "YELLOW",
    score: 70,
    invest: 100,
    revenue: 200,
    roasNum: 2,
    cpaNum: null,
    ctrNum: null,
    freqNum: null,
    m1: { k: "CPA", v: "—" },
    m2: { k: "ROAS", v: "2x" },
    spark: [],
    trend: 0,
    ai: "",
    summary: "",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    ...over
  } as CampaignVM
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

const resposta = (status: number, body: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

// ─────────────────────────────────────────────────────────────────────────────

describe("mesclarComServidor — nunca pode perder dado só local", () => {
  it("campanha analisada sem servidor (sem serverId) sobrevive à sincronização", () => {
    const local = vm({ id: 1000, name: "Feita offline" })
    upsertLive(local)

    const mesclada = mesclarComServidor([vm({ id: 1005, serverId: 5, name: "Do servidor" })])

    expect(mesclada.map((c) => c.name)).toEqual(["Feita offline", "Do servidor"])
    // e continua no cache local depois
    expect(loadLive().map((c) => c.name)).toEqual(["Feita offline", "Do servidor"])
  })

  it("campanha apagada por outra pessoa some daqui também", () => {
    upsertLive(vm({ id: 1003, serverId: 3, name: "Apagada por alguem" }))

    const mesclada = mesclarComServidor([vm({ id: 1007, serverId: 7, name: "Ainda existe" })])

    expect(mesclada.map((c) => c.name)).toEqual(["Ainda existe"])
  })

  it("o servidor manda no conteúdo do que já foi salvo lá", () => {
    upsertLive(vm({ id: 1002, serverId: 2, name: "Nome antigo", score: 10 }))

    const mesclada = mesclarComServidor([vm({ id: 1002, serverId: 2, name: "Nome novo", score: 95 })])

    expect(mesclada).toHaveLength(1)
    expect(mesclada[0].name).toBe("Nome novo")
    expect(mesclada[0].score).toBe(95)
  })

  it("base compartilhada vazia não apaga o que só existe aqui", () => {
    upsertLive(vm({ id: 1000, name: "So minha" }))
    expect(mesclarComServidor([]).map((c) => c.name)).toEqual(["So minha"])
  })

  it("as locais ficam no topo — são as mais recentes", () => {
    upsertLive(vm({ id: 1000, name: "Nova, ainda nao salva" }))
    const r = mesclarComServidor([
      vm({ id: 1001, serverId: 1, name: "Antiga do servidor" })
    ])
    expect(r[0].name).toBe("Nova, ainda nao salva")
  })
})

describe("marcarComoSalva — reancorar o id", () => {
  it("troca o id local pelo id derivado do servidor, sem duplicar", () => {
    const local = vm({ id: 1000, name: "Minha" })
    upsertLive(local)

    const lista = marcarComoSalva(local, 4, idLocalDoServidor(4))

    expect(lista).toHaveLength(1)
    expect(lista[0].id).toBe(1004)
    expect(lista[0].serverId).toBe(4)
  })

  it("não deixa duas linhas quando o id local coincide com o novo", () => {
    const local = vm({ id: 1004, name: "Coincide" })
    upsertLive(local)

    const lista = marcarComoSalva(local, 4, 1004)
    expect(lista).toHaveLength(1)
  })

  it("preserva as outras campanhas", () => {
    upsertLive(vm({ id: 1001, serverId: 1, name: "Outra" }))
    const local = vm({ id: 1000, name: "Minha" })
    upsertLive(local)

    const nomes = marcarComoSalva(local, 9, 1009).map((c) => c.name)
    expect(nomes).toContain("Outra")
    expect(nomes).toContain("Minha")
  })
})

describe("idLocalDoServidor — o id do servidor não pode virar campanha de exemplo", () => {
  it("desloca para fora da faixa dos mocks", () => {
    // Sem o deslocamento, o id 1 do servidor colidiria com a campanha de
    // exemplo nº 1 e `isLiveId` a trataria como demo.
    expect(idLocalDoServidor(1)).toBe(1001)
    expect(idLocalDoServidor(1)).toBeGreaterThanOrEqual(1000)
  })
})

describe("listarCampanhasSalvas — degrada sem derrubar a UI", () => {
  it("devolve as campanhas reancoradas pelo id do servidor", async () => {
    fetchMock.mockResolvedValue(
      resposta(200, { campanhas: [{ id: 3, payload: { ...vm(), name: "Salva" } }] })
    )
    const r = await listarCampanhasSalvas()
    expect(r).toHaveLength(1)
    expect(r![0].id).toBe(1003)
    expect(r![0].serverId).toBe(3)
  })

  it("501 (persistência desligada) vira null, não erro", async () => {
    fetchMock.mockResolvedValue(resposta(501))
    await expect(listarCampanhasSalvas()).resolves.toBeNull()
  })

  it("servidor fora do ar vira null e não lança", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(listarCampanhasSalvas()).resolves.toBeNull()
  })

  it("null é diferente de lista vazia — vazio significa base sem nada", async () => {
    fetchMock.mockResolvedValue(resposta(200, { campanhas: [] }))
    await expect(listarCampanhasSalvas()).resolves.toEqual([])
  })

  it("resposta com formato inesperado não quebra a tela", async () => {
    fetchMock.mockResolvedValue(resposta(200, { qualquer: "coisa" }))
    await expect(listarCampanhasSalvas()).resolves.toBeNull()

    fetchMock.mockResolvedValue(resposta(200, { campanhas: [{ id: "x" }, null, { id: 1 }] }))
    // só a linha realmente utilizável passa (id numérico + payload objeto)
    await expect(listarCampanhasSalvas()).resolves.toEqual([])
  })
})

describe("salvarCampanha", () => {
  it("devolve o id do servidor", async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 12 }))
    await expect(salvarCampanha(vm())).resolves.toEqual({ ok: true, id: 12 })
  })

  it("manda o serverId quando é atualização", async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 7 }))
    await salvarCampanha(vm({ serverId: 7 }))

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe(7)
  })

  it("manda id null quando é campanha nova", async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 1 }))
    await salvarCampanha(vm())

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBeNull()
  })

  // Achado A4 (auditoria de rede, 2026-09-03): sem o client_id, uma resposta
  // perdida DEPOIS do servidor já ter gravado faz a próxima tentativa
  // inserir a campanha de novo — o servidor não tem como saber que é a
  // MESMA campanha vindo de novo.
  it("manda client_id quando a campanha já tem um (garantirClientId gera antes)", async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 1 }))
    await salvarCampanha(vm({ clientId: "abc-123" }))

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).client_id).toBe("abc-123")
  })

  it("manda client_id null quando a campanha ainda não tem um", async () => {
    fetchMock.mockResolvedValue(resposta(200, { id: 1 }))
    await salvarCampanha(vm())

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).client_id).toBeNull()
  })

  it("falha de rede é transitória — a campanha continua só no navegador, sem lançar", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(salvarCampanha(vm())).resolves.toEqual({ ok: false, permanente: false })
  })

  // Achado A3 (auditoria de rede, 2026-09-03): antes, TODA falha (transitória
  // ou permanente) colapsava no mesmo `null`, e o laço de sincronização
  // (`App.tsx`) retentava as duas pra sempre — inclusive as que nunca teriam
  // como dar certo sozinhas.
  it("500/501/503/504 são transitórias — vale a pena retentar na próxima abertura", async () => {
    for (const status of [500, 501, 503, 504]) {
      fetchMock.mockResolvedValue(resposta(status))
      await expect(salvarCampanha(vm()), `status ${status}`).resolves.toEqual({ ok: false, permanente: false })
    }
  })

  it("413 (payload grande demais) é permanente, com explicação pro usuário", async () => {
    fetchMock.mockResolvedValue(resposta(413))
    const r = await salvarCampanha(vm())
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ permanente: true })
    if (!r.ok && r.permanente) expect(r.explicacao).toMatch(/grande demais/i)
  })

  // Revisão do Opus (2026-09-04), achado R1: a primeira versão desta
  // correção classificava 507 como PERMANENTE — errado. Base cheia é estado
  // do SERVIDOR, não desta campanha: alguém libera espaço e a MESMA
  // campanha passaria a caber. Marcar como permanente trocava "retenta pra
  // sempre em silêncio" (o bug original) por "nunca mais tenta, mesmo
  // depois de resolvido" — uma regressão nova. 507 tem que continuar
  // elegível pro laço de sync retentar (`permanente: false`), só que com um
  // aviso pro usuário em vez do silêncio total.
  it("507 (base cheia) NÃO é permanente — continua elegível pra retentar, com aviso", async () => {
    fetchMock.mockResolvedValue(resposta(507))
    const r = await salvarCampanha(vm())
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ permanente: false })
    if (!r.ok && !r.permanente) expect(r.aviso).toMatch(/cheia/i)
  })

  it("falhas silenciosas (rede, 500) NÃO carregam aviso — só 507 tem", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    const semRede = await salvarCampanha(vm())
    expect(semRede).toEqual({ ok: false, permanente: false })

    fetchMock.mockResolvedValueOnce(resposta(500))
    const erro500 = await salvarCampanha(vm())
    expect(erro500).toEqual({ ok: false, permanente: false })
  })
})

describe("apagarCampanha — traduz a resposta do servidor em decisão", () => {
  it("200 é sucesso", async () => {
    fetchMock.mockResolvedValue(resposta(200, { removida: 3 }))
    await expect(apagarCampanha(3)).resolves.toBe("apagada")
  })

  it("404 também é sucesso — outra pessoa do time já apagou", async () => {
    // O objetivo do usuário era "que ela não esteja mais lá". Chamar isso de
    // falha geraria alarme sobre algo que já está do jeito que ele queria.
    fetchMock.mockResolvedValue(resposta(404))
    await expect(apagarCampanha(3)).resolves.toBe("sumiu")
  })

  it("erro do servidor e persistência desligada NÃO são sucesso", async () => {
    for (const status of [500, 501, 502, 429]) {
      fetchMock.mockResolvedValue(resposta(status))
      await expect(apagarCampanha(3), `status ${status}`).resolves.toBe("falhou")
    }
  })

  it("sem rede é falha, e não lança", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(apagarCampanha(3)).resolves.toBe("falhou")
  })

  it("usa DELETE no id certo", async () => {
    fetchMock.mockResolvedValue(resposta(200))
    await apagarCampanha(42)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/campaigns\/42$/)
    expect(init.method).toBe("DELETE")
  })
})

describe("removeLive", () => {
  it("remove só a campanha pedida e persiste", () => {
    upsertLive(vm({ id: 1001, name: "Fica" }))
    upsertLive(vm({ id: 1002, name: "Sai" }))

    expect(removeLive(1002).map((c) => c.name)).toEqual(["Fica"])
    expect(loadLive().map((c) => c.name)).toEqual(["Fica"])
  })

  it("id inexistente não apaga nada", () => {
    upsertLive(vm({ id: 1001, name: "Fica" }))
    expect(removeLive(9999)).toHaveLength(1)
  })

  it("remover a última deixa a lista vazia, não corrompida", () => {
    upsertLive(vm({ id: 1001 }))
    expect(removeLive(1001)).toEqual([])
    expect(loadLive()).toEqual([])
  })
})
