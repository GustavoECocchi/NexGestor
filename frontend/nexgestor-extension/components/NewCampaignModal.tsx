import { useEffect, useRef, useState } from "react"

import { IconBolt, IconCheck, IconEdit, IconRefresh } from "~components/Icons"
import { responseToVM } from "~lib/adapt"
import { analyzeCampaign } from "~lib/api"
import { nextLiveId } from "~lib/store"
import type { AnalyzeInput, CampaignVM, Metrics, Targets } from "~types"

// Etapas reais da análise: enviar → engine processa → montar resultado.
const STEPS = [
  { t: "Enviando métricas ao engine…", ico: <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" /> },
  { t: "Cruzando dados com os 11 cenários…", ico: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { t: "Montando diagnóstico…", ico: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /> }
]

// ── helpers de formulário ────────────────────────────────────────────────────

/** "1.234,56" | "1234.56" | "" → number | undefined (omitido do payload). */
function num(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const normalized = s.replace(/\./g, "").replace(",", ".")
  const direct = Number(s.replace(",", "."))
  const n = Number.isFinite(direct) ? direct : Number(normalized)
  return Number.isFinite(n) ? n : undefined
}

type Field = { label: string; key: string; ph?: string }

const FIELDS_DELIVERY: Field[] = [
  { label: "Impressões", key: "impressions", ph: "0" },
  { label: "Gasto (R$)", key: "spend", ph: "0" },
  { label: "CPM", key: "cpm", ph: "0" },
  { label: "CPC", key: "cpc", ph: "0" },
  { label: "CPA", key: "cpa", ph: "0" },
  { label: "ROAS", key: "roas", ph: "0" }
]
const FIELDS_CREATIVE: Field[] = [
  { label: "Hook rate (%)", key: "hook_rate", ph: "0" },
  { label: "Hold rate (%)", key: "hold_rate", ph: "0" },
  { label: "CTR link (%)", key: "ctr_link", ph: "0" },
  { label: "CTR todos (%)", key: "ctr_all", ph: "0" },
  { label: "Frequência", key: "frequency", ph: "0" },
  { label: "Conversões", key: "conversions", ph: "0" }
]
const FIELDS_TARGETS: Field[] = [
  { label: "CPA máx.", key: "max_cpa", ph: "0" },
  { label: "ROAS mín.", key: "min_roas", ph: "0" },
  { label: "CTR link mín. (%)", key: "min_ctr_link", ph: "1.5" },
  { label: "Hook rate mín. (%)", key: "min_hook_rate", ph: "35" }
]

export function NewCampaignModal({
  onClose,
  onAnalyzed
}: {
  onClose: () => void
  onAnalyzed: (vm: CampaignVM) => void
}) {
  const [mode, setMode] = useState<"auto" | "manual">("manual")
  const [step, setStep] = useState(-1) // -1 = idle
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [objective, setObjective] = useState("conversion")
  const [platform, setPlatform] = useState("meta_ads")
  const [values, setValues] = useState<Record<string, string>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const setV = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  function buildInput(): AnalyzeInput {
    const metrics: Metrics = {}
    for (const f of [...FIELDS_DELIVERY, ...FIELDS_CREATIVE]) {
      const n = num(values[f.key] ?? "")
      if (n !== undefined) (metrics as Record<string, number>)[f.key] = n
    }
    const targets: Targets = {}
    for (const f of FIELDS_TARGETS) {
      const n = num(values[f.key] ?? "")
      if (n !== undefined) (targets as Record<string, number>)[f.key] = n
    }
    return {
      campaign: {
        id: nextLiveId(),
        name: name.trim() || "Campanha sem nome",
        objective,
        platform
      },
      metrics,
      targets
    }
  }

  async function runAnalyze() {
    setError(null)
    const input = buildInput()

    if (Object.keys(input.metrics).length === 0) {
      setError("Preencha pelo menos uma métrica para o engine analisar.")
      return
    }

    setStep(0)
    timer.current = setTimeout(() => setStep(1), 500) // request em voo

    try {
      const res = await analyzeCampaign(input)
      clearTimeout(timer.current)
      setStep(2)
      const vm = responseToVM(res, input)
      timer.current = setTimeout(() => onAnalyzed(vm), 450)
    } catch (e) {
      clearTimeout(timer.current)
      setStep(-1)
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        msg.includes("Failed to fetch") || msg.includes("NetworkError")
          ? "Não foi possível falar com o backend. Confirme que ele está rodando em http://localhost:8000 (uvicorn app.main:app --reload)."
          : `A análise falhou: ${msg}`
      )
    }
  }

  const collecting = step >= 0

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && !collecting && onClose()}>
      <div className="modal">
        <div className="modal-grab" />
        <h2>Criar nova campanha</h2>
        <p className="sub">Insira as métricas manualmente — a coleta automática chega na Fase C.</p>

        {!collecting && (
          <div className="seg">
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><IconEdit />Inserir manual</button>
            <button className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}><IconBolt />Coletar automático</button>
          </div>
        )}

        {mode === "auto" && !collecting && (
          <div>
            <div className="detect"><span className="pulse" /><span>Coleta automática do <b>Meta Ads Manager</b></span></div>
            <button className="collect-btn" disabled style={{ opacity: 0.45, cursor: "not-allowed" }}>
              <IconRefresh />Disponível na Fase C (integração Meta)
            </button>
            <p className="collect-hint">
              A leitura automática das campanhas abertas na aba depende do OAuth com a Meta (Fases C/D).
              Por enquanto, use a inserção manual — o diagnóstico do engine é o mesmo.
            </p>
          </div>
        )}

        {collecting && (
          <div className="loadseq">
            {STEPS.map((s, i) => {
              const cls = i < step ? "lrow done" : i === step ? "lrow active" : "lrow"
              return (
                <div className={cls} key={i}>
                  <div className="ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{s.ico}</svg>
                  </div>
                  <div className="lt">{s.t}</div>
                  <div style={{ marginLeft: "auto" }}>
                    {i < step ? <IconCheck style={{ width: 14, height: 14, color: "var(--green)" }} /> : i === step ? <div className="spin" /> : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && !collecting && (
          <div
            role="alert"
            style={{
              margin: "10px 0",
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: 12.5,
              lineHeight: 1.45
            }}>
            {error}
          </div>
        )}

        {mode === "manual" && !collecting && (
          <div>
            <div className="grp">
              <div className="grp-h">Identificação</div>
              <div className="fld-grid">
                <div className="fld" style={{ gridColumn: "1/3" }}>
                  <label>Nome da campanha</label>
                  <input placeholder="Ex: Black Friday — Conversão" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="fld">
                  <label>Objetivo</label>
                  <select value={objective} onChange={(e) => setObjective(e.target.value)}>
                    <option value="conversion">Conversão</option>
                    <option value="lead">Lead</option>
                    <option value="traffic">Tráfego</option>
                  </select>
                </div>
                <div className="fld">
                  <label>Plataforma</label>
                  <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
                    <option value="meta_ads">Meta Ads</option>
                    <option value="google_ads">Google Ads</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grp">
              <div className="grp-h">Entrega &amp; custo</div>
              <div className="fld-grid">
                {FIELDS_DELIVERY.map((f) => (
                  <div className="fld" key={f.key}>
                    <label>{f.label}</label>
                    <input inputMode="decimal" placeholder={f.ph} value={values[f.key] ?? ""} onChange={setV(f.key)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grp">
              <div className="grp-h">Criativo &amp; cliques</div>
              <div className="fld-grid">
                {FIELDS_CREATIVE.map((f) => (
                  <div className="fld" key={f.key}>
                    <label>{f.label}</label>
                    <input inputMode="decimal" placeholder={f.ph} value={values[f.key] ?? ""} onChange={setV(f.key)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="grp">
              <div className="grp-h">Metas (targets)</div>
              <div className="fld-grid">
                {FIELDS_TARGETS.map((f) => (
                  <div className="fld" key={f.key}>
                    <label>{f.label}</label>
                    <input inputMode="decimal" placeholder={f.ph} value={values[f.key] ?? ""} onChange={setV(f.key)} />
                  </div>
                ))}
              </div>
            </div>

            <button className="submit" onClick={runAnalyze}>Analisar campanha</button>
          </div>
        )}
      </div>
    </div>
  )
}
