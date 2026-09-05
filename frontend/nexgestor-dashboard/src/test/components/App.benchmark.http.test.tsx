import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { App } from "~components/App"
import { loadLive } from "~lib/store"

/**
 * Integração na FRONTEIRA HTTP — `fetch` é o único mock.
 *
 * Achado da revisão Opus de 2026-09-05: `App.benchmark.test.tsx` mocka
 * `~lib/api` inteiro, inclusive a validação que ele mesmo deveria exercitar.
 * O caso "{resultados:[null]}" só devolvia `null` do mock — nunca provava que
 * o parsing/validação real transformam aquilo em fallback seguro. Aqui o
 * corpo cru trafega de verdade: JSON inválido, HTML, tipos incoerentes e
 * status HTTP passam pelo `fetch` real do `lib/api.ts`.
 */

const ANALISE = {
  campaign_id: 1, campaign_name: "Campanha X", final_status: "GREEN",
  overall_score: 80, score_coverage: 90, score_confidence: "high",
  summary: "resumo", scenarios: [],
  // CTR Link sem `min_ctr_link` => origem "sistema" => elegível a benchmark.
  metric_evaluations: [
    { metric: "CTR Link", value: 1.2, status: "YELLOW", score: 70, note: "Meta: >1.5%. ⚠ abaixo." }
  ],
  primary_action: "ação", ai_insights: null
}

const STATUS_OK = {
  ai: { enabled: false, available: false, model: "x" },
  persistence: { enabled: true },
  benchmark: { enabled: true, available: true }
}

const REF_VALIDA = {
  metric: "ctr_link", encontrado: true, value: 1.8, fonte: "WordStream 2025",
  fonte_url: "https://wordstream.example/relatorio", capturado_em: "2026-09-05T00:00:00Z"
}

type Corpo = { status?: number; json?: unknown; texto?: string; demora?: Promise<unknown> }

/** Roteia por URL; cada rota devolve corpo CRU (o `lib/api.ts` que valide). */
function instalarFetch(rotas: {
  status?: Corpo
  analyze?: Corpo
  benchmark?: Corpo
  campaigns?: Corpo
}) {
  const chamadas: string[] = []
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url)
    chamadas.push(`${init?.method ?? "GET"} ${u.split("/api/v1")[1] ?? u}`)
    const rota =
      u.includes("/campaign/analyze") ? rotas.analyze
      : u.includes("/benchmark/mercado") ? rotas.benchmark
      : u.includes("/status") ? rotas.status
      : rotas.campaigns
    if (!rota) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    if (rota.demora) await rota.demora
    const status = rota.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (rota.texto !== undefined) return JSON.parse(rota.texto) // pode lançar de propósito
        return rota.json
      }
    } as unknown as Response
  }))
  return chamadas
}

async function criarCampanha() {
  fireEvent.click(screen.getAllByText("Nova campanha")[0])
  fireEvent.change(await screen.findByPlaceholderText(/Black Friday/), { target: { value: "Campanha X" } })
  const nicho = [...document.querySelectorAll("select")]
    .find((s) => [...s.options].some((o) => o.value === "pet"))!
  fireEvent.change(nicho, { target: { value: "pet" } })
  const ctr = [...document.querySelectorAll(".fld")]
    .find((f) => f.querySelector("label")?.textContent?.includes("CTR link"))
    ?.querySelector("input")
  fireEvent.change(ctr!, { target: { value: "1,2" } })
  fireEvent.click(screen.getByText("Analisar campanha"))
  // Drena as continuações assíncronas dentro de act — ver nota no
  // arquivo irmão `App.benchmark.test.tsx`.
  await act(async () => { await Promise.resolve() })
}

