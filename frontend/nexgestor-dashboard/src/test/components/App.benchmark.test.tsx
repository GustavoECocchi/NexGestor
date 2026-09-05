import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { App } from "~components/App"
import { loadLive } from "~lib/store"
import type { CampaignAnalysisResponse, ResultadoBenchmark } from "~types"

/**
 * Integração ponta a ponta do enriquecimento de benchmark de mercado
 * (fase-2b), pós-revisão Opus (2026-09-04): a lacuna que a revisão apontou é
 * que só existiam testes isolados de `adapt.ts` (transformação pura) e
 * markup fabricado de `MetricFeed` — nada exercitava o fluxo real
 * `Analisar → /campaign/analyze → onAnalyzed → /status → /benchmark/mercado
 * → aplicarBenchmarkNaLive → tela`. Foi exatamente esse fluxo que escondia 3
 * dos achados da revisão (espera bloqueante, resposta malformada derrubando
 * a análise, e status ignorado).
 */

vi.mock("~lib/api", async () => {
  const real = await vi.importActual<typeof import("~lib/api")>("~lib/api")
  return {
    ...real,
    listarCampanhasSalvas: vi.fn(async () => null),
    salvarCampanha: vi.fn(async () => ({ ok: true, id: 42 })),
    analyzeCampaign: vi.fn(),
    buscarStatus: vi.fn(),
    buscarBenchmarkMercado: vi.fn()
  }
})

import { analyzeCampaign, buscarBenchmarkMercado, buscarStatus } from "~lib/api"

const mockAnalyze = vi.mocked(analyzeCampaign)
const mockStatus = vi.mocked(buscarStatus)
const mockBenchmark = vi.mocked(buscarBenchmarkMercado)

const RESPOSTA_OK: CampaignAnalysisResponse = {
  campaign_id: 1,
  campaign_name: "Campanha X",
  final_status: "GREEN",
  overall_score: 80,
  score_coverage: 90,
  score_confidence: "high",
  summary: "resumo",
  scenarios: [],
  // CTR Link sem target (min_ctr_link) => origem "sistema" no adapter =>
  // elegível pra benchmark.
  metric_evaluations: [
    { metric: "CTR Link", value: 1.2, status: "YELLOW", score: 70, note: "Meta: >1.5%. ⚠ abaixo do esperado." }
  ],
  primary_action: "ação",
  ai_insights: null
}

const STATUS_DISPONIVEL = {
  ai: { enabled: false, available: false, model: "x" },
  persistence: { enabled: true },
  benchmark: { enabled: true, available: true }
}

/** Abre o modal, preenche o mínimo (nome, nicho, 1 métrica) e clica em Analisar. */
async function criarCampanha() {
  fireEvent.click(screen.getAllByText("Nova campanha")[0])
  fireEvent.change(await screen.findByPlaceholderText(/Black Friday/), { target: { value: "Campanha X" } })

  const selects = [...document.querySelectorAll("select")]
  const nicho = selects.find((s) => [...s.options].some((o) => o.value === "pet"))!
  fireEvent.change(nicho, { target: { value: "pet" } })

  const ctrInput = [...document.querySelectorAll(".fld")]
    .find((f) => f.querySelector("label")?.textContent?.includes("CTR link"))
    ?.querySelector("input")
  fireEvent.change(ctrInput!, { target: { value: "1,2" } })

  fireEvent.click(screen.getByText("Analisar campanha"))
  // Drena as continuações assíncronas DENTRO de act: sem isto, o
  // `setStep` que roda depois do await de `analyzeCampaign` atualiza o
  // modal fora de act e o React avisa (a coordenação do teste é que
  // estava errada, não o componente).
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  mockAnalyze.mockResolvedValue(RESPOSTA_OK)
})

afterEach(cleanup)

