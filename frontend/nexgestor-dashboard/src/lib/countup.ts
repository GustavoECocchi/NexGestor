// =============================================================================
// Contagem crescente dos números do detalhe da campanha.
//
// Os valores chegam à UI já FORMATADOS pelo adapter ("R$ 40,00", "5,0x",
// "2,1%", "R$ 3.000", "—"). Animar aqui significa desmontar essa string,
// interpolar só a parte numérica e remontá-la com exatamente o mesmo prefixo,
// sufixo e número de casas decimais — o valor final tem que ser idêntico ao que
// seria exibido sem animação nenhuma.
//
// Duas regras que a animação não pode quebrar:
//   • Ausência de dado ("—") não vira 0. Contar de 0 até 0 exibiria um número
//     onde não há medição — o defeito que passamos o dia inteiro corrigindo.
//   • `prefers-reduced-motion` mostra o valor final imediatamente, nunca o
//     estado inicial congelado. (Em 2026-07-26 uma animação com fill-mode errado
//     deixou cards invisíveis nesse modo; aqui o equivalente seria a tela toda
//     zerada para quem desativou animações.)
// =============================================================================

import { useEffect, useRef, useState } from "react"

const DURACAO_PADRAO = 900

export function prefereMenosMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export type NumeroFormatado = {
  prefixo: string
  sufixo: string
  valor: number
  casas: number
}

/**
 * Separa um valor já formatado em pt-BR nas partes que a animação precisa.
 * Devolve `null` quando não há número na string ("—", "n/d") — o chamador deve
 * então renderizar o texto original sem tocar nele.
 */
export function parseFormatado(texto: string): NumeroFormatado | null {
  // Casa "3.000", "40,00", "5,0", "60", "-2,5" — milhar com ponto, decimal com vírgula.
  const m = texto.match(/-?\d[\d.]*(?:,\d+)?/)
  if (!m) return null

  const bruto = m[0]
  const valor = Number(bruto.replace(/\./g, "").replace(",", "."))
  if (!Number.isFinite(valor)) return null

  const virgula = bruto.indexOf(",")
  const casas = virgula === -1 ? 0 : bruto.length - virgula - 1

  return {
    prefixo: texto.slice(0, m.index ?? 0),
    sufixo: texto.slice((m.index ?? 0) + bruto.length),
    valor,
    casas
  }
}

export function formatarPtBR(valor: number, casas: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  })
}

/** Desaceleração no fim — a contagem "chega" no número em vez de parar seco. */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * Anima de 0 até `alvo`. Retorna o valor corrente a cada quadro.
 * `atraso` escalona tiles vizinhos para não contarem em bloco.
 */
export function documentoOculto(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden"
}

export function useContagem(alvo: number, atraso = 0, duracao = DURACAO_PADRAO): number {
  const [valor, setValor] = useState(() =>
    prefereMenosMovimento() || documentoOculto() ? alvo : 0
  )
  const frame = useRef<number>()

  useEffect(() => {
    // Documento oculto entra aqui junto com movimento reduzido: `rAF` não é
    // agendado em documento oculto, então a contagem ficaria parada no valor
    // inicial. Medido no side panel servido em aba de segundo plano: score
    // congelado em 4/100, CPA "R$ 0", frequência "0,0" — enquanto o texto do
    // diagnóstico logo abaixo citava 3,4 de frequência e R$ 2.300 de perda.
    // Número inventado é pior que animação ausente.
    if (prefereMenosMovimento() || documentoOculto()) {
      setValor(alvo)
      return
    }

    let inicio: number | null = null
    let encerrado = false
    setValor(0)

    const finalizar = () => {
      if (encerrado) return
      encerrado = true
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      setValor(alvo)
    }

    const passo = (agora: number) => {
      if (encerrado) return
      if (inicio === null) inicio = agora
      const decorrido = agora - inicio - atraso
      if (decorrido < 0) {
        frame.current = requestAnimationFrame(passo)
        return
      }
      const progresso = Math.min(1, decorrido / duracao)
      setValor(alvo * easeOutCubic(progresso))
      // O último quadro grava o alvo exato: interpolação em ponto flutuante
      // pode parar em 39,999… e exibir "R$ 39,99" para sempre.
      if (progresso < 1) frame.current = requestAnimationFrame(passo)
      else finalizar()
    }

    // Rede de segurança independente de `rAF`: se a aba for ocultada, o
    // navegador limitar os quadros ou a máquina engasgar no meio da contagem,
    // o temporizador crava o valor real. `setTimeout` continua disparando em
    // aba de segundo plano (só é limitado), `rAF` não dispara nenhuma vez.
    const rede = setTimeout(finalizar, atraso + duracao + 200)
    // Ocultar a aba durante a contagem também encerra: melhor o número certo
    // sem animação do que um número parcial congelado na tela.
    document.addEventListener("visibilitychange", finalizar)

    frame.current = requestAnimationFrame(passo)
    return () => {
      encerrado = true
      clearTimeout(rede)
      document.removeEventListener("visibilitychange", finalizar)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    }
  }, [alvo, atraso, duracao])

  return valor
}
