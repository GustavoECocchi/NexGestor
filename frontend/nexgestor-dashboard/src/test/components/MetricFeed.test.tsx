import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { MetricFeed } from "~components/MetricFeed"
import type { CampaignVM, Tile } from "~types"

afterEach(cleanup)

function vm(tiles: Tile[], overrides: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1,
    name: "Campanha teste",
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
    summary: "O criativo saturou e o CPA sobe a cada dia.",
    opportunity: "",
    primaryAction: "",
    tiles,
    scenarios: [],
    actions: [],
    sugg: [],
    ...overrides
  }
}

const tilesCompletos: Tile[] = [
  ["CPA", "R$ 150,00", "var(--red)", "150% acima da meta.", "gestor", 20],
  ["ROAS", "0,8x", "var(--red)", "Abaixo da meta.", "gestor", 15],
  ["Investimento", "R$ 1.000", "var(--txt)", "período informado"],
  ["Receita", "R$ 800", "var(--txt)", "spend × ROAS"],
  ["Hook Rate", "10,0%", "var(--red)", "Crítico — abertura fraca.", "sistema", 12],
  ["Hold Rate", "8,0%", "var(--red)", "Abandono antes da CTA.", "gestor", 18],
  ["CTR Link", "0,9%", "var(--txt-2)", "Abaixo do esperado.", "sistema", 30],
  ["Conversão LP", "40,0%", "var(--green)", "LP convertendo bem.", "gestor", 85],
  ["CPM", "R$ 20,00", "var(--txt-2)", "Leilão eficiente.", "sistema", 90],
  ["Frequência", "4,0", "var(--red)", "Saturação.", "gestor", 10]
]

describe("MetricFeed — Faixa de resultado", () => {
  it("mostra CPA, ROAS, Investimento e Receita, nessa ordem", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    const rotulos = screen.getAllByText(/^(CPA|ROAS|Investimento|Receita)$/, { selector: ".rk" }).map((e) => e.textContent)
    expect(rotulos).toEqual(["CPA", "ROAS", "Investimento", "Receita"])
  })

  it("CPA/ROAS fora da meta (cor vermelha) ganham a classe de alerta", () => {
    const { container } = render(<MetricFeed c={vm(tilesCompletos)} />)
    const cards = [...container.querySelectorAll(".result-card")]
    const cpaCard = cards.find((el) => el.querySelector(".rk")?.textContent === "CPA")
    const investCard = cards.find((el) => el.querySelector(".rk")?.textContent === "Investimento")
    expect(cpaCard).toHaveClass("result-alert")
    expect(investCard).not.toHaveClass("result-alert")
  })

  it("métrica de resultado ausente na análise simplesmente não aparece (não inventa card)", () => {
    const semROAS = tilesCompletos.filter((t) => t[0] !== "ROAS")
    render(<MetricFeed c={vm(semROAS)} />)
    expect(screen.queryByText("ROAS", { selector: ".rk" })).not.toBeInTheDocument()
  })

  it("mantém a frase de diagnóstico no card (pedido explícito do rascunho: não cortar)", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    expect(screen.getByText("150% acima da meta.")).toBeInTheDocument()
  })
})

describe("MetricFeed — Painel do funil", () => {
  it("renderiza barras só para as 4 métricas do funil presentes, na ordem do funil", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    const rotulos = screen.getAllByText(/^(Hook Rate|Hold Rate|CTR Link|Conversão LP)$/, { selector: ".fb-lbl" })
      .map((e) => e.textContent)
    expect(rotulos).toEqual(["Hook Rate", "Hold Rate", "CTR Link", "Conversão LP"])
  })

  it("altura da barra reflete o score do engine (não um número novo)", () => {
    const { container } = render(<MetricFeed c={vm(tilesCompletos)} />)
    const barras = [...container.querySelectorAll(".funnel-bar")]
    const hook = barras.find((b) => b.querySelector(".fb-lbl")?.textContent === "Hook Rate")
    const conv = barras.find((b) => b.querySelector(".fb-lbl")?.textContent === "Conversão LP")
    expect((hook!.querySelector(".fb-col") as HTMLElement).style.height).toBe("12%")
    expect((conv!.querySelector(".fb-col") as HTMLElement).style.height).toBe("85%")
  })

  it("mostra UMA frase de diagnóstico consolidada, separada por hairline", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    expect(screen.getByText("O criativo saturou e o CPA sobe a cada dia.")).toBeInTheDocument()
  })

  it("sem nenhuma métrica de funil, mostra estado vazio em vez de painel em branco", () => {
    const semFunil = tilesCompletos.filter((t) => !["Hook Rate", "Hold Rate", "CTR Link", "Conversão LP"].includes(t[0]))
    render(<MetricFeed c={vm(semFunil)} />)
    expect(screen.getByText(/nenhuma métrica de funil/i)).toBeInTheDocument()
  })
})

