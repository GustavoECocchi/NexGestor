import { describe, expect, it } from "vitest"
import { brl, brlCents, dec } from "~lib/format"

describe("brl", () => {
  it("formata inteiro com separador de milhar pt-BR", () => {
    expect(brl(1000)).toBe("1.000")
  })

  it("arredonda em vez de truncar", () => {
    expect(brl(92.6)).toBe("93")
    expect(brl(92.4)).toBe("92")
  })

  it("aceita zero", () => {
    expect(brl(0)).toBe("0")
  })
})

describe("dec", () => {
  it("formata com 1 casa e vírgula decimal", () => {
    expect(dec(4)).toBe("4,0")
    expect(dec(5.2)).toBe("5,2")
  })

  it("arredonda a casa decimal", () => {
    expect(dec(5.26)).toBe("5,3")
  })
})

describe("brlCents — custo unitário nunca some na tela", () => {
  // Regressão (2026-08-01): CPA/CPC/CPL/CPM usavam `brl`, que arredonda para
  // inteiro. CPC de R$0,45 — valor comum no mercado brasileiro — aparecia como
  // "R$ 0", um custo real exibido como zero, com a meta ao lado dizendo
  // "meta <R$1.50". CPA de R$39,90 virava "R$ 40".
  it("centavos de CPC abaixo de R$1 não viram zero", () => {
    expect(brlCents(0.45)).toBe("0,45")
    expect(brlCents(0.07)).toBe("0,07")
  })

  it("preserva os centavos de metas quebradas", () => {
    expect(brlCents(39.9)).toBe("39,90")
    expect(brlCents(1.5)).toBe("1,50")
    expect(brlCents(19.99)).toBe("19,99")
  })

  it("mantém o separador de milhar", () => {
    expect(brlCents(1234.56)).toBe("1.234,56")
  })

  it("zero medido é exibido como zero com centavos, não omitido", () => {
    expect(brlCents(0)).toBe("0,00")
  })
})

describe("brl — segue inteiro para totais grandes", () => {
  it("Investimento e Receita não ganham centavos", () => {
    expect(brl(8420.37)).toBe("8.420")
  })
})
