import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { App } from "~components/App"
import { COPILOT_ANCHOR_ID, COPILOT_INPUT_ID } from "~components/Copilot"
import type { CampaignVM } from "~types"

/**
 * Fase 2 — navegação, Central de Ajuda e presença do Copiloto.
 * PRD: `docs/prds/fase-2-dashboard-intuitividade.md` (AC1, AC3, AC4, AC5).
 *
 * Os critérios de aceite da fase-2 são sobre uma pessoa leiga encontrando o
 * caminho, e isso quem mede é o teste manual descrito no §8 do PRD. O que dá
 * para garantir automaticamente — e é o que está aqui — é que o caminho existe,
 * que ele custa um clique a partir de qualquer tela, e que as distinções que o
 * PRD exige (Copiloto × selo de IA; ajuda de fluxo × ajuda de campo) não se
 * perdem numa edição futura.
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
    summary: "Tudo certo.",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    serverId: 1,
    ...over
  } as CampaignVM
}

const sidebar = () => screen.getByRole("navigation", { name: /navegação principal/i })
const itemSidebar = (nome: RegExp) => within(sidebar()).getByRole("button", { name: nome })

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterEach(cleanup)

describe("AC1/AC5 — a sidebar leva a criar campanha e à Ajuda", () => {
  it("mostra os três destinos, com 'Campanhas' ativo por padrão", () => {
    render(<App />)
    expect(itemSidebar(/nova campanha/i)).toBeInTheDocument()
    expect(itemSidebar(/^campanhas$/i)).toHaveAttribute("aria-current", "page")
    expect(itemSidebar(/^ajuda$/i)).not.toHaveAttribute("aria-current")
  })

  it("abre a Central de Ajuda em UM clique, e o cabeçalho acompanha", () => {
    render(<App />)
    fireEvent.click(itemSidebar(/^ajuda$/i))

    expect(screen.getByText(/como usar o nexgestor/i)).toBeInTheDocument()
    expect(itemSidebar(/^ajuda$/i)).toHaveAttribute("aria-current", "page")
    expect(itemSidebar(/^campanhas$/i)).not.toHaveAttribute("aria-current")
  })

  it("abre o formulário de nova campanha em UM clique, de qualquer tela", () => {
    render(<App />)
    // A partir da Ajuda — o pior caso, porque não é a tela que tem o botão.
    fireEvent.click(itemSidebar(/^ajuda$/i))
    fireEvent.click(itemSidebar(/nova campanha/i))

    expect(screen.getByText(/criar nova campanha/i)).toBeInTheDocument()
  })

  /**
   * "Nova campanha" abre um modal e volta para onde a pessoa estava. Se ela
   * também trocasse de tela, quem estivesse lendo a Ajuda perderia o lugar por
   * ter clicado num item de menu — e ao fechar o modal cairia na Home sem ter
   * pedido isso.
   */
  it("não tira a pessoa da tela em que ela estava", () => {
    render(<App />)
    fireEvent.click(itemSidebar(/^ajuda$/i))
    fireEvent.click(itemSidebar(/nova campanha/i))

    expect(itemSidebar(/^ajuda$/i)).toHaveAttribute("aria-current", "page")
  })

  it("volta para as campanhas pela sidebar", () => {
    localStorage.setItem("nex:live", JSON.stringify([vm()]))
    render(<App />)
    fireEvent.click(itemSidebar(/^ajuda$/i))
    fireEvent.click(itemSidebar(/^campanhas$/i))

    expect(screen.getByText("Campanha Viva")).toBeInTheDocument()
    expect(screen.queryByText(/como usar o nexgestor/i)).not.toBeInTheDocument()
  })

  it("reabre na Ajuda se foi onde a pessoa parou", () => {
    render(<App />)
    fireEvent.click(itemSidebar(/^ajuda$/i))
    cleanup()

    render(<App />)
    expect(screen.getByText(/como usar o nexgestor/i)).toBeInTheDocument()
  })
})

