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

  it("vira null (não 0) quando não há nem gestor nem avaliação", () => {
    // Histórico: este teste exigia `0` (2026-07-25) — a asserção codificava o
    // defeito. O zero fabricado vazava como fato pela UI: o Copiloto dizia "o
    // CPA atual desta campanha é R$ 0,00" e o comparador dava vitória de "CPA
    // menor" à campanha que não tinha CPA nenhum. `null` é a única resposta
    // honesta para "não foi medido"; quem exibe trata a ausência.
    const vm = responseToVM(baseResponse({ metric_evaluations: [] }), baseInput())
    expect(vm.roasNum).toBeNull()
    expect(vm.cpaNum).toBeNull()
    expect(vm.ctrNum).toBeNull()
    expect(vm.freqNum).toBeNull()
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
    expect(vm.tiles[0][1]).toBe("R$ 50,00")
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

describe("responseToVM — tiles e meta não preenchida (fase-2 §11)", () => {
  // AC-M1: com meta definida, o tile usa a cor do semáforo do engine e a
  // origem "gestor" — meta escolhida por quem preencheu o formulário.
  it("AC-M1 — meta definida: cor do semáforo, origem 'gestor'", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [evalM("CTR Link", 2, "GREEN")] }),
      baseInput({ targets: { min_ctr_link: 1.5 } })
    )
    const tile = vm.tiles.find((t) => t[0] === "CTR Link")!
    expect(tile[2]).toBe("var(--green)")
    expect(tile[4]).toBe("gestor")
  })

  // AC-M2: CPA/CPL/ROAS não têm default no schema. Meta em branco → o engine
  // pula a avaliação (metric_evaluations não traz a métrica) — mesmo assim o
  // valor que o gestor mandou não pode desaparecer da grade sem explicação.
  it("AC-M2 — CPA/CPL/ROAS com valor mas sem meta viram tile 'sem meta', não somem", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [] }), // engine não avaliou nenhuma das três
      baseInput({ metrics: { cpa: 50, cpl: 30, roas: 2.5 }, targets: {} })
    )
    for (const metric of ["CPA", "CPL", "ROAS"]) {
      const tile = vm.tiles.find((t) => t[0] === metric)
      expect(tile, `tile de ${metric} deveria existir`).toBeTruthy()
      expect(tile![2]).toBe("var(--txt-3)")
      expect(tile![3]).toBe("Você não definiu uma meta para isso.")
      expect(tile![4]).toBe("ausente")
    }
    expect(vm.tiles.find((t) => t[0] === "CPA")![1]).toBe("R$ 50,00")
  })

  // AC-M3: CTR Link/Hook Rate/CPM têm default no schema. Meta em branco não
  // impede a avaliação (o Pydantic preenche o default) — o card aparece, mas
  // precisa avisar que a meta usada não foi escolhida pelo gestor.
  it("AC-M3 — CTR Link/Hook Rate/CPM avaliados com default viram 'meta padrão do sistema'", () => {
    const vm = responseToVM(
      baseResponse({
        metric_evaluations: [evalM("CTR Link", 2, "RED"), evalM("Hook Rate", 40, "GREEN"), evalM("CPM", 60, "RED")]
      }),
      baseInput({ targets: {} }) // nenhuma das três foi preenchida pelo gestor
    )
    for (const metric of ["CTR Link", "Hook Rate", "CPM"]) {
      const tile = vm.tiles.find((t) => t[0] === metric)!
      // cor neutra — não a cor de julgamento do semáforo, mesmo a métrica tendo
      // avaliado RED — porque a meta usada não foi confirmada pelo gestor.
      expect(tile[2]).toBe("var(--txt-2)")
      expect(tile[4]).toBe("sistema")
    }
  })

  // Meta definida normalmente (não em branco) para as mesmas três métricas não
  // deve disparar o rótulo de "sistema" — é o caso comum, não pode regredir.
  it("CTR Link/Hook Rate/CPM com meta definida pelo gestor não ganham marca de sistema", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [evalM("CTR Link", 2, "GREEN")] }),
      baseInput({ targets: { min_ctr_link: 1.5 } })
    )
    const tile = vm.tiles.find((t) => t[0] === "CTR Link")!
    expect(tile[4]).toBe("gestor")
    expect(tile[2]).toBe("var(--green)")
  })

  // AC-M4: métrica sem valor (nem enviada nem derivável) continua sem card —
  // não é para o gap de "meta em branco" inventar um tile do nada.
  it("AC-M4 — CPA sem valor enviado não vira tile, mesmo sem meta", () => {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [] }),
      baseInput({ metrics: {}, targets: {} })
    )
    expect(vm.tiles.find((t) => t[0] === "CPA")).toBeUndefined()
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

  it("meta_ads mapeia pro rótulo em português", () => {
    const vm = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "meta_ads" } }))
    expect(vm.platform).toBe("Meta Ads")
  })

  it("mapeia tiktok_ads e linkedin_ads pros rótulos corretos", () => {
    const tiktok = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "tiktok_ads" } }))
    expect(tiktok.platform).toBe("TikTok Ads")

    const linkedin = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "linkedin_ads" } }))
    expect(linkedin.platform).toBe("LinkedIn Ads")
  })

  it("plataforma desconhecida ou ausente cai em Meta Ads (fallback, não invenção)", () => {
    const desconhecida = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x", platform: "snapchat_ads" } }))
    expect(desconhecida.platform).toBe("Meta Ads")

    const ausente = responseToVM(baseResponse(), baseInput({ campaign: { id: 1, name: "x" } }))
    expect(ausente.platform).toBe("Meta Ads")
  })
})

