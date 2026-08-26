// =============================================================================
// Saúde OBSERVADA da camada de IA.
//
// Por que existe: `GET /api/v1/status` responde se a IA está CONFIGURADA
// (toggle ligado + chave presente + SDK instalado). Nenhuma dessas três coisas
// prova que a chave AUTENTICA. Uma chave revogada, ou que estourou o limite de
// gasto, passa nos três — e foi exatamente o que aconteceu neste projeto em
// julho/2026: chave configurada, 401 na hora de usar.
//
// Fazer o endpoint testar a chave de verdade custaria uma chamada paga ao
// Gemini toda vez que alguém abre o painel. A alternativa barata é esta: a cada
// análise já sabemos se `ai_insights` veio. Se o servidor prometeu a IA e a
// análise voltou sem ela, isso é falha REAL, observada, custo zero.
//
// Mantido em memória de propósito (sem localStorage): é um sinal ao vivo sobre
// o servidor agora. Persistir deixaria um aviso velho na tela depois que o
// problema já foi resolvido.
// =============================================================================

/** O que a última análise mostrou sobre a IA. `null` = nada observado ainda. */
export type SaudeIA = "ok" | "falhou" | null

let ultima: SaudeIA = null
/** O que o servidor DIZ oferecer. `null` = ainda não perguntamos. */
let prometida: boolean | null = null
const inscritos = new Set<(s: SaudeIA) => void>()

/** Guarda o que o `/status` respondeu. Chamado por quem busca o status. */
export function registrarStatusServidor(disponivel: boolean | null): void {
  prometida = disponivel
  // Servidor passou a dizer que NÃO tem IA: uma falha observada antes perde o
  // sentido — não é mais "prometeu e não entregou", é só "está desligada".
  if (disponivel === false) definir(null)
}

/**
 * Registra o desfecho de uma análise: `entregue` = a resposta trouxe
 * `ai_insights`.
 *
 * Só a combinação prometida-e-não-entregue é falha:
 *
 *   - servidor diz que NÃO tem IA → o selo já mostra "IA off". Marcar falha
 *     aqui viraria alarme sobre um estado que todo mundo já conhece.
 *   - ainda não sabemos o que o servidor oferece → não dá para acusar nada.
 *   - diz que tem e não veio → o servidor prometeu e não entregou. É o caso
 *     que este módulo existe para pegar.
 */
export function registrarAnalise(entregue: boolean): void {
  if (prometida !== true) return
  definir(entregue ? "ok" : "falhou")
}

function definir(s: SaudeIA) {
  if (s === ultima) return // não acorda a UI à toa
  ultima = s
  inscritos.forEach((cb) => cb(ultima))
}

export function lerSaudeIA(): SaudeIA {
  return ultima
}

/** Inscreve um observador. Devolve a função de cancelamento. */
export function assinarSaudeIA(cb: (s: SaudeIA) => void): () => void {
  inscritos.add(cb)
  return () => {
    inscritos.delete(cb)
  }
}

/** Só para teste — zera o estado do módulo entre casos. */
export function _resetarSaudeIA(): void {
  ultima = null
  prometida = null
  inscritos.clear()
}