/** A campanha aparecendo é o sinal de que o fluxo principal terminou. */
async function esperarAnalisePronta() {
  await waitFor(() => expect(screen.getByText("Campanha X")).toBeInTheDocument())
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem("nex:dono", "revisao")
  vi.clearAllMocks()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("HTTP real — corpo malformado do benchmark nunca derruba a análise", () => {
  const CORPOS_RUINS: [string, Corpo][] = [
    ["item null", { json: { resultados: [null] } }],
    ["resultados não-array", { json: { resultados: "nada" } }],
    ["objeto sem resultados", { json: { outra: 1 } }],
    ["HTML de proxy", { texto: "<html>502</html>" }],
    ["JSON inválido", { texto: "{ isso não é json" }],
    ["value string", { json: { resultados: [{ ...REF_VALIDA, value: "1.8" }] } }],
    ["value fora da faixa", { json: { resultados: [{ ...REF_VALIDA, value: 999 }] } }],
    ["url sem host", { json: { resultados: [{ ...REF_VALIDA, fonte_url: "https://" }] } }],
    ["url javascript:", { json: { resultados: [{ ...REF_VALIDA, fonte_url: "javascript:alert(1)" }] } }],
    ["fonte só espaço", { json: { resultados: [{ ...REF_VALIDA, fonte: "   " }] } }],
    ["capturado_em inválido", { json: { resultados: [{ ...REF_VALIDA, capturado_em: "xyz" }] } }],
    ["métrica não pedida", { json: { resultados: [{ ...REF_VALIDA, metric: "cpa" }] } }],
    ["métrica duplicada", { json: { resultados: [REF_VALIDA, REF_VALIDA] } }],
    ["encontrado ausente", { json: { resultados: [{ metric: "ctr_link" }] } }],
    ["negativo sem motivo", { json: { resultados: [{ metric: "ctr_link", encontrado: false }] } }]
  ]

  it.each(CORPOS_RUINS)("%s → análise preservada, sem referência exibida", async (_r, corpo) => {
    instalarFetch({ status: { json: STATUS_OK }, analyze: { json: ANALISE }, benchmark: corpo })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()

    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Referência informativa de mercado/)).not.toBeInTheDocument()
    // A campanha foi de fato persistida — a falha não impediu o salvamento.
    await waitFor(() => expect(loadLive()).toHaveLength(1))
  })

  it.each([404, 422, 500, 501, 503])("HTTP %i no benchmark → análise preservada", async (status) => {
    instalarFetch({
      status: { json: STATUS_OK }, analyze: { json: ANALISE },
      benchmark: { status, json: { detail: "erro" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
  })

  it("rede caindo no benchmark → análise preservada", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes("/campaign/analyze")) return { ok: true, status: 200, json: async () => ANALISE } as unknown as Response
      if (u.includes("/status")) return { ok: true, status: 200, json: async () => STATUS_OK } as unknown as Response
      if (u.includes("/benchmark/")) throw new TypeError("Failed to fetch")
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
    }))
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
  })
})

