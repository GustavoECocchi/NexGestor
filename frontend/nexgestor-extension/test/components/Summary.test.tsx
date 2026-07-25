import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Summary } from "~components/Summary"
import type { CampaignVM } from "~types"

function vm(id: number, overrides: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id,
    name: `Campanha ${id}`,
    platform: "Meta Ads",
    status: "GREEN",
    score: 80,
    invest: 0,
    revenue: 0,
    roasNum: 0,
    cpaNum: 0,
    ctrNum: 0,
    freqNum: 0,
    m1: { k: "CPA", v: "-" },
    m2: { k: "CTR Link", v: "-" },
    spark: [],
    trend: 0,
    ai: "",
    summary: "",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    ...overrides
  }
}

// id < 1000 = campanha de exemplo (mock), id >= 1000 = campanha viva real.
const EXEMPLO_A = vm(1, { status: "RED", invest: 5000, revenue: 2000, roasNum: 0.4, cpaNum: 92 })
const EXEMPLO_B = vm(2, { status: "BLUE", invest: 3000, revenue: 15000, roasNum: 5.2, cpaNum: 24 })

describe("Summary — regressão: dinheiro dos exemplos nunca entra nos totais", () => {
  it("sem campanha viva, os totais financeiros são R$ 0 mesmo com exemplos na tela", () => {
    render(<Summary campaigns={[EXEMPLO_A, EXEMPLO_B]} />)
    // 2 campanhas contadas no título e nos chips (comportamento esperado —
    // ver comentário em Summary.tsx: chips batem com a lista visível).
    expect(screen.getByText("2 campanhas ativas")).toBeInTheDocument()
    expect(screen.getByText("R$ 0", { selector: ".fin:nth-child(1) .fv" })).toBeInTheDocument()
  })

  it("com uma campanha viva, os totais refletem só ela — não a soma com os exemplos", () => {
    const viva = vm(1000, { invest: 1000, revenue: 4000, roasNum: 4, cpaNum: 20 })
    render(<Summary campaigns={[viva, EXEMPLO_A, EXEMPLO_B]} />)

    expect(screen.getByText("3 campanhas ativas")).toBeInTheDocument()
    // R$ 1.000 (só a viva), nunca R$ 9.000 (1000+5000+3000, os exemplos somados junto)
    expect(screen.getByText("R$ 1.000")).toBeInTheDocument()
    expect(screen.queryByText("R$ 9.000")).not.toBeInTheDocument()
    expect(screen.getByText("R$ 4.000")).toBeInTheDocument()
    expect(screen.getByText("4,0x")).toBeInTheDocument()
  })

  it("ROAS/CPA médios dividem só pelas campanhas vivas (liveN), não pelo total na tela", () => {
    const viva1 = vm(1000, { roasNum: 4, cpaNum: 20 })
    const viva2 = vm(1001, { roasNum: 6, cpaNum: 30 })
    render(<Summary campaigns={[viva1, viva2, EXEMPLO_A]} />)
    // média de 4 e 6 = 5,0x (dividido por 2 campanhas vivas, não por 3 na tela)
    expect(screen.getByText("5,0x")).toBeInTheDocument()
  })

  it("chips de status contam TUDO que está na tela, incluindo exemplos — de propósito", () => {
    render(<Summary campaigns={[EXEMPLO_A, EXEMPLO_B]} />)
    expect(screen.getByText("crítico").closest("button")).toHaveTextContent("1")
    expect(screen.getByText("escalável").closest("button")).toHaveTextContent("1")
  })
})

describe("Summary — filtro por chip", () => {
  it("clicar num chip chama onToggle com o status certo", () => {
    const onToggle = vi.fn()
    render(<Summary campaigns={[EXEMPLO_A]} onToggle={onToggle} />)
    fireEvent.click(screen.getByText("crítico").closest("button")!)
    expect(onToggle).toHaveBeenCalledWith("RED")
  })

  it("status sem nenhuma campanha não renderiza chip (evita '0 saudável' etc)", () => {
    render(<Summary campaigns={[EXEMPLO_A]} />)
    expect(screen.queryByText("saudável")).not.toBeInTheDocument()
    expect(screen.queryByText("atenção")).not.toBeInTheDocument()
  })
})

describe("Summary — texto no singular/plural", () => {
  it("1 campanha usa singular", () => {
    render(<Summary campaigns={[vm(1000)]} />)
    expect(screen.getByText("1 campanha ativa")).toBeInTheDocument()
  })

  it("0 campanhas usa plural ('0 campanhas ativas')", () => {
    render(<Summary campaigns={[]} />)
    expect(screen.getByText("0 campanhas ativas")).toBeInTheDocument()
  })
})
