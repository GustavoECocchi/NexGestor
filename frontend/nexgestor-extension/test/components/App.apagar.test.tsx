import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { App } from "~components/App"
import { loadLive } from "~lib/store"
import type { CampaignVM } from "~types"

/**
 * Apagar campanha, ponta a ponta na árvore de componentes.
 *
 * Aqui moram os erros que teste de unidade não pega: fiação errada entre
 * App/Home/Card, e corridas entre a sincronização e o apagar.
 */

vi.mock("~lib/api", async () => {
  const real = await vi.importActual<typeof import("~lib/api")>("~lib/api")
  return {
    ...real,
    listarCampanhasSalvas: vi.fn(async () => null),
    salvarCampanha: vi.fn(async () => null),
    apagarCampanha: vi.fn(async () => "apagada" as const)
  }
})

import { apagarCampanha, listarCampanhasSalvas } from "~lib/api"

const mockListar = vi.mocked(listarCampanhasSalvas)
const mockApagar = vi.mocked(apagarCampanha)

function vm(over: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1001,
    name: "Campanha Viva",
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
    serverId: 1,
    ...over
  } as CampaignVM
}

function semear(campanhas: CampaignVM[]) {
  localStorage.setItem("nex:live", JSON.stringify(campanhas))
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockListar.mockResolvedValue(null)
  mockApagar.mockResolvedValue("apagada")
})

afterEach(cleanup)

const lixeira = (nome = "Campanha Viva") =>
  screen.getByRole("button", { name: `Apagar campanha ${nome}` })
const confirmar = () => fireEvent.click(screen.getByRole("button", { name: /^apagar$/i }))

describe("apagar pela Home", () => {
  it("some da tela e do armazenamento local, e avisa o servidor", async () => {
    semear([vm()])
    render(<App />)

    fireEvent.click(lixeira())
    confirmar()

    await waitFor(() => expect(screen.queryByText("Campanha Viva")).toBeNull())
    expect(mockApagar).toHaveBeenCalledWith(1)
    expect(loadLive()).toEqual([])
  })

  it("campanha que só existe aqui é apagada SEM chamar o servidor", async () => {
    semear([vm({ serverId: undefined, name: "Feita offline" })])
    render(<App />)

    fireEvent.click(lixeira("Feita offline"))
    confirmar()

    await waitFor(() => expect(screen.queryByText("Feita offline")).toBeNull())
    expect(mockApagar).not.toHaveBeenCalled()
  })

  it("404 (outra pessoa já apagou) é tratado como sucesso", async () => {
    mockApagar.mockResolvedValue("sumiu")
    semear([vm()])
    render(<App />)

    fireEvent.click(lixeira())
    confirmar()

    await waitFor(() => expect(screen.queryByText("Campanha Viva")).toBeNull())
  })

  it("servidor fora do ar: a campanha CONTINUA na tela e no armazenamento", async () => {
    mockApagar.mockResolvedValue("falhou")
    semear([vm()])
    render(<App />)

    fireEvent.click(lixeira())
    confirmar()

    // Sumir daqui e continuar no servidor faria a campanha ressuscitar na
    // próxima abertura — pior que uma mensagem de erro honesta.
    expect(await screen.findByText(/não foi possível apagar/i)).toBeTruthy()
    expect(screen.getByText("Campanha Viva")).toBeTruthy()
    expect(loadLive()).toHaveLength(1)
  })

  it("apaga só a campanha escolhida", async () => {
    semear([vm(), vm({ id: 1002, serverId: 2, name: "A Outra" })])
    render(<App />)

    fireEvent.click(lixeira("A Outra"))
    confirmar()

    await waitFor(() => expect(screen.queryByText("A Outra")).toBeNull())
    expect(screen.getByText("Campanha Viva")).toBeTruthy()
    expect(loadLive().map((c) => c.name)).toEqual(["Campanha Viva"])
  })

  it("campanhas de exemplo não têm lixeira", () => {
    semear([])
    render(<App />)

    // O mock traz 2 exemplos; nenhum pode ser apagável.
    expect(screen.queryAllByRole("button", { name: /^apagar campanha/i })).toHaveLength(0)
  })
})

describe("corrida entre sincronizar e apagar", () => {
  it("a sincronização em voo NÃO ressuscita a campanha apagada", async () => {
    // Cenário real: o GET parte na abertura, o usuário apaga antes de a
    // resposta chegar, e a resposta ainda traz a campanha.
    let entregarLista: (v: CampaignVM[] | null) => void = () => {}
    mockListar.mockReturnValue(
      new Promise<CampaignVM[] | null>((r) => (entregarLista = r))
    )

    semear([vm()])
    render(<App />)

    fireEvent.click(lixeira())
    confirmar()
    await waitFor(() => expect(screen.queryByText("Campanha Viva")).toBeNull())

    // Só agora a listagem (antiga) chega, ainda com a campanha.
    entregarLista([vm()])

    await waitFor(() => expect(mockApagar).toHaveBeenCalled())
    expect(screen.queryByText("Campanha Viva")).toBeNull()
    expect(loadLive().map((c) => c.name)).not.toContain("Campanha Viva")
  })

  it("uma campanha diferente que chega na mesma listagem continua aparecendo", async () => {
    let entregarLista: (v: CampaignVM[] | null) => void = () => {}
    mockListar.mockReturnValue(
      new Promise<CampaignVM[] | null>((r) => (entregarLista = r))
    )

    semear([vm()])
    render(<App />)

    fireEvent.click(lixeira())
    confirmar()
    await waitFor(() => expect(screen.queryByText("Campanha Viva")).toBeNull())

    entregarLista([vm(), vm({ id: 1009, serverId: 9, name: "Do Colega" })])

    expect(await screen.findByText("Do Colega")).toBeTruthy()
    expect(screen.queryByText("Campanha Viva")).toBeNull()
  })
})