describe("benchmark de mercado — entrega imediata, nunca bloqueia a análise", () => {
  it("análise aparece na tela ANTES do benchmark resolver (benchmark lento)", async () => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    let liberar: (v: ResultadoBenchmark[] | null) => void = () => {}
    mockBenchmark.mockReturnValue(new Promise((res) => { liberar = res }))

    render(<App />)
    await criarCampanha()

    // A campanha já está na tela — não esperou o benchmark.
    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(screen.queryByText(/Referência informativa de mercado/)).not.toBeInTheDocument()

    liberar([{ metric: "ctr_link", encontrado: true, value: 1.5, fonte: "WordStream", fonte_url: "https://wordstream.example/x", capturado_em: "2026-09-05T00:00:00Z" }])
    await waitFor(() => expect(screen.getByText(/Referência informativa de mercado/)).toBeInTheDocument())
  })

  it("resposta {resultados:[null]} (malformada) não derruba a análise já entregue", async () => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    // `buscarBenchmarkMercado` real já validaria isso e devolveria null — o
    // mock aqui simula exatamente esse contrato (null = "sem referência").
    mockBenchmark.mockResolvedValue(null)

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Referência informativa de mercado/)).not.toBeInTheDocument()
  })

  it.each([
    ["404 (backend antigo)", null],
    ["503 (indisponível)", null],
    ["timeout", null]
  ])("%s no benchmark não vira erro da análise principal", async (_rotulo, valor) => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    mockBenchmark.mockResolvedValue(valor)

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
  })

  it("exceção inesperada dentro do enriquecimento não aparece pro usuário", async () => {
    mockStatus.mockRejectedValue(new Error("boom"))

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
    expect(mockBenchmark).not.toHaveBeenCalled()
  })
})

describe("benchmark de mercado — status controla a chamada", () => {
  it("status.benchmark ausente (backend antigo) nunca chama a rota de benchmark", async () => {
    mockStatus.mockResolvedValue({ ai: { enabled: false, available: false, model: "x" }, persistence: { enabled: true } })

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(mockBenchmark).not.toHaveBeenCalled()
  })

  it("status.benchmark.available=false (desligado/sem IA/sem cache) nunca chama a rota", async () => {
    mockStatus.mockResolvedValue({ ...STATUS_DISPONIVEL, benchmark: { enabled: true, available: false } })

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(mockBenchmark).not.toHaveBeenCalled()
  })

  it("status indisponível (null, servidor fora do ar) nunca chama a rota", async () => {
    mockStatus.mockResolvedValue(null)

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
    expect(mockBenchmark).not.toHaveBeenCalled()
  })

  it("status.benchmark.available=true chama a rota com a métrica elegível", async () => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    mockBenchmark.mockResolvedValue(null)

    render(<App />)
    await criarCampanha()

    await waitFor(() => expect(mockBenchmark).toHaveBeenCalledTimes(1))
    expect(mockBenchmark.mock.calls[0][0]).toMatchObject({ niche: "pet", metrics: ["ctr_link"] })
  })
})

describe("benchmark de mercado — semântica visual honesta", () => {
  it("referência válida aparece com link seguro, sem tocar valor/score/status do tile", async () => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    mockBenchmark.mockResolvedValue([
      { metric: "ctr_link", encontrado: true, value: 1.8, fonte: "WordStream 2025", fonte_url: "https://wordstream.example/relatorio", capturado_em: "2026-09-05T00:00:00Z" }
    ])

    render(<App />)
    await criarCampanha()

    const link = await screen.findByRole("link", { name: /WordStream 2025/ })
    expect(link).toHaveAttribute("href", "https://wordstream.example/relatorio")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link.getAttribute("rel")).toContain("noopener")

    // O valor exibido do TILE continua o medido (1,2%), não o do benchmark (1,8%).
    expect(screen.getByText("1,2%")).toBeInTheDocument()

    // Persistiu no localStorage também (não é só estado React efêmero).
    await waitFor(() => {
      const [salva] = loadLive()
      expect(salva.benchmarks?.[0]?.fonte_url).toBe("https://wordstream.example/relatorio")
    })
  })

  it("campanha apagada antes do benchmark resolver não recebe atualização tardia (não ressuscita)", async () => {
    mockStatus.mockResolvedValue(STATUS_DISPONIVEL)
    let liberar: (v: ResultadoBenchmark[] | null) => void = () => {}
    mockBenchmark.mockReturnValue(new Promise((res) => { liberar = res }))

    render(<App />)
    await criarCampanha()
    await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())

    // Apaga a campanha ANTES do benchmark resolver.
    localStorage.setItem("nex:live", "[]")

    await act(async () => {
      liberar([{ metric: "ctr_link", encontrado: true, value: 1.8, fonte: "F", fonte_url: "https://x.example", capturado_em: "2026-09-05T00:00:00Z" }])
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(loadLive()).toEqual([]) // continua vazia — nada foi ressuscitado
  })
})
