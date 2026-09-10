// =============================================================================
// P5 — bloqueio de dados contraditórios na criação de campanha.
//
// Integração na fronteira HTTP (mesmo padrão de App.benchmark.http.test.tsx):
// só `fetch` é mockado; o parse real de `lib/api.ts` e a renderização real do
// modal são exercitados.
//
// Correções da revisão Codex cobertas aqui:
//   • 08/09, achado 4 — importação descartava valor inválido de campo de P5;
//   • 08/09, achado 5 — qualquer edição apagava o alerta, mesmo continuando errado;
//   • 09/09, achado 4 — `normalizaCampo` ARREDONDAVA antes de qualquer
//     verificação, nos dois modos: `link_clicks: -0.4` virava `-0` (JSON `0`),
//     que o backend aceita enquanto recusa o valor original. Erro virava valor
//     válido, não só ausência.
// =============================================================================
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { NewCampaignModal } from "~components/NewCampaignModal"

const MENSAGEM_CTR =
  "A taxa de cliques no link não combina com os números informados. Você informou " +
  "que o anúncio apareceu 100 vezes e que houve 50 cliques no link. Isso significa " +
  "50 cliques no link a cada 100 vezes que o anúncio apareceu: uma taxa de 50%. " +
  "Mas o campo 'CTR link (%)' está preenchido com 0,4%. Esse valor significa apenas " +
  "4 cliques no link a cada 1.000 vezes que o anúncio apareceu. Confira os campos " +
  "'Impressões', 'Cliques no link' e 'CTR link (%)' para que os números combinem."

const CORPO_422 = {
  detail: {
    message: "Os dados informados têm contradições que impedem a análise.",
    field_errors: [{ fields: ["impressions", "link_clicks", "ctr_link"], message: MENSAGEM_CTR }]
  }
}

const CORPO_422_DOIS = {
  detail: {
    message: "Os dados informados têm contradições que impedem a análise.",
    field_errors: [
      { fields: ["impressions", "link_clicks", "ctr_link"], message: MENSAGEM_CTR },
      { fields: ["impressions", "hook_rate"], message: "Problema separado no Hook rate." }
    ]
  }
}

const ANALISE_OK = {
  campaign_id: 1, campaign_name: "C", final_status: "GREEN",
  overall_score: 90, score_coverage: 80, score_confidence: "high",
  summary: "resumo", scenarios: [], metric_evaluations: [],
  primary_action: "ação", ai_insights: null
}

function resp(status: number, json: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => json }
}

function inputPorLabel(rotulo: string): HTMLInputElement {
  const label = screen.getByText(rotulo, { selector: "label" })
  const input = label.parentElement?.querySelector("input")
  if (!input) throw new Error(`input não encontrado para "${rotulo}"`)
  return input
}

/** Nicho é obrigatório antes de analisar (fase-2b) — sem ele nada chega à API. */
function selecionarNicho() {
  const label = screen.getByText("Nicho", { selector: "label" })
  const select = label.parentElement?.querySelector("select")
  if (!select) throw new Error("select de nicho não encontrado")
  fireEvent.change(select, { target: { value: "ecommerce_varejo" } })
}

function preencherContradicao() {
  selecionarNicho()
  fireEvent.change(inputPorLabel("Impressões"), { target: { value: "100" } })
  fireEvent.change(inputPorLabel("Cliques no link"), { target: { value: "50" } })
  fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "0,4" } })
}

function analisar() {
  fireEvent.click(screen.getByRole("button", { name: "Analisar campanha" }))
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Rejeição vinda do backend
// ─────────────────────────────────────────────────────────────────────────────

describe("P5 — contradição rejeitada pela API", () => {
  it("mostra a explicação, marca os campos citados e não entrega a campanha", async () => {
    fetchMock.mockResolvedValue(resp(422, CORPO_422))
    const onAnalyzed = vi.fn()
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={onAnalyzed} />)

    preencherContradicao()
    analisar()

    const balao = await screen.findByText(/não combinam entre si/i)
    expect(balao.closest('[role="alert"]')).toBeTruthy()
    // A explicação traduz os dois percentuais em quantidade, não só os cita.
    expect(screen.getByText(/50 cliques no link a cada 100 vezes/)).toBeInTheDocument()
    expect(screen.getByText(/apenas 4 cliques no link a cada 1\.000/)).toBeInTheDocument()

    for (const rotulo of ["Impressões", "Cliques no link", "CTR link (%)"]) {
      const input = inputPorLabel(rotulo)
      expect(input.getAttribute("aria-invalid")).toBe("true")
      expect(input.getAttribute("aria-describedby")).toBeTruthy()
    }

    expect(onAnalyzed).not.toHaveBeenCalled()
    expect(inputPorLabel("Impressões")).toHaveValue("100") // valores preservados
  })

  it("dados válidos continuam passando", async () => {
    fetchMock.mockResolvedValue(resp(200, ANALISE_OK))
    const onAnalyzed = vi.fn()
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={onAnalyzed} />)

    selecionarNicho()
    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "100000" } })
    fireEvent.change(inputPorLabel("Cliques no link"), { target: { value: "1500" } })
    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "1,5" } })
    analisar()

    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByText(/não combinam entre si/i)).not.toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado 5 — editar não é corrigir
