import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, analyzeCampaign, isApiError } from "~lib/api"
import type { AnalyzeInput } from "~types"

const input: AnalyzeInput = {
  campaign: { id: 1, name: "teste" },
  metrics: { spend: 100, conversions: 2 },
  targets: {}
} as AnalyzeInput

/** Response mínima o bastante para o caminho feliz. */
function resposta(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("analyzeCampaign — caminho feliz", () => {
  it("devolve o corpo já parseado", async () => {
    fetchMock.mockResolvedValue(resposta(200, { overall_score: 72 }))
    await expect(analyzeCampaign(input)).resolves.toEqual({ overall_score: 72 })
  })

  it("chama a rota certa, com POST e JSON", async () => {
    fetchMock.mockResolvedValue(resposta(200))
    await analyzeCampaign(input)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/campaign\/analyze$/)
    expect(init.method).toBe("POST")
    expect(init.headers["Content-Type"]).toBe("application/json")
    expect(JSON.parse(init.body)).toEqual(input)
    // Sem signal não existe timeout — o fetch penduraria para sempre.
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe("analyzeCampaign — respostas de erro do servidor", () => {
  it("429 vira mensagem de servidor ocupado, não de falha da análise", async () => {
    fetchMock.mockResolvedValue(resposta(429))
    await expect(analyzeCampaign(input)).rejects.toThrow(/muitas análises/i)
  })

  it("503 recebe o mesmo tratamento (nginx sem limit_req_status responde 503)", async () => {
    fetchMock.mockResolvedValue(resposta(503))
    await expect(analyzeCampaign(input)).rejects.toThrow(/muitas análises/i)
  })

  it("502/504 dizem que o servidor está fora do ar, não que os dados falharam", async () => {
    for (const status of [502, 504]) {
      fetchMock.mockResolvedValue(resposta(status))
      await expect(analyzeCampaign(input)).rejects.toThrow(/fora do ar/i)
    }
  })

  it("429, 503, 502 e 504 são erros de texto pronto para o usuário", async () => {
    for (const status of [429, 503, 502, 504]) {
      fetchMock.mockResolvedValue(resposta(status))
      const err = await analyzeCampaign(input).catch((e) => e)
      expect(isApiError(err), `status ${status}`).toBe(true)
    }
  })

  it("erro inesperado (500) NÃO vira texto pronto — a UI precisa mostrar o código", async () => {
    fetchMock.mockResolvedValue(resposta(500))
    const err = await analyzeCampaign(input).catch((e) => e)
    expect(isApiError(err)).toBe(false)
    expect(err.message).toContain("500")
  })
})

describe("analyzeCampaign — timeout", () => {
  it("aborta quando o servidor aceita a conexão e nunca responde", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          )
        })
    )

    const p = analyzeCampaign(input).catch((e) => e)
    await vi.advanceTimersByTimeAsync(30_000)
    const err = await p

    expect(isApiError(err)).toBe(true)
    expect(err.message).toMatch(/não respondeu em 30s/i)
  })

  it("aborta também quando trava LENDO O CORPO, não só nos cabeçalhos", async () => {
    // Caso real atrás de proxy: os cabeçalhos chegam rápido (200) e o corpo
    // nunca termina. Se o timeout for cancelado antes de ler o corpo, a tela
    // fica em "analisando" para sempre — exatamente o que ele existe para evitar.
    vi.useFakeTimers()
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          )
        })
    }))

    const p = analyzeCampaign(input).catch((e) => e)
    await vi.advanceTimersByTimeAsync(30_000)
    const err = await p

    expect(isApiError(err)).toBe(true)
    expect(err.message).toMatch(/não respondeu em 30s/i)
  })

  it("cancela o timer quando a resposta chega — nada fica pendente", async () => {
    vi.useFakeTimers()
    const clear = vi.spyOn(globalThis, "clearTimeout")
    fetchMock.mockResolvedValue(resposta(200))

    await analyzeCampaign(input)

    expect(clear).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    clear.mockRestore()
  })

  it("cancela o timer mesmo quando o servidor devolve erro", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(resposta(429))

    await analyzeCampaign(input).catch(() => {})

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe("analyzeCampaign — falha de rede", () => {
  it("propaga o erro original do fetch (a UI o traduz)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    const err = await analyzeCampaign(input).catch((e) => e)

    // Não pode virar ApiError: a mensagem crua é o que a UI usa para
    // reconhecer "sem rede" e dar a instrução certa por tipo de build.
    expect(isApiError(err)).toBe(false)
    expect(err.message).toContain("Failed to fetch")
  })
})

describe("isApiError", () => {
  it("reconhece ApiError", () => {
    expect(isApiError(new ApiError("oi"))).toBe(true)
  })

  it("não confunde com Error comum, nem com valores soltos", () => {
    expect(isApiError(new Error("oi"))).toBe(false)
    expect(isApiError(new TypeError("Failed to fetch"))).toBe(false)
    expect(isApiError("texto")).toBe(false)
    expect(isApiError(null)).toBe(false)
    expect(isApiError({ userFacing: true })).toBe(false)
  })
})
