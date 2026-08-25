export function Sparkline({ series, color }: { series: number[]; color: string }) {
  const w = 58, h = 20, p = 2
  const data = Array.isArray(series) ? series.filter((v) => Number.isFinite(v)) : []

  // Sem dados: não renderiza nada (evita Math.min(...[]) = Infinity e NaN).
  if (data.length === 0) return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} />

  const n = data.length
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  // 1 ponto: centraliza (evita divisão por zero em i/(n-1)).
  const xAt = (i: number) => (n === 1 ? w / 2 : p + (i / (n - 1)) * (w - 2 * p))
  const xy = data.map(
    (v, i) => [xAt(i), h - p - ((v - min) / range) * (h - 2 * p)] as [number, number]
  )
  const line = xy.map((d) => `${d[0].toFixed(1)},${d[1].toFixed(1)}`).join(" ")
  const area = `${p},${h} ${line} ${w - p},${h}`
  const last = xy[n - 1]

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {n > 1 && <polyline points={area} fill={color} opacity={0.1} />}
      {n > 1 && (
        <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
    </svg>
  )
}