// ─────────────────────────────────────────────────────────────────────────────

describe("P5 — estado de revalidação após edição", () => {
  it("editar mantém a explicação e avisa que precisa analisar de novo", async () => {
    fetchMock.mockResolvedValue(resp(422, CORPO_422))
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    preencherContradicao()
    analisar()
    await screen.findByText(/não combinam entre si/i)

    // Troca 0,4 por 1,5 mantendo 100 impressões e 50 cliques: continua errado.
    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "1,5" } })

    // O problema NÃO some — some a afirmação de que o campo está inválido.
    expect(screen.getByText(/não combinam entre si/i)).toBeInTheDocument()
    expect(screen.getByText(/Clique em .Analisar campanha./)).toBeInTheDocument()
    for (const rotulo of ["Impressões", "Cliques no link", "CTR link (%)"]) {
      const input = inputPorLabel(rotulo)
      expect(input.getAttribute("aria-invalid")).toBeNull()
      expect(input.getAttribute("aria-describedby")).toBeTruthy() // explicação segue associada
    }
  })

  it("edição que não resolve volta a ser confirmada na próxima análise", async () => {
    fetchMock.mockResolvedValue(resp(422, CORPO_422))
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    preencherContradicao()
    analisar()
    await screen.findByText(/não combinam entre si/i)

    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "1,5" } })
    analisar()

    await waitFor(() =>
      expect(inputPorLabel("CTR link (%)").getAttribute("aria-invalid")).toBe("true")
    )
    expect(screen.queryByText(/Clique em .Analisar campanha./)).not.toBeInTheDocument()
  })

  it("edição que resolve limpa tudo quando a análise passa", async () => {
    fetchMock.mockResolvedValueOnce(resp(422, CORPO_422))
    const onAnalyzed = vi.fn()
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={onAnalyzed} />)
    preencherContradicao()
    analisar()
    await screen.findByText(/não combinam entre si/i)

    fetchMock.mockResolvedValue(resp(200, ANALISE_OK))
    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "50" } })
    analisar()

    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByText(/não combinam entre si/i)).not.toBeInTheDocument()
  })

  it("com dois problemas, editar um não esconde o outro", async () => {
    fetchMock.mockResolvedValue(resp(422, CORPO_422_DOIS))
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    preencherContradicao()
    fireEvent.change(inputPorLabel("Hook rate (%)"), { target: { value: "90" } })
    analisar()
    await screen.findByText(/Problema separado no Hook rate/)

    fireEvent.change(inputPorLabel("Hook rate (%)"), { target: { value: "10" } })

    // O erro do Hook rate fica pendente de revalidação; o do CTR segue confirmado.
    expect(screen.getByText(/Problema separado no Hook rate/)).toBeInTheDocument()
    expect(inputPorLabel("Hook rate (%)").getAttribute("aria-invalid")).toBeNull()
    expect(inputPorLabel("Cliques no link").getAttribute("aria-invalid")).toBe("true")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Achado 4 — valor inválido não pode virar campo ausente NEM valor válido
// ─────────────────────────────────────────────────────────────────────────────

function arquivo(metrics: Record<string, unknown>) {
  return JSON.stringify({
    campaign: { name: "Do arquivo", niche: "ecommerce_varejo" },
    metrics
  })
}

describe("P5 — valor inválido não é descartado nem corrigido", () => {
  function importar(json: string) {
    fireEvent.click(screen.getByRole("button", { name: /Importar arquivo/i }))
    fireEvent.change(screen.getByRole("textbox"), { target: { value: json } })
    fireEvent.click(screen.getByRole("button", { name: /Carregar e revisar/i }))
  }

  it("importação com taxa de P5 em texto bloqueia e explica como corrigir", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    importar(arquivo({ impressions: 100, link_clicks: 50, ctr_link: "0,4" }))

    expect(screen.getByText(/não pode ser analisado como está/i)).toBeInTheDocument()
    expect(screen.getByText(/importe de novo/i)).toBeInTheDocument()
    // Não pode aparecer como "ignorado": o ponto é justamente não descartar.
    expect(screen.queryByText(/ignorados \(não enviados\): metrics\.ctr_link/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("importação com contagem negativa bloqueia em vez de virar zero", () => {
    // Reprodução do Codex: -0.4 em `link_clicks` era arredondado para -0, que
    // sai como 0 no JSON. Com 100 impressões e ctr_link 0, o backend recusava
    // o valor original (int/ge=0) e aceitava o normalizado.
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    importar(arquivo({ impressions: 100, link_clicks: -0.4, ctr_link: 0 }))

    expect(screen.getByText(/não pode ser analisado como está/i)).toBeInTheDocument()
    expect(screen.getByText(/número negativo/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeDisabled()
    // E o valor NÃO aparece convertido para 0 na pré-visualização.
    expect(screen.queryByText("link_clicks")).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("importação com contagem fracionária bloqueia em vez de arredondar", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    importar(arquivo({ impressions: 100.5, link_clicks: 50 }))

    expect(screen.getByText(/não é um número inteiro/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeDisabled()
  })

  it("arquivo inválido, corrigido e reimportado na MESMA tela volta a analisar", async () => {
    fetchMock.mockResolvedValue(resp(200, ANALISE_OK))
    const onAnalyzed = vi.fn()
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={onAnalyzed} />)

    importar(arquivo({ impressions: 100, link_clicks: 50, ctr_link: "0,4" }))
    expect(screen.getByText(/não pode ser analisado como está/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeDisabled()

    // Mesma instância do componente: o usuário corrige o arquivo e reimporta.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: arquivo({ impressions: 100, link_clicks: 50, ctr_link: 50 }) }
    })
    fireEvent.click(screen.getByRole("button", { name: /Carregar e revisar/i }))

    expect(screen.queryByText(/não pode ser analisado como está/i)).not.toBeInTheDocument()
    const botao = screen.getByRole("button", { name: "Analisar campanha" })
    expect(botao).toBeEnabled()
    fireEvent.click(botao)
    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled(), { timeout: 3000 })
  })

  it("campo que não é de P5 continua sendo ignorado com aviso, como antes", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    importar(arquivo({ impressions: 100, roas: "muito" }))

    expect(screen.getByText(/ignorados \(não enviados\)/)).toBeInTheDocument()
    expect(screen.queryByText(/não pode ser analisado como está/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeEnabled()
  })

  it("contagem fracionária FORA de P5 continua sendo arredondada, como antes", () => {
    // Limite declarado do escopo: a regra vale para os campos de P5. `reach`
    // não entra em nenhuma comparação bruto↔taxa e segue o comportamento de
    // sempre — registrado como lacuna delimitada, não como esquecimento.
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    importar(arquivo({ impressions: 100, reach: 80.6 }))

    expect(screen.queryByText(/não pode ser analisado como está/i)).not.toBeInTheDocument()
    expect(screen.getByText("81")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Analisar campanha" })).toBeEnabled()
  })

  it("formulário manual com texto num campo de P5 bloqueia sem chamar a API", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    selecionarNicho()
    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "100" } })
    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "abc" } })
    analisar()

    expect(screen.getByText(/não é um número/)).toBeInTheDocument()
    expect(inputPorLabel("CTR link (%)").getAttribute("aria-invalid")).toBe("true")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("formulário manual com contagem negativa bloqueia e não reescreve o campo", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    selecionarNicho()
    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "100" } })
    fireEvent.change(inputPorLabel("Cliques no link"), { target: { value: "-0,4" } })
    fireEvent.change(inputPorLabel("CTR link (%)"), { target: { value: "0" } })
    analisar()

    expect(screen.getByText(/número negativo/i)).toBeInTheDocument()
    expect(inputPorLabel("Cliques no link").getAttribute("aria-invalid")).toBe("true")
    // O que a pessoa escreveu continua na tela — não virou "0".
    expect(inputPorLabel("Cliques no link")).toHaveValue("-0,4")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("formulário manual com contagem fracionária bloqueia em vez de arredondar", () => {
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={() => {}} />)
    selecionarNicho()
    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "120000,5" } })
    analisar()

    expect(screen.getByText(/não é um número inteiro/i)).toBeInTheDocument()
    expect(inputPorLabel("Impressões")).toHaveValue("120000,5")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("corrigido no formulário, a análise segue normalmente", async () => {
    fetchMock.mockResolvedValue(resp(200, ANALISE_OK))
    const onAnalyzed = vi.fn()
    render(<NewCampaignModal onClose={() => {}} onAnalyzed={onAnalyzed} />)
    selecionarNicho()
    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "120000,5" } })
    analisar()
    expect(screen.getByText(/não é um número inteiro/i)).toBeInTheDocument()

    fireEvent.change(inputPorLabel("Impressões"), { target: { value: "120000" } })
    analisar()
    await waitFor(() => expect(onAnalyzed).toHaveBeenCalled(), { timeout: 3000 })
    expect(screen.queryByText(/não é um número inteiro/i)).not.toBeInTheDocument()
  })
})
