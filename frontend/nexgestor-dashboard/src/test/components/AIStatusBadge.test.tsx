import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AIStatusBadge, TEXTO_IA } from "~components/AIStatusBadge"
import { _resetarSaudeIA, registrarAnalise } from "~lib/aiHealth"
import type { StatusServidor } from "~lib/api"

const ligada: StatusServidor = {
  ai: { enabled: true, available: true, model: "gemini-flash-lite-latest" },
  persistence: { enabled: true }
}
const desligada: StatusServidor = {
  ai: { enabled: true, available: false, model: "gemini-flash-lite-latest" },
  persistence: { enabled: true }
}

describe("AIStatusBadge — o que o selo mostra", () => {
  it("mostra 'IA on' quando o servidor diz que a IA está ativa", async () => {
    render(<AIStatusBadge buscar={async () => ligada} />)
    expect(await screen.findByRole("button", { name: /ativa/i })).toHaveTextContent("IA on")
  })

  it("mostra 'IA off' quando a IA não está disponível", async () => {
    render(<AIStatusBadge buscar={async () => desligada} />)
    expect(await screen.findByRole("button", { name: /desligada/i })).toHaveTextContent("IA off")
  })

  it("mostra 'IA ?' quando o servidor não respondeu", async () => {
    // Servidor antigo (404 em /status) ou fora do ar. Afirmar "off" aqui seria
    // inventar — o selo precisa dizer que não sabe.
    render(<AIStatusBadge buscar={async () => null} />)
    expect(await screen.findByRole("button", { name: /não foi possível/i })).toHaveTextContent("IA ?")
  })

  it("nasce em 'desconhecido' antes da resposta chegar", () => {
    // Sem isto o selo piscaria "IA off" durante a busca, afirmando algo que
    // ainda não foi verificado.
    render(<AIStatusBadge buscar={() => new Promise(() => {})} />)
    expect(screen.getByRole("button")).toHaveTextContent("IA ?")
  })

  it("uma falha na busca não derruba o cabeçalho", async () => {
    render(<AIStatusBadge buscar={async () => { throw new Error("boom") }} />)
    // O componente continua montado; o estado permanece o inicial honesto.
    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("IA ?"))
  })
})

describe("AIStatusBadge — explicação ao clicar", () => {
  it("abre e fecha o painel de detalhe", async () => {
    render(<AIStatusBadge estadoInicial="off" />)

    expect(screen.queryByRole("dialog")).toBeNull()
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("explica que o diagnóstico saiu só do engine quando a IA está off", async () => {
    render(<AIStatusBadge estadoInicial="off" />)
    fireEvent.click(screen.getByRole("button"))

    // O texto precisa dizer as duas coisas: que falta a IA E que a análise
    // continua válida — senão o selo vira alarme sobre o produto inteiro.
    const pop = screen.getByRole("dialog")
    expect(pop).toHaveTextContent(/engine de regras/i)
    expect(pop).toHaveTextContent(/continua completo/i)
  })

  it("Escape fecha o painel", async () => {
    render(<AIStatusBadge estadoInicial="on" />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("mostra o modelo quando a IA está ligada", async () => {
    render(<AIStatusBadge buscar={async () => ligada} />)
    await screen.findByText("IA on")
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("dialog")).toHaveTextContent("gemini-flash-lite-latest")
  })

  it("NÃO mostra o modelo quando a IA está desligada", async () => {
    // Exibir o modelo com a IA off sugeriria que ele está em uso.
    render(<AIStatusBadge buscar={async () => desligada} />)
    await screen.findByText("IA off")
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("dialog")).not.toHaveTextContent("gemini-flash-lite-latest")
  })
})

describe("AIStatusBadge — acessibilidade", () => {
  it("o nome acessível já responde 'a IA está ligada?' sem clique", async () => {
    render(<AIStatusBadge buscar={async () => ligada} />)
    const btn = await screen.findByRole("button", { name: /camada de ia ativa/i })
    expect(btn).toHaveAttribute("aria-expanded", "false")
  })

  it("aria-expanded acompanha o painel", async () => {
    render(<AIStatusBadge estadoInicial="on" />)
    const btn = screen.getByRole("button")
    fireEvent.click(btn)
    expect(btn).toHaveAttribute("aria-expanded", "true")
  })
})

describe("TEXTO_IA", () => {
  it("os três estados têm rótulo e explicação", () => {
    for (const estado of ["on", "off", "desconhecido"] as const) {
      expect(TEXTO_IA[estado].rotulo).toBeTruthy()
      expect(TEXTO_IA[estado].detalhe.length).toBeGreaterThan(30)
    }
  })
})

describe("AIStatusBadge — reage a uma análise que revela a IA quebrada", () => {
  it("cai para 'IA falhando' quando o servidor prometeu e a análise não entregou", async () => {
    _resetarSaudeIA()
    render(<AIStatusBadge buscar={async () => ligada} />)
    await screen.findByText("IA on")

    // Simula o que o NewCampaignModal faz ao receber uma resposta sem IA.
    await act(async () => {
      registrarAnalise(false)
    })
    expect(screen.getByRole("button")).toHaveTextContent("IA falhando")
  })

  it("volta sozinho para 'IA on' quando a análise seguinte traz IA", async () => {
    _resetarSaudeIA()
    render(<AIStatusBadge buscar={async () => ligada} />)
    await screen.findByText("IA on")

    await act(async () => { registrarAnalise(false) })
    expect(screen.getByRole("button")).toHaveTextContent("IA falhando")

    await act(async () => { registrarAnalise(true) })
    expect(screen.getByRole("button")).toHaveTextContent("IA on")
  })

  it("NÃO vira 'falhando' se o servidor já dizia que a IA está off", async () => {
    _resetarSaudeIA()
    render(<AIStatusBadge buscar={async () => desligada} />)
    await screen.findByText("IA off")

    await act(async () => { registrarAnalise(false) })
    expect(screen.getByRole("button")).toHaveTextContent("IA off")
  })

  it("explica que a falha não é dos dados do gestor", async () => {
    _resetarSaudeIA()
    render(<AIStatusBadge buscar={async () => ligada} />)
    await screen.findByText("IA on")
    await act(async () => { registrarAnalise(false) })

    fireEvent.click(screen.getByRole("button"))
    const pop = screen.getByRole("dialog")
    expect(pop).toHaveTextContent(/nenhuma delas tem a ver com os seus dados/i)
    expect(pop).toHaveTextContent(/engine continua válido/i)
  })
})
