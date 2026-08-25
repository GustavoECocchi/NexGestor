import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Sem isto o DOM do teste anterior fica na página e as buscas por papel/nome
// encontram dois botões "Cancelar" — falha do teste, não do componente.
afterEach(cleanup)

import { CampaignCard } from "~components/CampaignCard"
import type { CampaignVM } from "~types"

/**
 * Apagar campanha — o card inteiro é clicável, então cada elemento novo dentro
 * dele é uma chance de disparar a ação errada. Os testes abaixo cobrem os modos
 * de falha previstos, não só o caminho feliz.
 */

function vm(over: Partial<CampaignVM> = {}): CampaignVM {
  return {
    id: 1001,
    name: "Black Friday",
    platform: "Meta Ads",
    status: "RED",
    score: 30,
    invest: 100,
    revenue: 50,
    roasNum: 0.5,
    cpaNum: 90,
    ctrNum: 0.7,
    freqNum: 3.4,
    m1: { k: "CPA", v: "R$ 90" },
    m2: { k: "ROAS", v: "0,5x" },
    spark: [1, 2, 3],
    trend: -10,
    ai: "texto",
    summary: "",
    opportunity: "",
    tiles: [],
    scenarios: [],
    actions: [],
    sugg: [],
    ...over
  } as CampaignVM
}

const lixeira = () => screen.getByRole("button", { name: /apagar campanha/i })
const botaoApagar = () => screen.getByRole("button", { name: /^apagar$/i })

/**
 * O card tem que responder "o que eu faço agora" com uma ação concreta —
 * nunca com um "não encontramos motivo", que contradiz o próprio status ao
 * lado (se o engine marcou Crítico/Atenção, ele tem um porquê; a pergunta é
 * só QUAL fonte de dado a UI usa pra mostrar esse porquê).
 */
describe("ação do card — sempre concreta, nunca 'motivo não encontrado'", () => {
  it("sem cenário/ação, usa primaryAction (o engine sempre calcula uma, mesmo sem causa raiz nomeada)", () => {
    render(
      <CampaignCard
        c={vm({
          status: "YELLOW",
          scenarios: [],
          actions: [],
          summary: "resumo genérico",
          primaryAction: "Investigar CPC: está em nível crítico sem causa raiz confirmada."
        })}
        index={0}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText(/investigar cpc/i)).toBeTruthy()
    // O resumo genérico não deveria aparecer quando há uma ação mais específica.
    expect(screen.queryByText("resumo genérico")).toBeNull()
  })

  it("BLUE usa a ação do cenário G mesmo se `actions[0]` for outro texto", () => {
    render(
      <CampaignCard
        c={vm({
          status: "BLUE",
          scenarios: [{ code: "G", title: "Escala Vertical", root_cause: "x", funnel_impact: "y", action: "Aumentar orçamento 15%", priority: 2 }],
          actions: [{ title: "Ação genérica", prio: "Alta", why: "w", impact: "i" }],
          primaryAction: "Ação genérica"
        })}
        index={0}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText(/aumentar orçamento 15%/i)).toBeTruthy()
  })

  it("sem primaryAction (dado antigo), cai para actions[0]", () => {
    render(
      <CampaignCard
        c={vm({
          status: "RED",
          primaryAction: "",
          actions: [{ title: "Pausar e revisar rastreamento", prio: "Alta", why: "w", impact: "i" }],
          summary: "não deveria aparecer"
        })}
        index={0}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText(/pausar e revisar rastreamento/i)).toBeTruthy()
  })

  it("sem primaryAction nem actions, cai para summary — nunca para um texto genérico inventado", () => {
    render(
      <CampaignCard
        c={vm({ status: "GREEN", primaryAction: "", actions: [], summary: "Campanha estável, sem gargalo." })}
        index={0}
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText("Campanha estável, sem gargalo.")).toBeTruthy()
  })

  it("sem NENHUM dado, o texto reconhece a ausência de registro — nunca afirma 'motivo não encontrado'", () => {
    render(
      <CampaignCard
        c={vm({ status: "YELLOW", primaryAction: "", actions: [], summary: "" })}
        index={0}
        onOpen={vi.fn()}
      />
    )
    expect(screen.queryByText(/motivo|causa.*n[ãa]o (identificad|encontrad)/i)).toBeNull()
  })
})

describe("lixeira — quando aparece", () => {
  it("não existe em campanha de exemplo (não é de ninguém, volta no reload)", () => {
    render(<CampaignCard c={vm()} index={0} demo onOpen={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /apagar campanha/i })).toBeNull()
  })

  it("não existe quando o pai não passa onDelete", () => {
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /apagar campanha/i })).toBeNull()
  })

  it("tem nome acessível que diz QUAL campanha — importante com vários cards", () => {
    render(<CampaignCard c={vm({ name: "Topo de Funil" })} index={0} onOpen={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Apagar campanha Topo de Funil" })).toBeTruthy()
  })

  it("o card reserva o espaço da lixeira (não empurra layout no hover)", () => {
    const { container } = render(
      <CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={vi.fn()} />
    )
    expect(container.querySelector(".card")?.className).toContain("delible")
  })
})

