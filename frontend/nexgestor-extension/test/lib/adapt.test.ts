import { describe, expect, it } from "vitest"
import { responseToVM } from "~lib/adapt"
import type { AnalyzeInput, CampaignAnalysisResponse, MetricEvaluation, ScenarioDetail } from "~types"

function baseInput(overrides: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return {
    campaign: { id: 101, name: "Campanha X", objective: "conversion", platform: "meta_ads" },
    metrics: {},
    targets: {},
    ...overrides
  }
}

function evalM(metric: string, value: number | null, status: MetricEvaluation["status"] = "GREEN"): MetricEvaluation {
  return { metric, value, status, score: 10, note: "Meta: ok tudo certo. resto." }
}

function scenario(code: ScenarioDetail["code"], overrides: Partial<ScenarioDetail> = {}): ScenarioDetail {
  return {
    code,
    title: "Cenário X — Título Curto (detalhe extra)",
    root_cause: "causa raiz",
    funnel_impact: "impacto no funil",
    action: "ação recomendada",
    execution_rule: "regra de execução. resto",
    priority: 2,
    ...overrides
  }
}

function baseResponse(overrides: Partial<CampaignAnalysisResponse> = {}): CampaignAnalysisResponse {
  return {
    campaign_id: 101,
    campaign_name: "Campanha X",
    final_status: "GREEN",
    overall_score: 80,
    score_coverage: 90,
    score_confidence: "high",
    summary: "resumo do engine",
    scenarios: [],
    metric_evaluations: [],
    primary_action: "próxima ação",
    ...overrides
  }
}

describe("responseToVM — status de apresentação (UIStatus)", () => {
  it("GREEN sem cenário G continua GREEN", () => {
    const vm = responseToVM(baseResponse({ final_status: "GREEN", scenarios: [] }), baseInput())
    expect(vm.status).toBe("GREEN")
  })

  it("GREEN com cenário G (janela de escala) vira BLUE", () => {
    const vm = responseToVM(
      baseResponse({ final_status: "GREEN", scenarios: [scenario("G")] }),
      baseInput()
    )
    expect(vm.status).toBe("BLUE")
  })

  it("PAUSED é exibido como YELLOW (sem UI própria ainda)", () => {
    const vm = responseToVM(baseResponse({ final_status: "PAUSED" }), baseInput())
    expect(vm.status).toBe("YELLOW")
  })

  it("RED continua RED mesmo com cenário G (não deveria acontecer, mas não inventa saudável)", () => {
    const vm = responseToVM(
      baseResponse({ final_status: "RED", scenarios: [scenario("G")] }),
      baseInput()
    )
    expect(vm.status).toBe("RED")
  })
})

describe("responseToVM — números-base: gestor tem prioridade sobre o avaliado", () => {
  it("usa o valor que o gestor enviou quando existe", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [evalM("ROAS", 2)] }),
      baseInput({ metrics: { roas: 5 } })
    )
    expect(vm.roasNum).toBe(5)
  })

  it("cai pro avaliado quando o gestor não enviou", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [evalM("ROAS", 3.5)] }),
      baseInput({ metrics: {} })
    )
    expect(vm.roasNum).toBe(3.5)
  })

  it("vira 0 (nunca undefined) quando não há nem gestor nem avaliação", () => {
    const vm = responseToVM(baseResponse({ metric_evaluations: [] }), baseInput())
    expect(vm.roasNum).toBe(0)
    expect(vm.cpaNum).toBe(0)
    expect(vm.ctrNum).toBe(0)
    expect(vm.freqNum).toBe(0)
  })
})

describe("responseToVM — investimento e receita: nunca inventa número", () => {
  it("sem spend enviado, invest e revenue ficam 0", () => {
    const vm = responseToVM(baseResponse(), baseInput({ metrics: {} }))
    expect(vm.invest).toBe(0)
    expect(vm.revenue).toBe(0)
  })

  it("com spend mas sem roas, revenue fica 0 (não estima sem base)", () => {
    const vm = responseToVM(baseResponse(), baseInput({ metrics: { spend: 1000 } }))
    expect(vm.invest).toBe(1000)
    expect(vm.revenue).toBe(0)
  })

  it("com spend e roas, revenue = spend × roas (arredondado)", () => {
    const vm = responseToVM(baseResponse(), baseInput({ metrics: { spend: 1500, roas: 3.333 } }))
    expect(vm.invest).toBe(1500)
    expect(vm.revenue).toBe(Math.round(1500 * 3.333))
  })
})

