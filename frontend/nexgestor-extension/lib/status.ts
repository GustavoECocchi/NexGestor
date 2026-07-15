import type { Priority, UIStatus } from "~types"

export const STATUS: Record<
  UIStatus,
  { label: string; color: string; bg: string; stroke: string }
> = {
  RED: { label: "Crítico", color: "var(--red)", bg: "var(--red-bg)", stroke: "#ff6b78" },
  YELLOW: { label: "Atenção", color: "var(--amber)", bg: "var(--amber-bg)", stroke: "#ffc56b" },
  GREEN: { label: "Saudável", color: "var(--green)", bg: "var(--green-bg)", stroke: "#5fe0a8" },
  BLUE: { label: "Escalável", color: "var(--blue)", bg: "var(--blue-bg)", stroke: "#5b8cff" }
}

export const PRIO: Record<number, { t: string; c: string; b: string }> = {
  1: { t: "Crítico", c: "var(--red)", b: "var(--red-bg)" },
  2: { t: "Urgente", c: "var(--amber)", b: "var(--amber-bg)" },
  3: { t: "Monitorar", c: "var(--txt-2)", b: "rgba(120,150,220,.1)" }
}

export const PA_COLOR: Record<Priority, { c: string; b: string }> = {
  Alta: { c: "var(--red)", b: "var(--red-bg)" },
  Média: { c: "var(--amber)", b: "var(--amber-bg)" },
  Baixa: { c: "var(--txt-2)", b: "rgba(120,150,220,.1)" }
}

export const URG_COLOR: Record<Priority, string> = {
  Alta: "var(--red)",
  Média: "var(--amber)",
  Baixa: "var(--green)"
}
