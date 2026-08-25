// =============================================================================
// Identificador simples de quem está usando o dashboard — SEM senha, SEM
// sessão. O backend isola campanhas por `dono` (header `X-Nex-Dono`, ver
// app/routes/campanhas_salvas.py); aqui só guardamos o valor que a pessoa
// digitou uma vez, em localStorage, e o devolvemos para lib/api.ts anexar em
// toda chamada a /api/v1/campaigns*.
//
// "Separação de visão, não segurança": qualquer um que souber (ou adivinhar)
// o identificador alheio lê os dados dele. Login de verdade é o próximo passo,
// fora do escopo desta migração extensão → dashboard.
// =============================================================================

const KEY = "nex:dono"
const LIMITE = 120

export function getDono(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    return v && v.trim() ? v : null
  } catch {
    return null
  }
}

/** Mesma normalização do backend (trim + lowercase) — evita "Ana" != "ana". */
export function normalizaDono(raw: string): string {
  return raw.trim().toLowerCase().slice(0, LIMITE)
}

export function setDono(raw: string): string | null {
  const normalizado = normalizaDono(raw)
  if (!normalizado) return null
  try {
    localStorage.setItem(KEY, normalizado)
  } catch {
    /* quota — segue em memória só nesta sessão via retorno */
  }
  return normalizado
}

export function limparDono(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
