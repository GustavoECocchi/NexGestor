import { useEffect, useState } from "react"

export type Theme = "light" | "dark"

const KEY = "nex:theme"

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === "light" || v === "dark" ? v : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark"
}

// Aplica a escolha salva o quanto antes (fora de um efeito), pra não piscar
// o tema errado entre o primeiro paint (guiado por prefers-color-scheme) e
// o React montar.
if (typeof document !== "undefined") {
  const stored = readStored()
  if (stored) document.documentElement.setAttribute("data-theme", stored)
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => readStored() ?? systemTheme())

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    // A checagem precisa ficar DENTRO do handler: se ficasse só aqui fora, um
    // usuário que abre sem preferência salva e depois usa o toggle continuaria
    // com o listener ativo, e uma mudança de tema do SO viraria o ícone sem
    // virar as cores (data-theme já está fixado) — estado e DOM dessincronizados.
    const onChange = () => {
      if (readStored()) return // escolha explícita do usuário manda
      setTheme(systemTheme())
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark"
    setTheme(next)
    document.documentElement.setAttribute("data-theme", next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      /* quota — não pode derrubar a UI */
    }
  }

  return { theme, toggle }
}
