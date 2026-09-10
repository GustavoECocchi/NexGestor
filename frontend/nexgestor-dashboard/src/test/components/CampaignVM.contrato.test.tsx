// =============================================================================
// O contrato de gravação de P5 e o consumidor real, do mesmo lado da fronteira.
//
// A fronteira de escrita (`app/service/campaign_payload.py`) passou a conferir
// a FORMA dos blocos do `CampaignVM`, e não só "é uma lista". A justificativa
// não é estética: `tiles: [null]` era aceito, gravado, devolvido pelo GET e
// derrubava a tela da campanha (achado 1 da revisão Codex de 2026-09-09).
//
// Este arquivo cobre o lado do cliente dessa dupla:
//   • a fixture compartilhada `campaignVMReal.json` é MESMO o que o adapter
//     produz — senão o teste do backend estaria validando um objeto fictício;
//   • esse VM completo, com todos os blocos preenchidos, renderiza;
//   • a estrutura que o contrato agora recusa realmente quebra o consumidor.
//
// O backend usa a MESMA fixture em `test_metric_consistency.py`
// (`TestContratoDeGravacao::test_vm_real_completo_salva_e_relê`), então os dois
// lados falam do mesmo objeto.
// =============================================================================
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MetricFeed } from "~components/MetricFeed"
import { responseToVM } from "~lib/adapt"
import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM, Tile } from "~types"

import vmReal from "../fixtures/campaignVMReal.json"

afterEach(cleanup)

// Entrada e resposta que produziram a fixture. Mantidas aqui, e não no arquivo
// JSON, para o teste poder reproduzir a derivação e comparar.
const ENTRADA: AnalyzeInput = {
  campaign: {
    id: 1000, name: "Black Friday — Conversão", objective: "conversion",
    platform: "meta_ads", niche: "ecommerce_varejo"
  },
  metrics: {
    impressions: 250000, reach: 180000, spend: 4200, video_views_3s: 95000,
    thruplays: 42000, link_clicks: 4100, all_clicks: 5600,
    landing_page_views: 3800, conversions: 112, roas: 2.4, frequency: 1.39
  },
  targets: { max_cpa: 40, min_roas: 3 }
}

const RESPOSTA: CampaignAnalysisResponse = {
  campaign_id: 1000,
  campaign_name: "Black Friday — Conversão",
  final_status: "RED",
  overall_score: 42,
  score_coverage: 85,
  score_confidence: "high",
  summary: "resumo do engine",
  scenarios: [
    { code: "A", title: "Cenário A — Hook fraco (detalhe)", root_cause: "causa raiz A", funnel_impact: "impacto A", action: "ação A", execution_rule: "regra A. resto", priority: 1 },
    { code: "D", title: "Cenário D — LP desalinhada", root_cause: "causa raiz D", funnel_impact: "impacto D", action: "ação D", execution_rule: "regra D. resto", priority: 2 },
    { code: "G", title: "Cenário G — Escala", root_cause: "causa raiz G", funnel_impact: "impacto G", action: "ação G", execution_rule: "regra G. resto", priority: 3 }
  ],
  metric_evaluations: [
    { metric: "CPA", value: 37.5, status: "YELLOW", score: 55, note: "⚠ Meta: 40. Acima do ideal." },
    { metric: "CTR Link", value: 1.64, status: "GREEN", score: 90, note: "✓ Meta: 1.5. Saudável." },
    { metric: "ROAS", value: 2.4, status: "RED", score: 20, note: "✗ Meta: 3. Abaixo." },
    { metric: "Frequência", value: 1.39, status: "GREEN", score: 100, note: "✓ Audiência fresca." }
  ],
  primary_action: "ação primária do engine",
  ai_insights: {
    executive_summary: "resumo executivo",
    extra_scenarios: [{ title: "Extra da IA", description: "descrição da IA", recommended_action: "ação recomendada pela IA. resto", confidence: "medium" }],
    contextual_insights: [{ title: "Padrão cruzado", explanation: "CPA sobe junto com a frequência." }],
    risk_warnings: [{ title: "Fadiga em 48h", explanation: "Frequência subindo rápido.", timeframe: "48h" }]
  }
}