describe("HTTP real — caminho feliz e persistência", () => {
  it("referência válida aparece com link seguro e é PERSISTIDA no servidor", async () => {
    const chamadas = instalarFetch({
      status: { json: STATUS_OK },
      analyze: { json: ANALISE },
      benchmark: { json: { resultados: [REF_VALIDA] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "2026-09-05T00:00:00Z" } }
    })
    render(<App />)
    await criarCampanha()

    const link = await screen.findByRole("link", { name: /WordStream 2025/ })
    expect(link).toHaveAttribute("href", "https://wordstream.example/relatorio")
    expect(link.getAttribute("rel")).toContain("noopener")

    // O tile continua mostrando o valor MEDIDO (1,2%), não o do benchmark.
    expect(screen.getByText("1,2%")).toBeInTheDocument()

    // A versão enriquecida subiu pro servidor (2 POSTs /campaigns: o inicial
    // e o do enriquecimento), com o MESMO client_id — nunca duplicando.
    await waitFor(() => {
      const posts = chamadas.filter((c) => c === "POST /campaigns")
      expect(posts.length).toBeGreaterThanOrEqual(2)
    })
    const corpos = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => String(c[0]).includes("/campaigns") && (c[1] as RequestInit)?.method === "POST")
      .map((c) => JSON.parse(String((c[1] as RequestInit).body)))
    const clientIds = new Set(corpos.map((b) => b.client_id))
    expect(clientIds.size).toBe(1) // idempotência: um client_id só
    expect(corpos.at(-1).payload.benchmarks).toHaveLength(1) // payload enriquecido
  })

  it("benchmark lento não segura a análise — ela aparece antes", async () => {
    let liberar: (v: unknown) => void = () => {}
    const travado = new Promise((res) => { liberar = res })
    instalarFetch({
      status: { json: STATUS_OK }, analyze: { json: ANALISE },
      benchmark: { demora: travado, json: { resultados: [REF_VALIDA] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "x" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    expect(screen.queryByText(/Referência informativa de mercado/)).not.toBeInTheDocument()

    liberar(null)
    await waitFor(() => expect(screen.getByText(/Referência informativa de mercado/)).toBeInTheDocument())
  })

  it("negativo explícito do servidor não exibe referência nem erro", async () => {
    instalarFetch({
      status: { json: STATUS_OK }, analyze: { json: ANALISE },
      benchmark: { json: { resultados: [{ metric: "ctr_link", encontrado: false, motivo: "busca realizada: nada", motivo_tipo: "nao_encontrado" }] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "x" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    expect(screen.queryByText(/Referência informativa de mercado/)).not.toBeInTheDocument()
    expect(screen.queryByText(/análise falhou/i)).not.toBeInTheDocument()
  })
})

describe("HTTP real — status controla a chamada", () => {
  it.each([
    ["backend antigo (sem bloco benchmark)", { ai: STATUS_OK.ai, persistence: { enabled: true } }],
    ["available=false", { ...STATUS_OK, benchmark: { enabled: true, available: false } }]
  ])("%s → nunca chama /benchmark", async (_r, statusBody) => {
    const chamadas = instalarFetch({
      status: { json: statusBody }, analyze: { json: ANALISE },
      benchmark: { json: { resultados: [REF_VALIDA] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "x" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    await waitFor(() => expect(loadLive()).toHaveLength(1))
    expect(chamadas.some((c) => c.includes("/benchmark/"))).toBe(false)
  })

  it("/status 404 (servidor antigo) → nunca chama /benchmark", async () => {
    const chamadas = instalarFetch({
      status: { status: 404, json: {} }, analyze: { json: ANALISE },
      benchmark: { json: { resultados: [REF_VALIDA] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "x" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    await waitFor(() => expect(loadLive()).toHaveLength(1))
    expect(chamadas.some((c) => c.includes("/benchmark/"))).toBe(false)
  })
})

describe("HTTP real — exclusão pela UI durante requests", () => {
  it("apagar pela Home antes do benchmark resolver não ressuscita a campanha", async () => {
    let liberar: (v: unknown) => void = () => {}
    const travado = new Promise((res) => { liberar = res })
    instalarFetch({
      status: { json: STATUS_OK }, analyze: { json: ANALISE },
      benchmark: { demora: travado, json: { resultados: [REF_VALIDA] } },
      campaigns: { json: { id: 7, payload: {}, atualizado_em: "x" } }
    })
    render(<App />)
    await criarCampanha()
    await esperarAnalisePronta()
    await waitFor(() => expect(loadLive()).toHaveLength(1))

    // Volta pra Home e apaga pela AÇÃO REAL da UI (não mexendo no
    // localStorage direto, como o teste anterior fazia).
    fireEvent.click(screen.getByText(/Voltar/i))
    // Fluxo real da UI: ícone de lixeira -> confirmação -> "Apagar".
    fireEvent.click(await screen.findByRole("button", { name: /Apagar campanha Campanha X/i }))
    fireEvent.click(await screen.findByText("Apagar"))
    await waitFor(() => expect(loadLive()).toHaveLength(0))

    await act(async () => {
      liberar(null)
      await new Promise((r) => setTimeout(r, 60))
    })
    expect(loadLive()).toHaveLength(0) // continua apagada
  })
})
