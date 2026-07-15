// =============================================================================
// Sanitizador de HTML por allowlist — sem dependências externas.
//
// Estratégia: escapa TUDO primeiro (nenhum HTML sobrevive), depois reativa
// apenas as tags inofensivas de ênfase que a UI realmente usa. Qualquer
// atributo, script, handler ou tag fora da lista chega ao DOM como texto.
//
// Use em TODO conteúdo que passe por dangerouslySetInnerHTML — hoje mock,
// amanhã texto vindo do backend/IA (summary, root_cause, ai_insights).
// =============================================================================

const ALLOWED = ["b", "strong", "i", "em", "br"] as const

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function sanitizeHtml(raw: string | null | undefined): string {
  if (!raw) return ""
  let out = escapeHtml(raw)
  // Reativa somente as tags da allowlist, SEM atributos (ex: <b>, </b>, <br/>).
  for (const tag of ALLOWED) {
    const open = new RegExp(`&lt;${tag}\\s*/?&gt;`, "gi")
    const close = new RegExp(`&lt;/${tag}&gt;`, "gi")
    out = out.replace(open, tag === "br" ? "<br/>" : `<${tag}>`)
    out = out.replace(close, `</${tag}>`)
  }
  return out
}
