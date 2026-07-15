import { useState } from "react"

import { IconSpark } from "~components/Icons"
import { brl, dec } from "~lib/format"
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

function verdict(a: CampaignVM, b: CampaignVM) {
  const w = a.score >= b.score ? a : b
  const l = w === a ? b : a
  const r: string[] = []
  if (w.cpaNum < l.cpaNum) r.push("CPA menor")
  if (w.roasNum > l.roasNum) r.push("ROAS superior")
  if (w.ctrNum > l.ctrNum) r.push("CTR Link mais alto")
  const reason = r.length ? r.join(", ") : "melhor score de saúde geral"
  // Guarda: campanha sem cenário crítico.
  const weak = l.scenarios[0]?.title
  const tail = weak
    ? ` Já <b>${l.name}</b> mostra sinais de <b>${weak}</b> e merece atenção antes de receber mais verba.`
    : ` <b>${l.name}</b> está saudável, mas com margem menor de eficiência.`
  return `<b>${w.name}</b> está mais eficiente: ${reason}.${tail}`
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
        <p className="sub">Veja lado a lado e receba o veredito da IA.</p>

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
                  <Row label="CPA" fa={`R$ ${brl(a.cpaNum)}`} fb={`R$ ${brl(b.cpaNum)}`} wa={a.cpaNum < b.cpaNum} wb={b.cpaNum < a.cpaNum} />
                  <Row label="ROAS" fa={`${dec(a.roasNum)}x`} fb={`${dec(b.roasNum)}x`} wa={a.roasNum > b.roasNum} wb={b.roasNum > a.roasNum} />
                  <Row label="CTR Link" fa={`${dec(a.ctrNum)}%`} fb={`${dec(b.ctrNum)}%`} wa={a.ctrNum > b.ctrNum} wb={b.ctrNum > a.ctrNum} />
                  <Row label="Frequência" fa={dec(a.freqNum)} fb={dec(b.freqNum)} wa={a.freqNum < b.freqNum} wb={b.freqNum < a.freqNum} />
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
