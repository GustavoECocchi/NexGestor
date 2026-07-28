// =============================================================================
// Regressões da revisão de 2026-07-28.
//
// Arquivo NOVO — nenhum dos 8 arquivos de teste anteriores foi removido. Dois
// deles tiveram asserções invertidas (documentado no próprio teste), porque
// codificavam o comportamento defeituoso: `adapt.test.ts` exigia que métrica
// ausente virasse `0`, e `NewCampaignModal.test.ts` registrava que array na
// raiz passava sem erro.
//
// Origem dos casos: avaliação externa (NG-T02 e NG-T04) + varredura própria
// (zeros fabricados vazando como fato pela UI).
// =============================================================================

import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CampaignDetail } from "~components/CampaignDetail"
import { CompareModal } from "~components/CompareModal"
import { Copilot, buildReply } from "~components/Copilot"
import { parseFileJSON } from "~components/NewCampaignModal"
import { Summary } from "~components/Summary"
import { responseToVM } from "~lib/adapt"
import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM } from "~types"

// ── fixtures ────────────────────────────────────────────────────────────────

function vm(id: number, overrides: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id,
    name: `Campanha ${id}`,
    platform: "Meta Ads",
    status: "GREEN",
    score: 80,
    invest: 0,
    revenue: 0,
    roasNum: null,
    cpaNum: null,
    ctrNum: null,
    freqNum: null,
    m1: { k: "CPA", v: "—" },
    m2: { k: "CTR Link", v: "—" },
    spark: [],
    trend: 0,
    ai: "",
    summary: "resumo",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    ...overrides
  }
}

function resposta(overrides: Partial<CampaignAnalysisResponse> = {}): CampaignAnalysisResponse {
  return {
    campaign_id: 1,
    campaign_name: "C",
    final_status: "GREEN",
    overall_score: 100,
    score_coverage: 90,
    score_confidence: "high",
    summary: "resumo",
    scenarios: [],
    metric_evaluations: [],
    primary_action: "ação",
    ...overrides
  }
}

function entrada(overrides: Partial<AnalyzeInput> = {}): AnalyzeInput {
  return { campaign: { id: 1, name: "C" }, metrics: {}, targets: {}, ...overrides }
}

const cenarioG = {
  code: "G" as const,
  title: "Cenário G — Janela de Escala Vertical Ativa (Alta Performance)",
  root_cause: "CPA com folga",
  funnel_impact: "impacto",
  action: "Executar Escala Vertical Automatizada — aumentar orçamento agora.",
  execution_rule: "Aumentar entre 15% e 20%. resto",
  priority: 1
}

// ─────────────────────────────────────────────────────────────────────────────
// "Escalável" é um convite a gastar mais — segunda barreira, no frontend
// ─────────────────────────────────────────────────────────────────────────────