describe("responseToVM — legenda do tile mostra o veredito completo, não a meta (fase-2 §11)", () => {
  // Regressão (2026-08-01): a legenda cortava a nota no primeiro ".", e ponto
  // decimal é o mesmo caractere que encerra frase — "Meta: <R$39.90." virava
  // "meta <R$39". Corrigido então preservando o número, mas ainda cortando
  // ANTES do veredito (o texto em português que diz se está bem ou mal).
  //
  // Regressão (fase-2 §11, 2026-08-27): o veredito nunca chegava à tela — só
  // a meta ("meta >35%"), nunca o "por quê" ("Crítico — criativo invisível no
  // feed"). Correção: descarta só a frase da meta (se existir) e o símbolo
  // cru; o resto — incluindo números decimais dentro do próprio veredito,
  // como "ROAS 4.0x" — precisa sobreviver intacto.
  function tileDe(metric: string, note: string): string {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [{ metric, value: 30, status: "GREEN", score: 100, note }] }),
      baseInput()
    )
    const tile = vm.tiles.find((t) => t[0] === metric)
    expect(tile, `tile de ${metric} deveria existir`).toBeTruthy()
    return tile![3]
  }

  it("descarta a meta de CPA (com centavos) e preserva o veredito", () => {
    expect(tileDe("CPA", "Meta: <R$39.90. ✓ CPA 25% abaixo da meta.")).toBe("CPA 25% abaixo da meta.")
  })

  it("descarta a meta de CPC e CPL (com centavos) e preserva o veredito", () => {
    expect(tileDe("CPC", "Meta: <R$1.50. ✓ Custo por clique dentro do teto.")).toBe("Custo por clique dentro do teto.")
    expect(tileDe("CPL", "Meta: <R$19.90. ✓ Custo por lead dentro da meta.")).toBe("Custo por lead dentro da meta.")
  })

  it("descarta o limite de fadiga (com casa decimal) e preserva o veredito", () => {
    expect(tileDe("Frequência", "Limite de fadiga: 2.8. ✓ Audiência fresca.")).toBe("Audiência fresca.")
  })

  it("preserva a unidade e a casa decimal DENTRO do veredito de ROAS/CTR", () => {
    expect(tileDe("ROAS", "Meta: >3.0x. ✓ ROAS 4.0x — retorno saudável.")).toBe("ROAS 4.0x — retorno saudável.")
    expect(tileDe("CTR Link", "Meta: >1.0%. ✓ Intenção de clique saudável.")).toBe("Intenção de clique saudável.")
  })

  it("não trunca mais o veredito, mesmo em nota longa com travessão", () => {
    expect(tileDe("Hook Rate", "Meta: >25%. ✓ Criativo capta atenção no feed.")).toBe("Criativo capta atenção no feed.")
    expect(tileDe("CPM", "Referência: <R$25.00. ✗ CPM crítico — público exaurido ou anúncio penalizado.")).toBe(
      "CPM crítico — público exaurido ou anúncio penalizado."
    )
  })

  it("nota sem prefixo de meta (CTR Todos/Click-Bait) só perde o símbolo cru", () => {
    expect(tileDe("CTR Todos", "✓ Proporção de engajamento saudável.")).toBe(
      "Proporção de engajamento saudável."
    )
    expect(
      tileDe("CTR Todos", "✗ Click-Bait detectado: CTR Todos 8.0% vs CTR Link 0.30%.")
    ).toBe("Click-Bait detectado: CTR Todos 8.0% vs CTR Link 0.30%.")
  })
})

