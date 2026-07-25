import { beforeEach, describe, expect, it } from "vitest"
import { num, parseFileJSON } from "~components/NewCampaignModal"

beforeEach(() => {
  localStorage.clear() // parseFileJSON chama nextLiveId(), que lê localStorage
})

describe("num — parser de número em pt-BR/en-US", () => {
  it("vazio vira undefined (campo omitido do payload)", () => {
    expect(num("")).toBeUndefined()
    expect(num("   ")).toBeUndefined()
  })

  it("formato brasileiro com milhar e decimal", () => {
    expect(num("1.234,56")).toBe(1234.56)
  })

  it("formato americano com decimal", () => {
    expect(num("1234.56")).toBe(1234.56)
  })

  it("inteiro simples", () => {
    expect(num("50")).toBe(50)
  })

  it("lixo não numérico vira undefined, não NaN", () => {
    expect(num("abc")).toBeUndefined()
  })
})

describe("parseFileJSON — a whitelist é a garantia de segurança aqui", () => {
  it("JSON inválido retorna erro claro, não lança exceção", () => {
    const result = parseFileJSON("{ isso não é json")
    expect("error" in result).toBe(true)
  })

  it("número e string na raiz são rejeitados", () => {
    expect("error" in parseFileJSON("42")).toBe(true)
    expect("error" in parseFileJSON('"texto"')).toBe(true)
  })

  it("array na raiz não quebra — typeof array é 'object' em JS, então cai como 'sem campos' (defaults)", () => {
    // Achado ao escrever este teste: não é um bug de segurança (nenhum dado
    // errado é aceito — Object.entries de um array sem os blocos esperados
    // não produz nada pra copiar), só uma validação mais frouxa do que o
    // esperado. Documentado aqui em vez de silenciosamente assumido.
    const result = parseFileJSON("[1,2,3]")
    expect("error" in result).toBe(false)
  })

  it("campo com nome exato na whitelist vai pro campo certo — nunca por posição", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: 50 } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBe(50)
    expect(result.input.metrics.cpc).toBeUndefined() // nunca vaza pra outro campo
    expect(result.unknownKeys).toEqual([])
    expect(result.invalidTypeKeys).toEqual([])
  })

  it("chave desconhecida é reportada e IGNORADA, nunca aceita silenciosamente", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: 50, campoInventado: 999 } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBe(50)
    expect((result.input.metrics as Record<string, unknown>).campoInventado).toBeUndefined()
    expect(result.unknownKeys).toContain("metrics.campoInventado")
  })

  it("tipo errado (string onde espera number) é reportado e IGNORADO", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: "cinquenta" } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBeUndefined()
    expect(result.invalidTypeKeys).toContain("metrics.cpa")
  })

  it("learning_phase é o único campo booleano — number nele é tipo errado", () => {
    const ok = parseFileJSON(JSON.stringify({ metrics: { learning_phase: true } }))
    if ("error" in ok) throw new Error("não deveria ter erro")
    expect(ok.input.metrics.learning_phase).toBe(true)

    const errado = parseFileJSON(JSON.stringify({ metrics: { learning_phase: 1 } }))
    if ("error" in errado) throw new Error("não deveria ter erro")
    expect(errado.input.metrics.learning_phase).toBeUndefined()
    expect(errado.invalidTypeKeys).toContain("metrics.learning_phase")
  })

  it("mesma regra vale pro bloco targets", () => {
    const result = parseFileJSON(JSON.stringify({ targets: { max_cpa: 80, chaveFalsa: 1, min_roas: "alto" } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.targets.max_cpa).toBe(80)
    expect(result.unknownKeys).toContain("targets.chaveFalsa")
    expect(result.invalidTypeKeys).toContain("targets.min_roas")
  })

  it("Infinity vira null no round-trip do JSON e é tratado como tipo inválido", () => {
    const result = parseFileJSON(JSON.stringify({ metrics: { cpa: Infinity } }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.metrics.cpa).toBeUndefined()
    expect(result.invalidTypeKeys).toContain("metrics.cpa")
  })

  it("campaign.name vazio ou ausente cai no nome padrão, nunca fica em branco", () => {
    const semNome = parseFileJSON(JSON.stringify({ campaign: {}, metrics: {} }))
    if ("error" in semNome) throw new Error("não deveria ter erro")
    expect(semNome.input.campaign.name).toBe("Campanha via arquivo")

    const comNome = parseFileJSON(JSON.stringify({ campaign: { name: "Black Friday" }, metrics: {} }))
    if ("error" in comNome) throw new Error("não deveria ter erro")
    expect(comNome.input.campaign.name).toBe("Black Friday")
  })

  it("campaign.objective/platform têm default quando ausentes", () => {
    const result = parseFileJSON(JSON.stringify({ campaign: {}, metrics: {} }))
    if ("error" in result) throw new Error("não deveria ter erro")
    expect(result.input.campaign.objective).toBe("conversion")
    expect(result.input.campaign.platform).toBe("meta_ads")
  })

  it("sem nenhum bloco, ainda retorna um input válido com defaults (não é erro)", () => {
    const result = parseFileJSON("{}")
    expect("error" in result).toBe(false)
  })
})
