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
    if (readStored()) return
    // Sem escolha explícita: acompanha a preferência do sistema ao vivo.
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    const onChange = () => setTheme(systemTheme())
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