describe("lixeira — não pode disparar a ação errada", () => {
  it("clicar na lixeira NÃO abre a campanha", () => {
    const onOpen = vi.fn()
    render(<CampaignCard c={vm()} index={0} onOpen={onOpen} onDelete={vi.fn()} />)

    fireEvent.click(lixeira())

    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText(/apagar para todo o time/i)).toBeTruthy()
  })

  it("Enter na lixeira NÃO abre a campanha", () => {
    const onOpen = vi.fn()
    render(<CampaignCard c={vm()} index={0} onOpen={onOpen} onDelete={vi.fn()} />)

    // O card escuta Enter/Espaço para abrir; sem stopPropagation no botão, a
    // tecla subiria e abriria a campanha por baixo da confirmação.
    fireEvent.keyDown(lixeira(), { key: "Enter" })

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("clicar em Apagar ou Cancelar NÃO abre a campanha", async () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(true)
    render(<CampaignCard c={vm()} index={0} onOpen={onOpen} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }))
    expect(onOpen).not.toHaveBeenCalled()

    fireEvent.click(lixeira())
    fireEvent.click(botaoApagar())
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("o card continua abrindo normalmente ao ser clicado fora da lixeira", () => {
    const onOpen = vi.fn()
    render(<CampaignCard c={vm({ id: 1007 })} index={0} onOpen={onOpen} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByText("Black Friday"))
    expect(onOpen).toHaveBeenCalledWith(1007)
  })
})

describe("confirmação — nunca apaga de primeira", () => {
  it("clicar na lixeira não apaga nada sozinho", () => {
    const onDelete = vi.fn()
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    expect(onDelete).not.toHaveBeenCalled()
  })

  it("avisa que apaga para TODO O TIME (a base é compartilhada)", () => {
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={vi.fn()} />)
    fireEvent.click(lixeira())

    // Um "tem certeza?" genérico esconderia a consequência real.
    expect(screen.getByText(/todo o time/i)).toBeTruthy()
  })

  it("Cancelar volta ao estado normal sem apagar", () => {
    const onDelete = vi.fn()
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }))

    expect(onDelete).not.toHaveBeenCalled()
    expect(lixeira()).toBeTruthy()
  })

  it("Escape cancela", () => {
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(lixeira())
    fireEvent.keyDown(screen.getByText(/todo o time/i).closest(".card-del-confirm")!, { key: "Escape" })

    expect(lixeira()).toBeTruthy()
  })

  it("confirmar chama onDelete com o id certo", async () => {
    const onDelete = vi.fn().mockResolvedValue(true)
    render(<CampaignCard c={vm({ id: 1042 })} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(botaoApagar())

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1042))
  })
})

describe("durante e depois da tentativa", () => {
  it("enquanto apaga, os botões ficam desabilitados (sem duplo clique)", async () => {
    let resolver: (v: boolean) => void = () => {}
    const onDelete = vi.fn(() => new Promise<boolean>((r) => (resolver = r)))
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(screen.getByRole("button", { name: /^apagar$/i }))

    const apagando = await screen.findByRole("button", { name: /apagando/i })
    expect(apagando).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancelar/i })).toBeDisabled()

    // segundo clique não dispara outra chamada
    fireEvent.click(apagando)
    expect(onDelete).toHaveBeenCalledTimes(1)

    resolver(true)
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
  })

  it("falha ao apagar: avisa e MANTÉM a confirmação aberta", async () => {
    const onDelete = vi.fn().mockResolvedValue(false)
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(botaoApagar())

    // Fechar em caso de falha daria a impressão de que apagou.
    expect(await screen.findByText(/não foi possível apagar/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^apagar$/i })).not.toBeDisabled()
  })

  it("exceção inesperada não deixa o card preso em 'Apagando…'", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("pane"))
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(botaoApagar())

    expect(await screen.findByText(/não foi possível apagar/i)).toBeTruthy()
    expect(screen.queryByRole("button", { name: /apagando/i })).toBeNull()
  })

  it("tentar de novo depois de falhar limpa a mensagem de erro", async () => {
    const onDelete = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    render(<CampaignCard c={vm()} index={0} onOpen={vi.fn()} onDelete={onDelete} />)

    fireEvent.click(lixeira())
    fireEvent.click(botaoApagar())
    expect(await screen.findByText(/não foi possível apagar/i)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /^apagar$/i }))
    await waitFor(() => expect(screen.queryByText(/não foi possível apagar/i)).toBeNull())
  })
})