describe("MetricFeed — Coluna de ações", () => {
  const acoes = [
    { title: "Ação 1", prio: "Alta" as const, why: "Motivo 1", impact: "Impacto 1" },
    { title: "Ação 2", prio: "Alta" as const, why: "Motivo 2", impact: "Impacto 2" },
    { title: "Ação 3", prio: "Média" as const, why: "Motivo 3", impact: "Impacto 3" },
    { title: "Ação 4", prio: "Média" as const, why: "Motivo 4", impact: "Impacto 4" },
    { title: "Ação 5", prio: "Baixa" as const, why: "Motivo 5", impact: "Impacto 5" }
  ]

  it("mostra no máximo 4 ações, na ordem que já vem do engine (por severidade)", () => {
    render(<MetricFeed c={vm(tilesCompletos, { actions: acoes })} />)
    expect(screen.getByText("Ação 1")).toBeInTheDocument()
    expect(screen.getByText("Ação 4")).toBeInTheDocument()
    expect(screen.queryByText("Ação 5")).not.toBeInTheDocument()
  })

  it("cada ação mostra a métrica/causa que a justificou", () => {
    render(<MetricFeed c={vm(tilesCompletos, { actions: [acoes[0]] })} />)
    expect(screen.getByText("Motivo 1")).toBeInTheDocument()
  })

  it("sem ações, mostra estado vazio", () => {
    render(<MetricFeed c={vm(tilesCompletos, { actions: [] })} />)
    expect(screen.getByText(/nenhuma ação prioritária/i)).toBeInTheDocument()
  })
})

describe("MetricFeed — Métricas de contexto", () => {
  it("mostra as métricas que NÃO estão na Faixa nem no Funil, só label + valor (sem nota)", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    expect(screen.getByText("CPM")).toBeInTheDocument()
    expect(screen.getByText("Frequência")).toBeInTheDocument()
    expect(screen.queryByText("Leilão eficiente.")).not.toBeInTheDocument()
  })

  it("não repete uma métrica que já apareceu na Faixa ou no Funil", () => {
    const { container } = render(<MetricFeed c={vm(tilesCompletos)} />)
    // "CPA" só deve existir uma vez no documento inteiro (Faixa), nunca também no Contexto.
    const cpaNoContexto = container.querySelector(".context-grid")?.textContent?.includes("CPA")
    expect(cpaNoContexto).toBe(false)
  })
})

describe("MetricFeed — banner único de 'meta padrão do sistema'", () => {
  it("conta as métricas com origem 'sistema' em QUALQUER linha do feed, não só uma", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    // Hook Rate, CTR Link e CPM são "sistema" no fixture = 3.
    expect(screen.getByText(/3 métricas usando meta padrão do sistema/i)).toBeInTheDocument()
  })

  it("singular quando é só 1", () => {
    const umaSo: Tile[] = tilesCompletos.map((t) =>
      t[0] === "CTR Link" || t[0] === "CPM" ? ([t[0], t[1], t[2], t[3], "gestor", t[5]] as Tile) : t
    )
    render(<MetricFeed c={vm(umaSo)} />)
    expect(screen.getByText(/1 métrica usando meta padrão do sistema/i)).toBeInTheDocument()
  })

  it("sem nenhuma métrica 'sistema', não mostra banner", () => {
    const semSistema: Tile[] = tilesCompletos.map((t) =>
      t[4] === "sistema" ? ([t[0], t[1], t[2], t[3], "gestor", t[5]] as Tile) : t
    )
    render(<MetricFeed c={vm(semSistema)} />)
    expect(screen.queryByText(/meta padrão do sistema/i)).not.toBeInTheDocument()
  })

  it("não repete mais o aviso individual por card (era o comportamento antigo do §11)", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    // Antes cada card "sistema" tinha sua própria frase "Meta padrão do sistema — você não personalizou este valor."
    expect(screen.queryByText("Meta padrão do sistema — você não personalizou este valor.")).not.toBeInTheDocument()
  })
})

describe("MetricFeed — explicação por métrica (fase-5 §3, achado #1 da auditoria — o de maior impacto)", () => {
  // Antes desta mudança, nenhum rótulo do feed (fora do formulário de
  // criação) tinha explicação — alguém que preencheu o formulário há dias e
  // volta pra ver "CPA R$150" aqui não tinha mais nenhuma pista do que
  // aquilo significa.
  it("Faixa de resultado: cada métrica tem um botão de ajuda com o texto certo", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    const botao = screen.getByRole("button", { name: /ajuda: quanto custou, em média, cada conversão/i })
    fireEvent.mouseEnter(botao)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/quanto custou, em média, cada conversão/i)
  })

  it("Painel do funil: cada barra tem um botão de ajuda", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    const botao = screen.getByRole("button", { name: /ajuda: de quem viu o anúncio, quantos assistiram/i })
    fireEvent.focus(botao)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/mede se o começo prende atenção/i)
  })

  it("Métricas de contexto: cada card tem um botão de ajuda", () => {
    render(<MetricFeed c={vm(tilesCompletos)} />)
    const botao = screen.getByRole("button", { name: /ajuda: quanto você paga a cada 1\.000 exibições/i })
    fireEvent.mouseEnter(botao)
    expect(screen.getByRole("tooltip")).toHaveTextContent(/quanto você paga a cada 1\.000 exibições/i)
  })

  it("mesmo texto do formulário de criação — não inventa uma segunda redação para o mesmo termo", () => {
    // Texto exato de NewCampaignModal.tsx, FIELDS_DELIVERY (CPA).
    render(<MetricFeed c={vm(tilesCompletos)} />)
    expect(
      screen.getByRole("button", { name: "Ajuda: Quanto custou, em média, cada conversão (venda, cadastro etc.) gerada." })
    ).toBeInTheDocument()
  })

  it("uma métrica sem hint cadastrado não quebra o card, só não mostra o botão", () => {
    const semHint: Tile[] = [["Métrica Nova", "10", "var(--txt)", "nota", "gestor", 50]]
    render(<MetricFeed c={vm(semHint)} />)
    expect(screen.getByText("Métrica Nova")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /ajuda/i })).not.toBeInTheDocument()
  })
})
