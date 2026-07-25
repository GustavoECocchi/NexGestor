import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { useTheme } from "~lib/theme"

/**
 * Fake `matchMedia` que permite disparar "mudança de tema do SO" nos testes.
 * Sempre retorna a MESMA instância (não uma nova por chamada) — é assim que
 * o hook e este mock enxergam o mesmo estado de `matches`.
 */
function mockMatchMedia(initialMatchesLight: boolean) {
  let matches = initialMatchesLight
  const listeners: Array<() => void> = []
  const mql = {
    get matches() {
      return matches
    },
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: (_: string, cb: () => void) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }
  }
  ;(window as unknown as { matchMedia: (q: string) => typeof mql }).matchMedia = () => mql
  return {
    setSystemLight(v: boolean) {
      matches = v
      listeners.forEach((cb) => cb())
    }
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute("data-theme")
})

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe("useTheme — estado inicial", () => {
  it("sem preferência salva, segue o sistema (claro)", () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe("light")
  })

  it("sem preferência salva, segue o sistema (escuro)", () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe("dark")
  })

  it("preferência salva no localStorage vence o sistema", () => {
    localStorage.setItem("nex:theme", "dark")
    mockMatchMedia(true) // sistema diria "claro", mas o usuário já escolheu escuro
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe("dark")
  })
})

describe("useTheme — toggle", () => {
  it("alterna o tema, escreve o atributo no <html> e persiste no localStorage", () => {
    mockMatchMedia(false) // começa escuro
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe("dark")

    act(() => result.current.toggle())

    expect(result.current.theme).toBe("light")
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(localStorage.getItem("nex:theme")).toBe("light")
  })

  it("alterna de novo e volta", () => {
    mockMatchMedia(false)
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    act(() => result.current.toggle())
    expect(result.current.theme).toBe("dark")
    expect(localStorage.getItem("nex:theme")).toBe("dark")
  })
})

describe("useTheme — acompanha o SO ao vivo só até o usuário escolher (regressão do bug real)", () => {
  it("sem escolha explícita, uma mudança do SO atualiza o tema", () => {
    const media = mockMatchMedia(false) // começa escuro
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe("dark")

    act(() => media.setSystemLight(true))

    expect(result.current.theme).toBe("light")
  })

  it("depois do toggle, uma mudança do SO NÃO deve sobrescrever a escolha do usuário — o bug era exatamente esse", () => {
    const media = mockMatchMedia(false) // sistema começa escuro
    const { result } = renderHook(() => useTheme())

    // Usuário troca manualmente pra claro.
    act(() => result.current.toggle())
    expect(result.current.theme).toBe("light")
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")

    // SO muda de tema (ex: hora do dia, dark mode automático do Windows/macOS) —
    // isso não pode reverter a escolha explícita do usuário.
    act(() => media.setSystemLight(false))

    expect(result.current.theme).toBe("light")
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
  })

  it("listener é removido no unmount (sem vazamento)", () => {
    const media = mockMatchMedia(false)
    const { result, unmount } = renderHook(() => useTheme())
    unmount()
    // depois do unmount, disparar "mudança do SO" não deve quebrar nem
    // reativar o hook — só confirmamos que não lança.
    expect(() => media.setSystemLight(true)).not.toThrow()
    expect(result.current.theme).toBe("dark") // valor congelado no último render
  })
})
