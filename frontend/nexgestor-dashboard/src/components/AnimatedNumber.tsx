import { formatarPtBR, parseFormatado, useContagem } from "~lib/countup"

/**
 * Exibe um valor já formatado ("R$ 40,00", "5,0x", "2,1%") contando de 0 até ele.
 *
 * Se a string não contém número — "—" para métrica ausente —, é renderizada
 * intacta: ausência de dado não pode virar um zero animado.
 */
export function AnimatedNumber({ value, delay = 0 }: { value: string; delay?: number }) {
  const partes = parseFormatado(value)
  // Hook sempre chamado, com alvo 0 quando não há número: a ordem dos hooks não
  // pode depender do conteúdo da string.
  const corrente = useContagem(partes?.valor ?? 0, delay)

  if (!partes) return <>{value}</>
  return (
    <>
      {partes.prefixo}
      {formatarPtBR(corrente, partes.casas)}
      {partes.sufixo}
    </>
  )
}