describe("fixture compartilhada com o backend", () => {
  it("é exatamente o que `responseToVM` produz — não uma cópia que envelheceu", () => {
    expect(responseToVM(RESPOSTA, ENTRADA)).toEqual(vmReal)
  })

  it("tem os blocos PREENCHIDOS — uma fixture de listas vazias não provaria nada", () => {
    const vm = vmReal as unknown as CampaignVM
    expect(vm.tiles.length).toBeGreaterThan(3)
    expect(vm.scenarios.length).toBeGreaterThan(0)
    expect(vm.actions.length).toBeGreaterThan(0)
    expect(vm.sugg.length).toBeGreaterThan(0)
    expect(vm.aiInsights?.length).toBeGreaterThan(0)
    expect(vm.aiRisks?.length).toBeGreaterThan(0)
    // Um tile com score (6ª posição), que é o que vira altura de barra.
    expect(vm.tiles.some((t) => typeof t[5] === "number")).toBe(true)
    // E um tile sem score, sintetizado pelo adapter — as duas formas existem.
    expect(vm.tiles.some((t) => t.length < 6)).toBe(true)
  })
})

describe("o VM que passa pelo contrato renderiza", () => {
  it("MetricFeed desenha o VM completo, incluindo as barras do funil", () => {
    render(<MetricFeed c={vmReal as unknown as CampaignVM} />)
    expect(screen.getAllByText("CPA").length).toBeGreaterThan(0)
    expect(screen.getByText("R$ 37,50")).toBeInTheDocument()
    expect(screen.getByText("Onde a campanha quebra")).toBeInTheDocument()
  })

  it("sobrevive ao round-trip de gravação (JSON.stringify → JSON.parse)", () => {
    // É o que o `payload` atravessa: `salvarCampanha` serializa o VM e
    // `listarCampanhasSalvas` devolve `{...l.payload}` sem reprocessar.
    const depoisDoServidor = JSON.parse(JSON.stringify(vmReal)) as CampaignVM
    expect(depoisDoServidor).toEqual(vmReal)
    render(<MetricFeed c={depoisDoServidor} />)
    expect(screen.getByText("Onde a campanha quebra")).toBeInTheDocument()
  })
})

describe("o que o contrato passou a recusar quebra mesmo o consumidor", () => {
  it.each(["tiles", "actions"] as const)("omitir %s também derruba a renderização", (campo) => {
    const quebrado = { ...vmReal } as Partial<CampaignVM>
    delete quebrado[campo]
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      expect(() => render(<MetricFeed c={quebrado as CampaignVM} />)).toThrow()
    } finally {
      silencio.mockRestore()
    }
  })

  it("um item null em `tiles` derruba a renderização", () => {
    // Justificativa executável do achado 1: antes isso era aceito na gravação
    // e devolvido pelo GET, então chegava aqui vindo do servidor.
    const quebrado = { ...(vmReal as unknown as CampaignVM), tiles: [null] as unknown as Tile[] }
    const silencio = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<MetricFeed c={quebrado} />)).toThrow()
    silencio.mockRestore()
  })

  it("um `score` não numérico vira altura NaN na barra, não um estilo faltando", () => {
    const comScoreRuim = {
      ...(vmReal as unknown as CampaignVM),
      // "CTR Link" é um dos rótulos do painel do funil — é lá que o score
      // vira altura de barra (MetricFeed.tsx).
      tiles: [["CTR Link", "1,6%", "var(--red)", "nota", "gestor", "alto"]] as unknown as Tile[]
    }
    const { container } = render(<MetricFeed c={comScoreRuim} />)
    const barra = container.querySelector<HTMLElement>(".fb-col")
    expect(barra).not.toBeNull()
    expect(barra!.style.height).not.toMatch(/^\d/)
  })
})