describe("responseToVM — custo unitário exibido com centavos", () => {
  // Regressão (2026-08-01): ver brlCents em lib/format.ts.
  function tileValor(metric: string, value: number): string {
    const vm = responseToVM(
      baseResponse({ metric_evaluations: [{ metric, value, status: "GREEN", score: 100, note: "Meta: ok. resto." }] }),
      baseInput()
    )
    return vm.tiles.find((t) => t[0] === metric)![1]
  }

  it("CPC de R$0,45 não aparece como R$ 0", () => {
    expect(tileValor("CPC", 0.45)).toBe("R$ 0,45")
  })

  it("CPA de R$39,90 não aparece como R$ 40", () => {
    expect(tileValor("CPA", 39.9)).toBe("R$ 39,90")
  })

  it("CPL e CPM também levam centavos", () => {
    expect(tileValor("CPL", 19.9)).toBe("R$ 19,90")
    expect(tileValor("CPM", 8.05)).toBe("R$ 8,05")
  })

  it("investimento e receita seguem sem centavos (total, não custo unitário)", () => {
    const vm = responseToVM(
      baseResponse(),
      baseInput({ metrics: { spend: 8420.37, roas: 1.1 } })
    )
    expect(vm.tiles.find((t) => t[0] === "Investimento")![1]).toBe("R$ 8.420")
  })
})

describe("responseToVM — sugestão nunca exibe só o número da lista", () => {
  // Regressão (2026-08-01): metade das `execution_rule` do engine é lista
  // numerada ("1. Conferir o pixel. 2. Abrir..."). O corte no primeiro "."
  // devolvia literalmente "1", e o card exibia "Impacto 1" — o Copiloto
  // chegava a dizer "impacto 1, esforço Imediato".
  function impactoDe(execution_rule: string): string {
    const vm = responseToVM(
      baseResponse({ scenarios: [scenario("L", { execution_rule })] }),
      baseInput()
    )
    return vm.sugg[0].impact
  }

  it("lista numerada não vira '1'", () => {
    const r = impactoDe("1. Conferir se o pixel está disparando. 2. Abrir o anúncio.")
    expect(r).not.toBe("1")
    expect(r).toBe("Conferir se o pixel está disparando")
  })

  it("aceita outros marcadores de lista", () => {
    expect(impactoDe("2) Fundir conjuntos semelhantes. 3) Revisar verba.")).toBe(
      "Fundir conjuntos semelhantes"
    )
  })

  it("não quebra em número decimal no meio da frase", () => {
    expect(impactoDe("Manter o CPM abaixo de R$25.00 durante a próxima semana.")).toBe(
      "Manter o CPM abaixo de R$25.00 durante a próxima semana"
    )
  })

  it("frase longa é cortada em palavra inteira e marcada com reticências", () => {
    const r = impactoDe(
      "Refazer abertura com Pattern Interrupt usando headline visual agressiva e cores de contraste."
    )
    expect(r.endsWith("…")).toBe(true)
    expect(r.length).toBeLessThanOrEqual(61) // 60 + reticências
    expect(r).not.toMatch(/\s…$/) // sem espaço solto antes das reticências
    // não pode partir palavra no meio
    expect(r.slice(0, -1).split(" ").pop()).not.toBe("agressi")
  })

  it("frase curta passa inteira, sem reticências", () => {
    const r = impactoDe("Reduzir orçamento em 30–50% imediatamente.")
    expect(r).toBe("Reduzir orçamento em 30–50% imediatamente")
    expect(r).not.toContain("…")
  })

  it("nunca corta número no meio (30% não pode virar 3)", () => {
    const r = impactoDe(
      "Aumentar o orçamento diário da campanha em exatamente 30% a cada período de 24 horas seguidas."
    )
    expect(r).not.toMatch(/\b3…$/)
    expect(r.endsWith("…")).toBe(true)
  })

  it("ação vinda da IA recebe o mesmo tratamento", () => {
    const vm = responseToVM(
      baseResponse({
        ai_insights: {
          executive_summary: "resumo",
          extra_scenarios: [{
            title: "Cenário IA",
            description: "d",
            recommended_action: "1. Revisar a segmentação de público antes de qualquer mudança de verba.",
            confidence: "high"
          }],
          contextual_insights: [],
          risk_warnings: []
        }
      }),
      baseInput()
    )
    expect(vm.sugg[0].impact).not.toBe("1")
    expect(vm.sugg[0].impact.startsWith("Revisar a segmentação")).toBe(true)
  })
})
