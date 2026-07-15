import { Copilot } from "~components/Copilot"
import {
  DiagnosisCards,
  MetricTiles,
  OpportunityCard,
  PriorityActions,
  Suggestions
} from "~components/DetailSections"
import { IconBack, IconInfo } from "~components/Icons"
import { STATUS } from "~lib/status"
import type { CampaignVM, ScoreConfidence } from "~types"

const CONF: Record<ScoreConfidence, { label: string; color: string }> = {
  high: { label: "confiança alta", color: "var(--green)" },
  medium: { label: "confiança média", color: "var(--amber)" },
  low: { label: "confiança baixa", color: "var(--red)" }
}

export function CampaignDetail({ c, onBack }: { c: CampaignVM; onBack: () => void }) {
  const s = STATUS[c.status]
  const circ = 2 * Math.PI * 32
  const off = circ - (c.score / 100) * circ
  return (
    <>
      <div className="scroll fade-in">
        <div className="detail-hd">
          <div className="back" onClick={onBack}><IconBack />Voltar</div>
          <div className="detail-title-row">
            <h2>{c.name}</h2>
            <div className="pill" style={{ background: s.bg, color: s.color }}>{s.label}</div>
          </div>
          <div className="detail-plat"><span className="dot" style={{ background: s.color }} />{c.platform}</div>
        </div>

        <div className="score-wrap">
          <div className="ring">
            <svg width={74} height={74}>
              <circle cx={37} cy={37} r={32} fill="none" stroke="var(--line)" strokeWidth={6} />
              <circle
                cx={37} cy={37} r={32} fill="none" stroke={s.stroke} strokeWidth={6}
                strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
              />
            </svg>
            <div className="num">{c.score}<small>/100</small></div>
          </div>
          <div className="score-txt">
            <h3>Score de saúde</h3>
            {c.confidence && c.coverage != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 6px", fontSize: 11, color: CONF[c.confidence].color }}>
                <span className="dot" style={{ background: CONF[c.confidence].color }} />
                Diagnóstico com {CONF[c.confidence].label} · cobertura de dados {c.coverage}%
              </div>
            )}
            <p>{c.summary}</p>
          </div>
        </div>

        <OpportunityCard c={c} />

        <div className="sec-label">Métricas <span className="ln" /></div>
        <MetricTiles c={c} />

        <div className="sec-label">Diagnóstico IA <span className="ln" /></div>
        <div className="sec-cap">
          <IconInfo />
          Gerado pelo cruzamento entre métricas, metas e padrões de comportamento — não pela leitura de números isolados.
        </div>
        <DiagnosisCards c={c} />

        <div className="sec-label">Ações prioritárias <span className="ln" /></div>
        <PriorityActions c={c} />

        <div className="sec-label">Sugestões <span className="ln" /></div>
        <Suggestions c={c} />

        <Copilot c={c} />
        <div style={{ height: 8 }} />
      </div>
    </>
  )
}
