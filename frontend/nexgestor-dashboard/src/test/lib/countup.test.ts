// Animação de contagem dos números do detalhe da campanha (2026-07-28).
//
// O risco desta feature não é estética: é o número FINAL sair diferente do que
// seria exibido sem animação. Estes testes travam a ida e a volta do formato.

import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { formatarPtBR, parseFormatado, useContagem } from "~lib/countup"

/** Finge a preferência do SO por menos movimento. */
function comMovimentoReduzido(reduzido: boolean) {
  ;(window as unknown as { matchMedia: (q: string) => object }).matchMedia = (q: string) => ({
    matches: reduzido && q.includes("prefers-reduced-motion"),
    media: q,
    addEventListener() {},
    removeEventListener() {}
  })
}

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe("useContagem — respeita prefers-reduced-motion", () => {
  it("com movimento reduzido, mostra o valor final imediatamente", () => {
    // A armadilha documentada em 2026-07-26 (cards que sumiam ao desligar
    // animação) tem equivalente aqui: desligar a contagem sem cuidado deixaria
    // a tela inteira zerada. Tem que ser o valor FINAL, não o inicial.
    comMovimentoReduzido(true)
    const { result } = renderHook(() => useContagem(42))
    expect(result.current).toBe(42)
  })

  it("sem preferência por movimento reduzido, começa do zero", () => {
    comMovimentoReduzido(false)
    const { result } = renderHook(() => useContagem(42))
    expect(result.current).toBe(0)
  })

  it("sem matchMedia disponível, não quebra e anima normalmente", () => {
    delete (window as { matchMedia?: unknown }).matchMedia
    const { result } = renderHook(() => useContagem(42))
    expect(result.current).toBe(0)
  })
})

describe("useContagem — a contagem termina no número exato", () => {
  /** Controla o relógio de animação: nada roda até `avancar` ser chamado. */
  function relogioDeAnimacao() {
    const pendentes: FrameRequestCallback[] = []
    ;(window as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number })
      .requestAnimationFrame = (cb) => { pendentes.push(cb); return pendentes.length }
    ;(window as unknown as { cancelAnimationFrame: (id: number) => void })
      .cancelAnimationFrame = () => {}
    return (t: number) => {
      const fila = pendentes.splice(0)
      act(() => { fila.forEach((cb) => cb(t)) })
    }
  }

  it("o último quadro grava o alvo exato, não uma aproximação", () => {
    // A interpolação em ponto flutuante pode parar em 39,999…, que formatado
    // vira "R$ 39,99" e fica assim para sempre — um número errado, congelado
    // na tela, indistinguível de um dado real.
    comMovimentoReduzido(false)
    const avancar = relogioDeAnimacao()
    const { result } = renderHook(() => useContagem(40))

    avancar(0)      // primeiro quadro: marca o início
    avancar(2000)   // muito além da duração de 900ms
    expect(result.current).toBe(40)
  })

  it("no meio da animação o valor está entre 0 e o alvo", () => {
    comMovimentoReduzido(false)
    const avancar = relogioDeAnimacao()
    const { result } = renderHook(() => useContagem(100))

    avancar(0)
    avancar(300)
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(100)
  })

  it("o atraso de escalonamento segura o número em zero antes de começar", () => {
    comMovimentoReduzido(false)
    const avancar = relogioDeAnimacao()
    const { result } = renderHook(() => useContagem(100, 500))

    avancar(0)
    avancar(200)   // ainda dentro do atraso
    expect(result.current).toBe(0)
    avancar(2000)
    expect(result.current).toBe(100)
  })
})