describe("AC5 — a Central de Ajuda responde às quatro perguntas", () => {
  beforeEach(() => {
    render(<App />)
    fireEvent.click(itemSidebar(/^ajuda$/i))
  })

  it("tem um bloco para cada pergunta da equipe", () => {
    expect(screen.getByRole("heading", { name: /como eu crio uma campanha/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /como eu vejo a análise/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /como eu apago uma campanha/i })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /como eu uso a ia/i })).toBeInTheDocument()
  })

  // AC3: a entrada dedicada a apagar precisa citar a consequência real, não um
  // "tem certeza?" genérico — a base é compartilhada por identificação.
  it("avisa que apagar atinge todo o time e não tem volta", () => {
    expect(screen.getByText(/apagar para todo o time/i)).toBeInTheDocument()
    expect(screen.getByText(/não dá para desfazer/i)).toBeInTheDocument()
  })

  it("leva do texto direto para a ação, sem procurar o botão", () => {
    fireEvent.click(screen.getByRole("button", { name: /criar uma campanha agora/i }))
    expect(screen.getByText(/criar nova campanha/i)).toBeInTheDocument()
  })

  /**
   * AC4, o achado da auditoria de 2026-08-26: o selo do cabeçalho responde "o
   * servidor tem IA?" e o Copiloto responde "o que houve com esta campanha?".
   * Se a Ajuda tratar os dois como a mesma coisa, quem ler vai procurar o
   * assistente no cabeçalho e não achar.
   */
  it("separa o Copiloto do selo de estado da IA", () => {
    expect(screen.getByText(/não confunda com o selo/i)).toBeInTheDocument()
    expect(screen.getByText(/perguntar ao copiloto/i)).toBeInTheDocument()
  })

  /**
   * A fronteira editorial com a fase-1 (§"Sobreposições a resolver" do PRD).
   * O significado das métricas é explicado pelo `?` de cada campo do
   * formulário; se esta tela começar a explicá-las também, passam a existir
   * duas respostas para "o que é CPA" e elas vão divergir na primeira edição
   * que tocar só uma das duas.
   */
  it("aponta para a ajuda dos campos em vez de explicar as métricas de novo", () => {
    const ajuda = screen.getByText(/como usar o nexgestor/i).closest("div.scroll")!
    expect(ajuda.textContent).toMatch(/ícone “\?” ao lado do nome/i)
    expect(ajuda.textContent).not.toMatch(/\bCPA\b|\bROAS\b|\bCPM\b|hook rate/i)
  })
})

describe("AC4 — o Copiloto é alcançável sem rolar o detalhe", () => {
  function abrirDetalhe() {
    localStorage.setItem("nex:live", JSON.stringify([vm()]))
    render(<App />)
    fireEvent.click(screen.getByText("Campanha Viva"))
  }

  it("oferece o atalho no topo, junto do nome da campanha", () => {
    abrirDetalhe()
    expect(screen.getByRole("button", { name: /perguntar ao copiloto/i })).toBeInTheDocument()
  })

  it("rola até o Copiloto e já deixa o campo pronto para digitar", () => {
    abrirDetalhe()
    const rolou = vi.spyOn(Element.prototype, "scrollIntoView")

    fireEvent.click(screen.getByRole("button", { name: /perguntar ao copiloto/i }))

    expect(rolou).toHaveBeenCalled()
    expect(document.activeElement).toBe(document.getElementById(COPILOT_INPUT_ID))
    rolou.mockRestore()
  })

  /**
   * O foco precisa vir ANTES da rolagem e com `preventScroll`. Focar um
   * elemento fora da tela faz o navegador saltar até ele na hora, e o salto
   * cancela a rolagem suave — a pessoa chegaria ao Copiloto sem a transição
   * que mostra que a página se moveu.
   */
  it("foca sem deixar o navegador saltar por conta própria", () => {
    abrirDetalhe()
    const campo = document.getElementById(COPILOT_INPUT_ID) as HTMLInputElement
    const focou = vi.spyOn(campo, "focus")

    fireEvent.click(screen.getByRole("button", { name: /perguntar ao copiloto/i }))

    expect(focou).toHaveBeenCalledWith({ preventScroll: true })
    focou.mockRestore()
  })

  it("mantém a âncora que o atalho procura", () => {
    abrirDetalhe()
    expect(document.getElementById(COPILOT_ANCHOR_ID)).not.toBeNull()
  })
})
