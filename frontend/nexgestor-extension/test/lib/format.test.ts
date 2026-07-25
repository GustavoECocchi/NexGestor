import { describe, expect, it } from "vitest"
import { brl, dec } from "~lib/format"

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
