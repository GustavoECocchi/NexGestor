import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { AIExtras } from "~components/DetailSections"
import { responseToVM } from "~lib/adapt"
import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM } from "~types"

afterEach(cleanup)

/**
 * Observações da IA — o backend devolvia `contextual_insights` e
 * `risk_warnings` desde sempre e a tela descartava os dois. A chamada ao
 * Gemini era paga, o alerta de risco era escrito, e ninguém via.
 */

const base = { aiInsights: [], aiRisks: [] } as unknown as CampaignVM

const resposta = (ai: unknown): CampaignAnalysisResponse =>
  ({
    campaign_id: 1,
    campaign_name: "t",
    final_status: "RED",
    overall_score: 30,
    score_coverage: 70,
    score_confidence: "medium",
    summary: "s",
    scenarios: [],
    metric_evaluations: [],
    primary_action: "acao",
    ai_insights: ai
  }) as unknown as CampaignAnalysisResponse

const entrada = { campaign: { id: 1, name: "t" }, metrics: {}, targets: {} } as AnalyzeInput

describe("adapter — os blocos param de ser descartados", () => {
  it("leva insights e riscos da resposta para o view-model", () => {
    const vm = responseToVM(
      resposta({
        executive_summary: "resumo",
        extra_scenarios: [],
        contextual_insights: [{ title: "Padrão cruzado", explanation: "explicação" }],
        risk_warnings: [{ title: "Risco", explanation: "por quê", timeframe: "48h" }]
      }),
      entrada
    )

    expect(vm.aiInsights).toEqual([{ title: "Padrão cruzado", explanation: "explicação" }])
    expect(vm.aiRisks?.[0].timeframe).toBe("48h")
  })

  it("sem IA, os dois ficam vazios (nunca undefined explodindo na tela)", () => {
    const vm = responseToVM(resposta(null), entrada)
    expect(vm.aiInsights).toEqual([])
    expect(vm.aiRisks).toEqual([])
    expect(vm.hasAI).toBe(false)
  })

  it("IA que responde sem esses campos não quebra o adapter", () => {
    const vm = responseToVM(
      resposta({ executive_summary: "só resumo", extra_scenarios: [] }),
      entrada
    )
    expect(vm.aiInsights).toEqual([])
    expect(vm.aiRisks).toEqual([])
    expect(vm.hasAI).toBe(true)
  })
})

describe("AIExtras — o que aparece na tela", () => {
  it("não renderiza nada quando não há IA (sem cabeçalho órfão)", () => {
    const { container } = render(<AIExtras c={base} />)
    expect(container.firstChild).toBeNull()
  })

  it("campanha antiga do localStorage (campos ausentes) também não quebra", () => {
    const { container } = render(<AIExtras c={{} as CampaignVM} />)
    expect(container.firstChild).toBeNull()
  })

  it("mostra o insight e o alerta com a janela de tempo", () => {
    render(
      <AIExtras
        c={{
          aiInsights: [{ title: "Saturação de público", explanation: "frequência em 3.6" }],
          aiRisks: [{ title: "Caixa em risco", explanation: "CPA 67% acima do teto", timeframe: "48h" }]
        } as CampaignVM}
      />
    )

    expect(screen.getByText("Saturação de público")).toBeTruthy()
    expect(screen.getByText("frequência em 3.6")).toBeTruthy()
    expect(screen.getByText("Caixa em risco")).toBeTruthy()
    // A janela é o que torna o alerta acionável — sem ela vira aviso genérico.
    expect(screen.getByText("48h")).toBeTruthy()
  })

  it("risco sem janela de tempo não mostra etiqueta vazia", () => {
    const { container } = render(
      <AIExtras
        c={{ aiInsights: [], aiRisks: [{ title: "R", explanation: "e", timeframe: "" }] } as unknown as CampaignVM}
      />
    )
    expect(container.querySelector(".ai-prazo")).toBeNull()
  })

  it("texto do modelo é renderizado como TEXTO, nunca como HTML", () => {
    const { container } = render(
      <AIExtras
        c={{
          aiInsights: [{ title: "<img src=x onerror=alert(1)>", explanation: "<b>negrito</b>" }],
          aiRisks: []
        } as unknown as CampaignVM}
      />
    )

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("b")).toBeNull()
    expect(screen.getByText("<b>negrito</b>")).toBeTruthy()
  })
})