describe("responseToVM — tiles", () => {
  it("um tile por métrica avaliada", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [evalM("CPA", 50), evalM("ROAS", 4)] }),
      baseInput()
    )
    expect(vm.tiles).toHaveLength(2)
    expect(vm.tiles[0][0]).toBe("CPA")
    expect(vm.tiles[0][1]).toBe("R$ 50")
    expect(vm.tiles[1][1]).toBe("4,0x")
  })

  it("investimento/receita só entram como tile se existirem (nunca R$ 0 fantasma)", () => {
    const semDados = responseToVM(baseResponse(), baseInput({ metrics: {} }))
    expect(semDados.tiles.find((t) => t[0] === "Investimento")).toBeUndefined()
    expect(semDados.tiles.find((t) => t[0] === "Receita")).toBeUndefined()

    const comDados = responseToVM(baseResponse(), baseInput({ metrics: { spend: 100, roas: 2 } }))
    expect(comDados.tiles.find((t) => t[0] === "Investimento")?.[1]).toBe("R$ 100")
    expect(comDados.tiles.find((t) => t[0] === "Receita")?.[1]).toBe("R$ 200")
  })

  it("métrica sem valor (null) formata como travessão", () => {
    const vm = responseToVM(baseResponse({ metric_evaluations: [evalM("CPA", null)] }), baseInput())
    expect(vm.tiles[0][1]).toBe("—")
  })
})

describe("responseToVM — cenários, ações e sugestões derivam 1:1 dos cenários do engine", () => {
  it("scenarios/actions têm o mesmo tamanho e conteúdo coerente", () => {
    const vm = responseToVM(
      baseResponse({ scenarios: [scenario("E", { action: "trocar criativo", priority: 1 })] }),
      baseInput()
    )
    expect(vm.scenarios).toHaveLength(1)
    expect(vm.actions).toHaveLength(1)
    expect(vm.actions[0].title).toBe("trocar criativo")
    expect(vm.actions[0].prio).toBe("Alta")
  })

  it("título curto remove o prefixo antes do travessão e o parêntese final", () => {
    const vm = responseToVM(
      baseResponse({ scenarios: [scenario("E", { title: "Cenário E — Fadiga de Criativo (Anúncio Saturado)" })] }),
      baseInput()
    )
    expect(vm.scenarios[0].title).toBe("Fadiga de Criativo")
  })

  it("sugestões da IA entram depois das do engine, até o limite de 5", () => {
    const vm = responseToVM(
      baseResponse({
        scenarios: [scenario("A"), scenario("B"), scenario("C"), scenario("D")],
        ai_insights: {
          executive_summary: "resumo ia",
          extra_scenarios: [
            { title: "Extra 1", description: "d", recommended_action: "fazer x", confidence: "high" },
            { title: "Extra 2", description: "d", recommended_action: "fazer y", confidence: "low" }
          ],
          contextual_insights: [],
          risk_warnings: []
        }
      }),
      baseInput()
    )
    // 4 cenários (máx 3 primeiros viram sugestão) + 2 extras da IA = 5, no limite
    expect(vm.sugg.length).toBeLessThanOrEqual(5)
    expect(vm.sugg.some((s) => s.name === "Extra 1" && s.effort === "IA")).toBe(true)
  })
})

describe("responseToVM — faixa de IA e oportunidade têm fallback honesto", () => {
  it("usa o resumo da IA quando existe", () => {
    const vm = responseToVM(
      baseResponse({
        ai_insights: {
          executive_summary: "Resumo gerado pela IA",
          extra_scenarios: [],
          contextual_insights: [],
          risk_warnings: []
        }
      }),
      baseInput()
    )
    expect(vm.ai).toBe("Resumo gerado pela IA")
  })

  it("sem IA, cai pra causa raiz do primeiro cenário", () => {
    const vm = responseToVM(
      baseResponse({ scenarios: [scenario("E", { title: "Cenário E — Fadiga", root_cause: "criativo cansado" })] }),
      baseInput()
    )
    expect(vm.ai).toContain("criativo cansado")
    expect(vm.ai).toContain("Fadiga")
  })

  it("sem IA e sem cenários, cai pro summary do engine", () => {
    const vm = responseToVM(baseResponse({ scenarios: [], summary: "tudo estável" }), baseInput())
    expect(vm.ai).toBe("tudo estável")
  })

  it("janela de escala aberta (cenário G) vira a oportunidade; senão é a ação primária", () => {
    const comEscala = responseToVM(
      baseResponse({ scenarios: [scenario("G", { root_cause: "leilão favorável" })] }),
      baseInput()
    )
    expect(comEscala.opportunity).toContain("Janela de escala aberta")
    expect(comEscala.opportunity).toContain("leilão favorável")

    const semEscala = responseToVM(
      baseResponse({ scenarios: [], primary_action: "revisar criativo" }),
      baseInput()
    )
    expect(semEscala.opportunity).toContain("revisar criativo")
  })
})

describe("responseToVM — spark/trend são honestos sobre a ausência de histórico", () => {
  it("spark é uma linha flat no score atual, trend é 0", () => {
    const vm = responseToVM(baseResponse({ overall_score: 62 }), baseInput())
    expect(vm.spark).toHaveLength(7)
    expect(vm.spark.every((v) => v === 62)).toBe(true)
    expect(vm.trend).toBe(0)
  })
})

describe("responseToVM — plataforma", () => {
  it("mapeia google_ads pro rótulo em português", () => {
    const vm = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "google_ads" } }))
    expect(vm.platform).toBe("Google Ads")
  })

  it("qualquer outra coisa (incluindo meta_ads) vira Meta Ads", () => {
    const vm = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "meta_ads" } }))
    expect(vm.platform).toBe("Meta Ads")
  })
})