describe("parseFormatado — desmonta o valor já formatado", () => {
  it("moeda com centavos", () => {
    expect(parseFormatado("R$ 40,00")).toEqual({
      prefixo: "R$ ", sufixo: "", valor: 40, casas: 2
    })
  })

  it("moeda com separador de milhar", () => {
    expect(parseFormatado("R$ 3.000")).toEqual({
      prefixo: "R$ ", sufixo: "", valor: 3000, casas: 0
    })
  })

  it("multiplicador de ROAS", () => {
    expect(parseFormatado("5,0x")).toEqual({
      prefixo: "", sufixo: "x", valor: 5, casas: 1
    })
  })

  it("percentual", () => {
    expect(parseFormatado("2,1%")).toEqual({
      prefixo: "", sufixo: "%", valor: 2.1, casas: 1
    })
  })

  it("número puro (frequência)", () => {
    expect(parseFormatado("1,2")).toEqual({
      prefixo: "", sufixo: "", valor: 1.2, casas: 1
    })
  })

  it("inteiro sem decimais", () => {
    expect(parseFormatado("60")?.casas).toBe(0)
  })

  it("travessão de métrica AUSENTE devolve null — nunca vira zero", () => {
    // Se isto virasse 0, a animação exibiria "0" onde não existe medição:
    // exatamente o defeito dos zeros fabricados corrigido mais cedo hoje.
    expect(parseFormatado("—")).toBeNull()
  })

  it("texto sem número devolve null", () => {
    expect(parseFormatado("sem dados")).toBeNull()
  })
})

describe("ida e volta — o valor final é idêntico ao formato original", () => {
  const casos = ["R$ 40,00", "R$ 3.000", "5,0x", "2,1%", "1,2", "60", "R$ 8.420", "0,7%"]

  it.each(casos)("%s remonta igual", (original) => {
    const p = parseFormatado(original)!
    expect(p.prefixo + formatarPtBR(p.valor, p.casas) + p.sufixo).toBe(original)
  })
})

describe("formatarPtBR", () => {
  it("usa vírgula decimal e ponto de milhar", () => {
    expect(formatarPtBR(3000, 0)).toBe("3.000")
    expect(formatarPtBR(40, 2)).toBe("40,00")
  })

  it("mantém a quantidade de casas mesmo em valores intermediários da animação", () => {
    // Durante a contagem o valor é fracionário; o formato não pode oscilar
    // entre "39,9" e "39,90" de um quadro para o outro.
    expect(formatarPtBR(39.987654, 2)).toBe("39,99")
    expect(formatarPtBR(39.1, 2)).toBe("39,10")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regressão 2026-08-01 — número congelado quando `rAF` não roda
// ─────────────────────────────────────────────────────────────────────────────

/** Finge o estado de visibilidade do documento. */
function comDocumentoOculto(oculto: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (oculto ? "hidden" : "visible")
  })
}

describe("useContagem — nunca deixa número parcial congelado na tela", () => {
  afterEach(() => {
    comDocumentoOculto(false)
    vi.useRealTimers()
  })

  it("documento oculto mostra o valor final, não zero", () => {
    // Medido no navegador: com a aba em segundo plano, `requestAnimationFrame`
    // não é agendado nenhuma vez e a contagem ficava parada em 0 — a tela
    // exibia score 4/100, "R$ 0" de CPA e frequência "0,0", enquanto o texto
    // do diagnóstico logo abaixo citava os números reais. Zero fabricado é
    // exatamente o defeito que o projeto passou 2026-07-28 corrigindo.
    comMovimentoReduzido(false)
    comDocumentoOculto(true)
    const { result } = renderHook(() => useContagem(92))
    expect(result.current).toBe(92)
  })

  it("temporizador crava o valor real mesmo se nenhum quadro rodar", () => {
    comMovimentoReduzido(false)
    comDocumentoOculto(false)
    vi.useFakeTimers()
    // rAF que nunca chama de volta — simula aba limitada pelo navegador.
    const original = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (() => 1) as typeof globalThis.requestAnimationFrame

    try {
      const { result } = renderHook(() => useContagem(92, 100, 900))
      expect(result.current).toBe(0) // ainda contando
      act(() => { vi.advanceTimersByTime(100 + 900 + 200 + 1) })
      expect(result.current).toBe(92) // a rede de segurança fechou o valor
    } finally {
      globalThis.requestAnimationFrame = original
    }
  })

  it("ocultar a aba durante a contagem fecha no valor real", () => {
    comMovimentoReduzido(false)
    comDocumentoOculto(false)
    const original = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (() => 1) as typeof globalThis.requestAnimationFrame

    try {
      const { result } = renderHook(() => useContagem(3.4))
      expect(result.current).toBe(0)
      act(() => {
        comDocumentoOculto(true)
        document.dispatchEvent(new Event("visibilitychange"))
      })
      expect(result.current).toBe(3.4)
    } finally {
      globalThis.requestAnimationFrame = original
    }
  })
})
