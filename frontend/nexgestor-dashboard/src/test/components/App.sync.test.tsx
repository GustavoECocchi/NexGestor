import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { App } from "~components/App"
import { loadLive } from "~lib/store"
import type { CampaignVM } from "~types"

/**
 * Laço de sincronização de campanhas pendentes (`App.tsx`, efeito de
 * montagem), ponta a ponta — não só as funções de `lib/api.ts`/`lib/store.ts`
 * isoladas.
 *
 * Auditoria de rede (2026-09-03) apontou esta lacuna especificamente: o laço
 * só era MOCKADO nos outros testes de `App` (`vi.fn(async () => ...)`),
 * nunca exercitado de verdade — o bug do achado A3 (retentar pra sempre uma
 * falha permanente) e a correção do A4 (client_id estável) vivem
 * exatamente nesse laço.
 */

vi.mock("~lib/api", async () => {
  const real = await vi.importActual<typeof import("~lib/api")>("~lib/api")
  return {
    ...real,
    listarCampanhasSalvas: vi.fn(async () => null),
    salvarCampanha: vi.fn(),
    apagarCampanha: vi.fn(async () => "apagada" as const)
  }
})

import { listarCampanhasSalvas, salvarCampanha } from "~lib/api"

const mockSalvar = vi.mocked(salvarCampanha)
const mockListar = vi.mocked(listarCampanhasSalvas)

function vm(over: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1001,
    name: "Campanha Pendente",
    platform: "Meta Ads",
    status: "GREEN",
    score: 80,
    invest: 100,
    revenue: 300,
    roasNum: 3,
    cpaNum: 40,
    ctrNum: 1.5,
    freqNum: 1.5,
    m1: { k: "CPA", v: "R$ 40" },
    m2: { k: "ROAS", v: "3x" },
    spark: [1, 2, 3],
    trend: 5,
    ai: "ok",
    summary: "",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    // Sem serverId: é exatamente o que o laço de sincronização varre.
    ...over
  } as CampaignVM
}

function semear(campanhas: CampaignVM[]) {
  localStorage.setItem("nex:live", JSON.stringify(campanhas))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  // `[]` = "servidor respondeu, sem campanhas dele" — é o que dispara o
  // merge (`mesclarComServidor`) e, com ele, o laço de sincronização dos
  // pendentes. `null` (o default do mock) significa "não deu pra falar com o
  // servidor", e nesse caso o efeito de sincronização em `App.tsx` retorna
  // ANTES de chegar no laço — testar o laço exige simular sucesso aqui.
  mockListar.mockResolvedValue([])
})

afterEach(cleanup)

describe("laço de sincronização — achado A3 (auditoria de rede, 2026-09-03)", () => {
  it("sucesso: reancora com o serverId devolvido", async () => {
    semear([vm()])
    mockSalvar.mockResolvedValue({ ok: true, id: 42 })

    render(<App />)

    await waitFor(() => {
      const [salva] = loadLive()
      expect(salva.serverId).toBe(42)
    })
  })

  it("falha PERMANENTE (413): marca a campanha e NÃO fica em loop tentando de novo", async () => {
    semear([vm()])
    mockSalvar.mockResolvedValue({
      ok: false,
      permanente: true,
      explicacao: "Campanha grande demais para o servidor aceitar."
    })

    render(<App />)

    await waitFor(() => {
      const [salva] = loadLive()
      expect(salva.syncFalhouPermanente).toBe("Campanha grande demais para o servidor aceitar.")
    })
    // O card mostra o motivo — não fica em silêncio (o próprio achado A3).
    expect(await screen.findByText(/não sincronizada/i)).toBeInTheDocument()
    expect(mockSalvar).toHaveBeenCalledTimes(1)
  })

  // Revisão do Opus (2026-09-04), achado R1: a primeira versão desta
  // correção tratava 507 (base cheia) igual a 413 — permanente. Errado: é
  // estado do SERVIDOR, não desta campanha específica. Provado ao vivo:
  // liberar espaço no servidor faz a MESMA campanha, sem mudar nada, passar
  // a caber — mas `syncFalhouPermanente` já tinha tirado ela do laço pra
  // sempre. Este teste finge duas aberturas (`rerender` não recria o
  // efeito; usamos `unmount`+`render` de novo) pra provar a recuperação.
  it("507 (base cheia): mostra aviso mas CONTINUA no laço — some ao dar certo", async () => {
    semear([vm()])
    mockSalvar.mockResolvedValueOnce({
      ok: false,
      permanente: false,
      aviso: "A base do servidor está cheia — fale com quem administra."
    })

    const primeira = render(<App />)
    await waitFor(() => {
      const [salva] = loadLive()
      expect(salva.syncAviso).toBe("A base do servidor está cheia — fale com quem administra.")
    })
    expect(screen.getByText(/ainda não sincronizada/i)).toBeInTheDocument()
    expect(loadLive()[0].syncFalhouPermanente).toBeUndefined() // não foi bloqueada
    primeira.unmount()

    // "Próxima abertura", agora com espaço liberado no servidor.
    mockSalvar.mockResolvedValueOnce({ ok: true, id: 77 })
    render(<App />)

    await waitFor(() => expect(loadLive()[0].serverId).toBe(77))
    expect(mockSalvar).toHaveBeenCalledTimes(2) // foi retentada — não travou
    expect(loadLive()[0].syncAviso).toBeUndefined() // aviso não persiste após sucesso
    expect(screen.queryByText(/sincronizada/i)).not.toBeInTheDocument()
  })

  it("falha TRANSITÓRIA: não marca nada — permanece pendente pra próxima abertura", async () => {
    semear([vm()])
    mockSalvar.mockResolvedValue({ ok: false, permanente: false })

    render(<App />)

    await waitFor(() => expect(mockSalvar).toHaveBeenCalledTimes(1))
    const [ainda] = loadLive()
    expect(ainda.serverId).toBeUndefined()
    expect(ainda.syncFalhouPermanente).toBeUndefined()
    expect(screen.queryByText(/não sincronizada/i)).not.toBeInTheDocument()
  })

  it("uma campanha já marcada como falha permanente NÃO é retentada na abertura seguinte", async () => {
    semear([vm({ syncFalhouPermanente: "Campanha grande demais para o servidor aceitar." })])

    render(<App />)

    // Dá tempo do efeito rodar; se o laço ignorasse o filtro, salvarCampanha
    // seria chamado mesmo assim.
    await waitFor(() => expect(screen.getByText("Campanha Pendente")).toBeInTheDocument())
    expect(mockSalvar).not.toHaveBeenCalled()
  })
})

describe("client_id — achado A4 (auditoria de rede, 2026-09-03)", () => {
  it("gera e PERSISTE um client_id antes de tentar salvar", async () => {
    semear([vm()])
    mockSalvar.mockResolvedValue({ ok: false, permanente: false })

    render(<App />)

    await waitFor(() => expect(mockSalvar).toHaveBeenCalledTimes(1))
    const enviado = mockSalvar.mock.calls[0][0]
    expect(enviado.clientId).toMatch(/^[0-9a-f-]{36}$/i)

    const [persistida] = loadLive()
    expect(persistida.clientId).toBe(enviado.clientId)
  })
})
