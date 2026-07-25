import { describe, expect, it } from "vitest"
import { buildReply, norm } from "~components/Copilot"
import type { CampaignVM } from "~types"

function vm(overrides: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1000,
    name: "Campanha teste",
    platform: "Meta Ads",
    status: "GREEN",
    score: 75,
    invest: 1000,
    revenue: 4000,
    roasNum: 4,
    cpaNum: 25,
    ctrNum: 1.8,
    freqNum: 1.5,
    m1: { k: "CPA", v: "R$ 25" },
    m2: { k: "CTR Link", v: "1,8%" },
    spark: [75, 75, 75, 75, 75, 75, 75],
    trend: 0,
    ai: "",
    summary: "",
    opportunity: "próximo passo: revisar criativo",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    ...overrides
  }
}

describe("norm — normalização pra roteamento por tema", () => {
  it("minúsculas e remove acento", () => {
    expect(norm("CPA está Alto?")).toBe("cpa esta alto?")
    expect(norm("qual é a saturação?")).toBe("qual e a saturacao?")
  })
})

describe("buildReply — roteia pra dados reais da campanha, nunca texto solto", () => {
  it("pergunta sobre CPA responde com o CPA real da campanha", () => {
    const reply = buildReply("qual o CPA dessa campanha?", vm({ cpaNum: 83.33 }))
    expect(reply).toContain("83.33") // toFixed(2), não é formatação BRL aqui
    expect(reply).toContain("CPA")
  })

  it("pergunta sobre ROAS/receita responde com números reais", () => {
    const reply = buildReply("qual o retorno?", vm({ roasNum: 4, revenue: 4000, invest: 1000 }))
    expect(reply).toContain("4.00x")
    expect(reply).toContain("4.000") // toLocaleString pt-BR usa ponto de milhar
  })

  it("pergunta sobre CTR/clique usa o ctrNum real", () => {
    const reply = buildReply("como está o clique?", vm({ ctrNum: 2.34 }))
    expect(reply).toContain("2.34%")
  })

  it("pergunta sobre frequência sinaliza fadiga acima de 3x", () => {
    const semFadiga = buildReply("tem risco de fadiga?", vm({ freqNum: 1.5 }))
    expect(semFadiga).toContain("faixa saudável")

    const comFadiga = buildReply("tem risco de fadiga?", vm({ freqNum: 3.4 }))
    expect(comFadiga).toContain("fadiga de criativo")
  })

  it("pergunta sobre escalar responde conforme o status", () => {
    const podeEscalar = buildReply("vale escalar o investimento?", vm({ status: "BLUE" }))
    expect(podeEscalar).toMatch(/^Sim/)

    const naoDeve = buildReply("vale aumentar a verba?", vm({ status: "RED", scenarios: [] }))
    expect(naoDeve).not.toMatch(/^Sim/)
  })

  it("pergunta por ação prioritária usa a primeira ação real, se existir", () => {
    const reply = buildReply("o que eu faço agora?", vm({
      actions: [{ title: "Trocar criativo", prio: "Alta", why: "CTR baixo", impact: "melhora entrega" }]
    }))
    expect(reply).toContain("Trocar criativo")
  })

  it("pergunta por ação sem nenhuma ação registrada não inventa uma", () => {
    const reply = buildReply("o que fazer agora?", vm({ actions: [], scenarios: [] }))
    expect(reply).toContain("Nenhuma ação crítica pendente")
  })

  it("pergunta por causa raiz usa o cenário atual quando existe", () => {
    const reply = buildReply("qual a causa disso?", vm({
      scenarios: [{ code: "E", title: "Fadiga", root_cause: "criativo saturado", funnel_impact: "queda de CTR", action: "trocar", priority: 1 }]
    }))
    expect(reply).toContain("criativo saturado")
    expect(reply).toContain("queda de CTR")
  })

  it("pergunta por oportunidade devolve o campo opportunity da campanha", () => {
    const reply = buildReply("tem alguma oportunidade?", vm({ opportunity: "escalar 20% ao dia" }))
    expect(reply).toBe("escalar 20% ao dia")
  })

  it("pergunta por sugestão usa a primeira sugestão real", () => {
    const reply = buildReply("alguma sugestão?", vm({
      sugg: [{ name: "Testar novo criativo", impact: "alto", effort: "baixo", urgency: "Alta" }]
    }))
    expect(reply).toContain("Testar novo criativo")
  })

  it("pergunta fora do roteiro cai no fallback honesto — nunca finge entender", () => {
    const semContexto = buildReply("qual é o sentido da vida?", vm({ scenarios: [] }))
    expect(semContexto).toContain("Não tenho uma resposta específica")

    const comContexto = buildReply("me conta uma piada", vm({
      scenarios: [{ code: "E", title: "Cenário E — Fadiga", root_cause: "x", funnel_impact: "y", action: "z", priority: 1 }]
    }))
    expect(comContexto).toContain("Não tenho uma resposta específica")
    expect(comContexto).toContain("Cenário E")
  })

  it("caixa alta na pergunta não muda o roteamento", () => {
    const minusculo = buildReply("qual o cpa?", vm({ cpaNum: 10 }))
    const maiusculo = buildReply("QUAL O CPA?", vm({ cpaNum: 10 }))
    expect(minusculo).toContain("R$ 10.00")
    expect(maiusculo).toBe(minusculo)
  })
})
