import { useState } from "react"

import { IconSpark } from "~components/Icons"
import { brl, brlCents, dec } from "~lib/format"
import { sanitizeHtml } from "~lib/sanitize"
import type { CampaignVM } from "~types"

function Row({ label, fa, fb, wa, wb }: { label: string; fa: string; fb: string; wa: boolean; wb: boolean }) {
  return (
    <div className="cmp-row">
      <div className="cmp-k">{label}</div>
      <div className={`cmp-v${wa ? " win" : ""}`}>{fa}</div>
      <div className={`cmp-v${wb ? " win" : ""}`}>{fb}</div>
    </div>
  )
}

/**
 * Comparação só existe quando os DOIS lados têm o número.
 *
 * Com o antigo fallback `?? 0` do adapter, uma campanha sem CPA entrava na
 * tabela como "R$ 0,00" e ganhava o confronto de "CPA menor" — o veredito
 * elegia como mais eficiente justamente a campanha sobre a qual não havia dado.
 * Comparar contra ausência não é comparar.
 */
function melhor(x: number | null, y: number | null, menorVence: boolean): boolean {
  if (x == null || y == null) return false
  return menorVence ? x < y : x > y
}

/** Formata um número comparável; ausência vira travessão, nunca zero. */
function cmpFmt(v: number | null, render: (n: number) => string): string {
  return v == null ? "—" : render(v)
}

function verdict(a: CampaignVM, b: CampaignVM) {
  const w = a.score >= b.score ? a : b
  const l = w === a ? b : a
  const r: string[] = []
  if (melhor(w.cpaNum, l.cpaNum, true)) r.push("CPA menor")
  if (melhor(w.roasNum, l.roasNum, false)) r.push("ROAS superior")
  if (melhor(w.ctrNum, l.ctrNum, false)) r.push("CTR Link mais alto")
  const reason = r.length ? r.join(", ") : "melhor score de saúde geral"

  // O cenário G é OPORTUNIDADE, não problema. Pegar `scenarios[0]` às cegas
  // produzia o oposto do diagnóstico: uma campanha cuja ação primária é
  // "aumentar orçamento agora" era descrita como tendo "sinais de Janela de
  // Escala Vertical" que "merecem atenção antes de receber mais verba".
  // Só cenário de problema entra nesta frase.
  const problema = l.scenarios.find((s) => s.code !== "G")
  const tail = problema
    ? ` Já <b>${l.name}</b> mostra sinais de <b>${problema.title}</b> e merece atenção antes de receber mais verba.`
    : ` <b>${l.name}</b> está saudável, mas com margem menor de eficiência.`

  // O score é comparável; a CONFIANÇA nele não. Uma campanha avaliada com 25%
  // de cobertura pode marcar 100 e "vencer" outra medida de ponta a ponta —
  // vencer por falta de dado, não por performance. A ressalva vai junto do
  // veredito, não escondida numa outra tela.
  const ressalva =
    w.confidence === "low"
      ? ` <b>Ressalva:</b> o diagnóstico de ${w.name} cobriu apenas ${w.coverage ?? 0}% das métricas — comparação indicativa, não conclusiva.`
      : ""

  return `<b>${w.name}</b> está mais eficiente: ${reason}.${tail}${ressalva}`
}

const short = (n: string) => n.split("—")[0].trim()

export function CompareModal({ campaigns, onClose }: { campaigns: CampaignVM[]; onClose: () => void }) {
  // Guarda: comparar exige pelo menos 2 campanhas.
  const enough = campaigns.length >= 2
  const [aId, setAId] = useState(campaigns[0]?.id ?? 0)
  const [bId, setBId] = useState(campaigns[1]?.id ?? campaigns[0]?.id ?? 0)

  const a = campaigns.find((c) => c.id === aId)
  const b = campaigns.find((c) => c.id === bId)
  const same = aId === bId

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-grab" />
        <h2>Comparar campanhas</h2>
        {/* Era "veredito da IA": o veredito é a função local `verdict()`, que
            compara score/CPA/ROAS/CTR. Nenhuma IA participa desta tela. */}
        <p className="sub">Veja lado a lado e receba o veredito comparativo.</p>

        {!enough ? (
          <p className="sub" style={{ textAlign: "center", margin: "14px 0" }}>
            É preciso ter pelo menos 2 campanhas para comparar.
          </p>
        ) : (
          <>
            <div className="cmp-selects">
              <select value={aId} onChange={(e) => setAId(+e.target.value)}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={bId} onChange={(e) => setBId(+e.target.value)}>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {same || !a || !b ? (
              <p className="sub" style={{ textAlign: "center", margin: "14px 0" }}>Selecione duas campanhas diferentes.</p>
            ) : (
              <>
                <div className="cmp-table">
                  <div className="cmp-row head"><div className="cmp-k">Métrica</div><div className="cmp-v">{short(a.name)}</div><div className="cmp-v">{short(b.name)}</div></div>
                  <Row label="CPA" fa={cmpFmt(a.cpaNum, (n) => `R$ ${brlCents(n)}`)} fb={cmpFmt(b.cpaNum, (n) => `R$ ${brlCents(n)}`)} wa={melhor(a.cpaNum, b.cpaNum, true)} wb={melhor(b.cpaNum, a.cpaNum, true)} />
                  <Row label="ROAS" fa={cmpFmt(a.roasNum, (n) => `${dec(n)}x`)} fb={cmpFmt(b.roasNum, (n) => `${dec(n)}x`)} wa={melhor(a.roasNum, b.roasNum, false)} wb={melhor(b.roasNum, a.roasNum, false)} />
                  <Row label="CTR Link" fa={cmpFmt(a.ctrNum, (n) => `${dec(n)}%`)} fb={cmpFmt(b.ctrNum, (n) => `${dec(n)}%`)} wa={melhor(a.ctrNum, b.ctrNum, false)} wb={melhor(b.ctrNum, a.ctrNum, false)} />
                  <Row label="Frequência" fa={cmpFmt(a.freqNum, dec)} fb={cmpFmt(b.freqNum, dec)} wa={melhor(a.freqNum, b.freqNum, true)} wb={melhor(b.freqNum, a.freqNum, true)} />
                  <Row label="Investimento" fa={`R$ ${brl(a.invest)}`} fb={`R$ ${brl(b.invest)}`} wa={false} wb={false} />
                  <Row label="Receita" fa={`R$ ${brl(a.revenue)}`} fb={`R$ ${brl(b.revenue)}`} wa={a.revenue > b.revenue} wb={b.revenue > a.revenue} />
                  <Row label="Score" fa={`${a.score}`} fb={`${b.score}`} wa={a.score > b.score} wb={b.score > a.score} />
                </div>
                <div className="cmp-verdict">
                  <IconSpark />
                  <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(verdict(a, b)) }} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