describe("responseToVM — status BLUE exige confiança no diagnóstico", () => {
  it("não vira BLUE quando a confiança é baixa, mesmo com janela de escala", () => {
    const v = responseToVM(
      resposta({ scenarios: [cenarioG], score_coverage: 25, score_confidence: "low" }),
      entrada()
    )
    expect(v.status).toBe("GREEN")
  })

  it("vira BLUE com janela de escala e confiança média", () => {
    const v = responseToVM(
      resposta({ scenarios: [cenarioG], score_coverage: 55, score_confidence: "medium" }),
      entrada()
    )
    expect(v.status).toBe("BLUE")
  })

  it("vira BLUE com janela de escala e confiança alta", () => {
    const v = responseToVM(resposta({ scenarios: [cenarioG] }), entrada())
    expect(v.status).toBe("BLUE")
  })

  it("sem janela de escala segue GREEN, independente da confiança", () => {
    const v = responseToVM(resposta({ score_confidence: "low" }), entrada())
    expect(v.status).toBe("GREEN")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Ausência de métrica não pode virar zero (achado próprio)
// ─────────────────────────────────────────────────────────────────────────────

describe("responseToVM — ausência de métrica não vira número", () => {
  it("métrica só do gestor continua sendo usada", () => {
    const v = responseToVM(resposta(), entrada({ metrics: { cpa: 12.5 } }))
    expect(v.cpaNum).toBe(12.5)
  })

  it("zero enviado pelo gestor é preservado como zero (não é ausência)", () => {
    const v = responseToVM(resposta(), entrada({ metrics: { cpa: 0, roas: 0 } }))
    expect(v.cpaNum).toBe(0)
    expect(v.roasNum).toBe(0)
  })

  it("revenue não é estimado quando o ROAS é desconhecido", () => {
    const v = responseToVM(resposta(), entrada({ metrics: { spend: 1000 } }))
    expect(v.roasNum).toBeNull()
    expect(v.revenue).toBe(0)
  })

  it("revenue com roas 0 é 0 e não confunde com ausência", () => {
    const v = responseToVM(resposta(), entrada({ metrics: { spend: 1000, roas: 0 } }))
    expect(v.revenue).toBe(0)
    expect(v.roasNum).toBe(0)
  })
})

describe("Copiloto — nunca afirma número que a campanha não tem", () => {
  it("CPA ausente: diz que não tem o dado em vez de 'R$ 0,00'", () => {
    const r = buildReply("qual o CPA?", vm(1))
    expect(r).not.toContain("0.00")
    expect(r.toLowerCase()).toContain("não tem")
    expect(r).toContain("CPA")
  })

  it("ROAS ausente: não inventa 0.00x", () => {
    const r = buildReply("qual o retorno?", vm(1))
    expect(r).not.toContain("0.00x")
    expect(r.toLowerCase()).toContain("não tem")
  })

  it("CTR ausente: não inventa 0.00%", () => {
    const r = buildReply("como está o clique?", vm(1))
    expect(r).not.toContain("0.00%")
  })

  it("frequência ausente: não diz que está 'dentro de uma faixa saudável'", () => {
    const r = buildReply("tem risco de fadiga?", vm(1))
    expect(r.toLowerCase()).not.toContain("faixa saudável")
    expect(r.toLowerCase()).toContain("não tem")
  })

  it("zero medido continua sendo respondido como número", () => {
    const r = buildReply("qual o CPA?", vm(1, { cpaNum: 0 }))
    expect(r).toContain("R$ 0.00")
  })

  it("com dado presente, a resposta segue igual à de antes", () => {
    const r = buildReply("qual o CPA?", vm(1, { cpaNum: 83.33 }))
    expect(r).toContain("83.33")
  })

  it("pergunta sobre escalar com cobertura baixa: não afirma nem nega, diz que falta dado", () => {
    const r = buildReply("vale escalar o investimento?", vm(1, { confidence: "low", coverage: 25 }))
    expect(r.toLowerCase()).toContain("não dá para afirmar")
    expect(r).toContain("25%")
  })

  it("pergunta sobre escalar com status BLUE continua respondendo que sim", () => {
    const r = buildReply("vale escalar o investimento?", vm(1, { status: "BLUE" }))
    expect(r.toLowerCase()).toContain("sim")
  })
})

describe("Comparar — não elege vencedor contra métrica ausente", () => {
  const semCPA = vm(1000, { name: "Sem dado", score: 90 })
  const comCPA = vm(1001, { name: "Com dado", score: 50, cpaNum: 45, roasNum: 3 })

  it("campanha sem CPA não ganha o confronto de 'CPA menor'", () => {
    render(<CompareModal campaigns={[semCPA, comCPA]} onClose={() => {}} />)
    expect(screen.queryByText(/CPA menor/)).toBeNull()
  })

  it("mostra travessão no lugar do valor ausente, nunca R$ 0,00", () => {
    render(<CompareModal campaigns={[semCPA, comCPA]} onClose={() => {}} />)
    expect(screen.queryByText("R$ 0,00")).toBeNull()
    expect(screen.getAllByText("—").length).toBeGreaterThan(0)
  })

  it("com os dois lados preenchidos, o confronto volta a valer", () => {
    const a = vm(1000, { name: "A", score: 90, cpaNum: 20, roasNum: 5, ctrNum: 2 })
    const b = vm(1001, { name: "B", score: 50, cpaNum: 45, roasNum: 3, ctrNum: 1 })
    render(<CompareModal campaigns={[a, b]} onClose={() => {}} />)
    expect(screen.getByText(/CPA menor/)).toBeTruthy()
  })

  it("janela de escala não é descrita como problema que 'merece atenção'", () => {
    // Achado na validação visual: `scenarios[0]` pegava o Cenário G — cuja ação
    // é "aumentar orçamento agora" — e o veredito dizia que a campanha "merece
    // atenção antes de receber mais verba". O texto invertia o diagnóstico.
    const vencedora = vm(1000, { name: "A", score: 100, confidence: "high" })
    const comEscala = vm(1001, {
      name: "B", score: 92, confidence: "high",
      scenarios: [{ code: "G", title: "Janela de Escala Vertical Ativa", root_cause: "", funnel_impact: "", action: "", priority: 1 }]
    })
    render(<CompareModal campaigns={[vencedora, comEscala]} onClose={() => {}} />)
    expect(screen.queryByText(/merece atenção antes de receber mais verba/)).toBeNull()
    expect(screen.getByText(/está saudável, mas com margem menor/)).toBeTruthy()
  })

  it("cenário de problema continua sendo apontado", () => {
    const vencedora = vm(1000, { name: "A", score: 100, confidence: "high" })
    const comFadiga = vm(1001, {
      name: "B", score: 40, confidence: "high",
      scenarios: [{ code: "E", title: "Fadiga de Criativo", root_cause: "", funnel_impact: "", action: "", priority: 1 }]
    })
    render(<CompareModal campaigns={[vencedora, comFadiga]} onClose={() => {}} />)
    expect(screen.getByText(/merece atenção antes de receber mais verba/)).toBeTruthy()
  })

  it("vitória por score com cobertura baixa vem com ressalva", () => {
    // Uma campanha medida por 1 métrica pode marcar 100 e "ganhar" de outra
    // medida inteira. Vence por falta de dado, não por performance.
    const poucoDado = vm(1000, { name: "A", score: 100, confidence: "low", coverage: 25 })
    const bemMedida = vm(1001, { name: "B", score: 92, confidence: "high", coverage: 85, cpaNum: 40 })
    render(<CompareModal campaigns={[poucoDado, bemMedida]} onClose={() => {}} />)
    expect(screen.getByText(/Ressalva:/)).toBeTruthy()
    expect(screen.getByText(/25%/)).toBeTruthy()
  })

  it("sem cobertura baixa, o veredito não carrega ressalva", () => {
    const a = vm(1000, { name: "A", score: 100, confidence: "high", coverage: 90 })
    const b = vm(1001, { name: "B", score: 50, confidence: "high", coverage: 85 })
    render(<CompareModal campaigns={[a, b]} onClose={() => {}} />)
    expect(screen.queryByText(/Ressalva:/)).toBeNull()
  })

  it("o rótulo não promete IA — o veredito é uma função local", () => {
    render(<CompareModal campaigns={[semCPA, comCPA]} onClose={() => {}} />)
    expect(screen.queryByText(/veredito da IA/i)).toBeNull()
    expect(screen.getByText(/veredito comparativo/i)).toBeTruthy()
  })
})

describe("Resumo — média não é diluída por campanha sem a métrica", () => {
  /** O tile financeiro quebra o texto em nós ("R$ " + valor); lemos o bloco. */
  const cpaMedio = (c: HTMLElement) =>
    c.querySelector(".fin:nth-child(4) .fv")?.textContent?.trim()

  it("campanha viva sem CPA não puxa o CPA médio para baixo", () => {
    const { container } = render(
      <Summary campaigns={[vm(1000, { cpaNum: 40, roasNum: 4 }), vm(1001)]} />
    )
    // Média entre {40}, e não entre {40, 0} — que daria R$ 20.
    expect(cpaMedio(container)).toBe("R$ 40")
  })

  it("nenhuma campanha com a métrica → média zerada, sem divisão por zero", () => {
    const { container } = render(<Summary campaigns={[vm(1000), vm(1001)]} />)
    expect(cpaMedio(container)).toBe("R$ 0")
  })

  it("zero medido entra na média normalmente", () => {
    const { container } = render(
      <Summary campaigns={[vm(1000, { cpaNum: 0 }), vm(1001, { cpaNum: 40 })]} />
    )
    expect(cpaMedio(container)).toBe("R$ 20")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NG-T02 — abrir uma campanha não pode cair no rodapé
// ─────────────────────────────────────────────────────────────────────────────

describe("NG-T02 — detalhe abre no topo, não no Copiloto", () => {
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("montar o Copiloto não rola a página", () => {
    render(<Copilot c={vm(1)} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("abrir o detalhe da campanha não rola a página", () => {
    render(<CampaignDetail c={vm(1)} onBack={() => {}} />)
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("o cabeçalho e o botão Voltar estão presentes ao abrir", () => {
    render(<CampaignDetail c={vm(1, { name: "Minha Campanha" })} onBack={() => {}} />)
    expect(screen.getByText("Voltar")).toBeTruthy()
    expect(screen.getByText("Minha Campanha")).toBeTruthy()
  })

  it("depois de perguntar algo, aí sim rola até a resposta", () => {
    render(<Copilot c={vm(1)} />)
    fireEvent.click(screen.getByText("O que eu faço agora?"))
    expect(scrollIntoView).toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NG-T04 — rótulo de IA só quando houve IA
// ─────────────────────────────────────────────────────────────────────────────

describe("NG-T04 — atribuição honesta ao engine e à IA", () => {
  it("sem ai_insights, o VM marca hasAI=false", () => {
    expect(responseToVM(resposta(), entrada()).hasAI).toBe(false)
  })

  it("com ai_insights, o VM marca hasAI=true", () => {
    const v = responseToVM(
      resposta({
        ai_insights: {
          executive_summary: "resumo da IA",
          extra_scenarios: [],
          contextual_insights: [],
          risk_warnings: []
        }
      }),
      entrada()
    )
    expect(v.hasAI).toBe(true)
  })

  it("sem IA, a seção não se chama 'Diagnóstico IA' nem exibe o selo", () => {
    render(<CampaignDetail c={vm(1)} onBack={() => {}} />)
    expect(screen.queryByText(/Diagnóstico IA/i)).toBeNull()
    expect(screen.queryByText(/complementado por IA/i)).toBeNull()
    expect(screen.getByText(/^Diagnóstico$/)).toBeTruthy()
  })

  it("com IA, o selo aparece", () => {
    render(<CampaignDetail c={vm(1, { hasAI: true })} onBack={() => {}} />)
    expect(screen.getByText(/complementado por IA/i)).toBeTruthy()
  })

  it("campanha antiga do localStorage (sem o campo) não promete IA", () => {
    const antiga = vm(1)
    delete (antiga as unknown as Record<string, unknown>).hasAI
    render(<CampaignDetail c={antiga} onBack={() => {}} />)
    expect(screen.queryByText(/complementado por IA/i)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NG-T03 no frontend — typo de plataforma não pode virar Meta Ads em silêncio
// ─────────────────────────────────────────────────────────────────────────────

describe("parseFileJSON — plataforma e objetivo são listas fechadas", () => {
  it("typo de plataforma é reportado, não aceito calado", () => {
    const r = parseFileJSON(JSON.stringify({ campaign: { platform: "googel_ads" } }))
    expect("error" in r).toBe(false)
    if ("error" in r) return
    expect(r.invalidValueKeys.join(" ")).toContain("campaign.platform")
    expect(r.invalidValueKeys.join(" ")).toContain("googel_ads")
    expect(r.input.campaign.platform).toBe("meta_ads")
  })

  it("objetivo inválido é reportado", () => {
    const r = parseFileJSON(JSON.stringify({ campaign: { objective: "banana" } }))
    if ("error" in r) throw new Error("não deveria falhar")
    expect(r.invalidValueKeys.join(" ")).toContain("campaign.objective")
    expect(r.input.campaign.objective).toBe("conversion")
  })

  it("valores válidos passam sem aviso", () => {
    const r = parseFileJSON(
      JSON.stringify({ campaign: { platform: "google_ads", objective: "lead" } })
    )
    if ("error" in r) throw new Error("não deveria falhar")
    expect(r.invalidValueKeys).toEqual([])
    expect(r.input.campaign.platform).toBe("google_ads")
    expect(r.input.campaign.objective).toBe("lead")
  })

  it("ausência dos campos usa o default sem virar aviso", () => {
    const r = parseFileJSON(JSON.stringify({ metrics: { cpa: 10 } }))
    if ("error" in r) throw new Error("não deveria falhar")
    expect(r.invalidValueKeys).toEqual([])
    expect(r.input.campaign.platform).toBe("meta_ads")
  })

  it("tipo errado (número onde esperava string) também é reportado", () => {
    const r = parseFileJSON(JSON.stringify({ campaign: { platform: 42 } }))
    if ("error" in r) throw new Error("não deveria falhar")
    expect(r.invalidValueKeys.join(" ")).toContain("campaign.platform")
  })

  it("array na raiz é rejeitado com mensagem de erro", () => {
    expect("error" in parseFileJSON("[1,2,3]")).toBe(true)
  })
})
