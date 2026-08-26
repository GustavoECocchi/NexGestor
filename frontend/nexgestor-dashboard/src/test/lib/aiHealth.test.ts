import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  _resetarSaudeIA,
  assinarSaudeIA,
  lerSaudeIA,
  registrarAnalise,
  registrarStatusServidor
} from "~lib/aiHealth"
import { estadoDaIA, type StatusServidor } from "~lib/api"

const comIA: StatusServidor = {
  ai: { enabled: true, available: true, model: "m" },
  persistence: { enabled: false }
}
const semIA: StatusServidor = {
  ai: { enabled: true, available: false, model: "m" },
  persistence: { enabled: false }
}

beforeEach(() => _resetarSaudeIA())

describe("registrarAnalise — só acusa o que é falha de verdade", () => {
  it("marca 'falhou' quando o servidor prometeu IA e ela não veio", () => {
    // É o caso que o módulo existe para pegar: chave revogada ou cota
    // estourada respondem `available: true` no /status.
    registrarStatusServidor(true)
    registrarAnalise(false)
    expect(lerSaudeIA()).toBe("falhou")
  })

  it("marca 'ok' quando prometeu e entregou", () => {
    registrarStatusServidor(true)
    registrarAnalise(true)
    expect(lerSaudeIA()).toBe("ok")
  })

  it("ignora a análise quando o servidor diz que NÃO tem IA", () => {
    // O selo já mostra "IA off". Acusar falha aqui seria alarme sobre um
    // estado que todo mundo já conhece.
    registrarStatusServidor(false)
    registrarAnalise(false)
    expect(lerSaudeIA()).toBeNull()
  })

  it("ignora a análise enquanto não soubermos o que o servidor oferece", () => {
    registrarAnalise(false)
    expect(lerSaudeIA()).toBeNull()
  })

  it("volta a 'ok' quando a análise seguinte traz IA — a falha não gruda", () => {
    registrarStatusServidor(true)
    registrarAnalise(false)
    expect(lerSaudeIA()).toBe("falhou")
    registrarAnalise(true)
    expect(lerSaudeIA()).toBe("ok")
  })

  it("limpa a falha se o servidor passar a declarar a IA desligada", () => {
    // Deixou de ser "prometeu e não entregou"; virou "está desligada".
    registrarStatusServidor(true)
    registrarAnalise(false)
    registrarStatusServidor(false)
    expect(lerSaudeIA()).toBeNull()
  })
})

describe("assinatura", () => {
  it("avisa os inscritos quando o estado muda", () => {
    const cb = vi.fn()
    assinarSaudeIA(cb)
    registrarStatusServidor(true)
    registrarAnalise(false)
    expect(cb).toHaveBeenCalledWith("falhou")
  })

  it("não avisa quando o estado repete — não acorda a UI à toa", () => {
    registrarStatusServidor(true)
    registrarAnalise(true)
    const cb = vi.fn()
    assinarSaudeIA(cb)
    registrarAnalise(true)
    expect(cb).not.toHaveBeenCalled()
  })

  it("cancelar a assinatura para de notificar", () => {
    const cb = vi.fn()
    const cancelar = assinarSaudeIA(cb)
    cancelar()
    registrarStatusServidor(true)
    registrarAnalise(false)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe("estadoDaIA — observação vence declaração", () => {
  it("'falhando' quando o servidor promete mas a análise não entregou", () => {
    expect(estadoDaIA(comIA, "falhou")).toBe("falhando")
  })

  it("'on' quando promete e a última análise entregou", () => {
    expect(estadoDaIA(comIA, "ok")).toBe("on")
  })

  it("'on' quando promete e nada foi observado ainda", () => {
    expect(estadoDaIA(comIA, null)).toBe("on")
  })

  it("'off' vence qualquer observação — servidor sem IA não está 'falhando'", () => {
    expect(estadoDaIA(semIA, "falhou")).toBe("off")
  })

  it("'desconhecido' quando não deu para falar com o servidor", () => {
    expect(estadoDaIA(null, "falhou")).toBe("desconhecido")
  })

  it("sem o argumento de saúde, mantém o comportamento anterior", () => {
    expect(estadoDaIA(comIA)).toBe("on")
    expect(estadoDaIA(semIA)).toBe("off")
  })
})
