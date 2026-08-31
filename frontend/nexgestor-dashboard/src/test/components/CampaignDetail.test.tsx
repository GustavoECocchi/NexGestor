import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CampaignDetail } from "~components/CampaignDetail"
import type { CampaignVM } from "~types"

afterEach(cleanup)

function vm(overrides: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1001,
    name: "Campanha teste",
    platform: "Meta Ads",
    status: "GREEN",
    score: 80,
    invest: 1000,
    revenue: 4000,
    roasNum: 4,
    cpaNum: 25,
    ctrNum: 1.8,
    freqNum: 1.5,
    m1: { k: "CPA", v: "R$ 25" },
    m2: { k: "CTR Link", v: "1,8%" },
    spark: [80, 80, 80, 80, 80, 80, 80],
    trend: 0,
    ai: "",
    summary: "resumo",
    opportunity: "",
    primaryAction: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    coverage: 67,
    confidence: "medium",
    ...overrides
  }
}

describe("CampaignDetail — explicação de confiança/cobertura (fase-5 §2, achado #2 da auditoria)", () => {
  it("mostra o botão de ajuda junto da linha de confiança/cobertura quando os dois existem", () => {
    render(<CampaignDetail c={vm()} onBack={() => {}} />)
    expect(screen.getByText(/cobertura de dados 67%/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /ajuda: confiança/i })).toBeInTheDocument()
  })

  it("tooltip aparece no hover E no foco, explicando os dois conceitos", () => {
    render(<CampaignDetail c={vm()} onBack={() => {}} />)
    const botao = screen.getByRole("button", { name: /ajuda: confiança/i })

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
    fireEvent.mouseEnter(botao)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/veredito ao pé da letra/i)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/métricas possíveis/i)
    fireEvent.mouseLeave(botao)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

    fireEvent.focus(botao)
    expect(screen.getByRole("tooltip")).toBeInTheDocument()
    fireEvent.blur(botao)
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("campanha sem confidence/coverage (localStorage antigo, ou campanha recém-criada sem esses campos) não mostra o botão — nada para explicar", () => {
    render(<CampaignDetail c={vm({ coverage: undefined, confidence: undefined })} onBack={() => {}} />)
    expect(screen.queryByRole("button", { name: /ajuda: confiança/i })).not.toBeInTheDocument()
  })
})
