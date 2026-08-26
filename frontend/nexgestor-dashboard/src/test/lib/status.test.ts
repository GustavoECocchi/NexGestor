import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buscarStatus, estadoDaIA, type StatusServidor } from "~lib/api"

function resposta(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as unknown as Response
}

const completo: StatusServidor = {
  ai: { enabled: true, available: true, model: "gemini-flash-lite-latest" },
  persistence: { enabled: true }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

describe("buscarStatus", () => {
  it("devolve o status quando o servidor responde", async () => {
    fetchMock.mockResolvedValue(resposta(200, completo))
    await expect(buscarStatus()).resolves.toEqual(completo)
  })

  it("chama /api/v1/status", async () => {
    fetchMock.mockResolvedValue(resposta(200, completo))
    await buscarStatus()
    expect(fetchMock.mock.calls[0][0]).toContain("/api/v1/status")
  })

  it("devolve null em 404 — servidor anterior a esta rota", async () => {
    // É exatamente o caso da produção hoje: código antigo no ar, sem /status.
    fetchMock.mockResolvedValue(resposta(404))
    await expect(buscarStatus()).resolves.toBeNull()
  })

  it("devolve null quando a rede falha", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(buscarStatus()).resolves.toBeNull()
  })

  it("devolve null se o corpo não tiver o formato esperado", async () => {
    // Um proxy mal configurado devolve 200 com HTML. Aceitar isso faria o selo
    // afirmar "IA off" com base em lixo — pior que dizer que não sabe.
    fetchMock.mockResolvedValue(resposta(200, "<html>erro</html>"))
    await expect(buscarStatus()).resolves.toBeNull()
  })

  it("devolve null se `available` não for booleano", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ai: { available: "sim" } }))
    await expect(buscarStatus()).resolves.toBeNull()
  })

  it("devolve null se `ai` vier nulo", async () => {
    fetchMock.mockResolvedValue(resposta(200, { ai: null }))
    await expect(buscarStatus()).resolves.toBeNull()
  })
})

describe("estadoDaIA", () => {
  it("'on' quando a IA está disponível", () => {
    expect(estadoDaIA(completo)).toBe("on")
  })

  it("'off' quando a IA não está disponível", () => {
    expect(
      estadoDaIA({ ...completo, ai: { ...completo.ai, available: false } })
    ).toBe("off")
  })

  it("'off' mesmo com o toggle ligado, se faltar a chave", () => {
    // O estado real da produção em 25/08/2026: GEMINI_ENABLED=True, sem chave.
    // O que vale para o gestor é `available`, não o toggle.
    expect(
      estadoDaIA({
        ...completo,
        ai: { enabled: true, available: false, model: "x" }
      })
    ).toBe("off")
  })

  it("'desconhecido' quando não deu para falar com o servidor", () => {
    // Nunca "off": servidor antigo e servidor fora do ar chegam iguais aqui, e
    // afirmar "desligada" inventaria uma informação que não temos.
    expect(estadoDaIA(null)).toBe("desconhecido")
  })
})
