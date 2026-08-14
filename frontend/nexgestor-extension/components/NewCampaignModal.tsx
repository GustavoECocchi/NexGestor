import { useEffect, useRef, useState } from "react"

import { IconBolt, IconCheck, IconEdit, IconRefresh } from "~components/Icons"
import { responseToVM } from "~lib/adapt"
import { analyzeCampaign, API_BASE, IS_LOCAL_BACKEND, isApiError } from "~lib/api"
import { nextLiveId } from "~lib/store"
import type { AnalyzeInput, CampaignVM, Metrics, Targets } from "~types"

// Etapas reais da análise: enviar → engine processa → montar resultado.
const STEPS = [
  { t: "Enviando métricas ao engine…", ico: <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" /> },
  // 15 = número de detectores no engine (`_detect_*` em service.py). Os 4
  // últimos (L–O) entraram em 2026-07-28 e este texto ficou dizendo 11.
  { t: "Cruzando dados com os 15 cenários…", ico: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { t: "Montando diagnóstico…", ico: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" /> }
]

// ── helpers de formulário ────────────────────────────────────────────────────

/** "1.234,56" | "1234.56" | "" → number | undefined (omitido do payload). */
export function num(raw: string): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const normalized = s.replace(/\./g, "").replace(",", ".")
  const direct = Number(s.replace(",", "."))
  const n = Number.isFinite(direct) ? direct : Number(normalized)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Traduz a falha da análise para uma frase que diga o que fazer.
 *
 * A regra é a mesma em todos os ramos: nunca sugerir que o problema está nos
 * dados da campanha quando o problema é do servidor, e nunca mandar o usuário
 * mexer em algo que não existe na máquina dele.
 *
 * `base`/`local` são parâmetros (e não leitura direta dos módulos) só para os
 * testes conseguirem exercitar os dois tipos de build — o call site usa os
 * defaults.
 */
export function mensagemDeErro(
  e: unknown,
  base: string = API_BASE,
  local: boolean = IS_LOCAL_BACKEND,
  online: boolean = typeof navigator === "undefined" ? true : navigator.onLine
): string {
  const msg = e instanceof Error ? e.message : String(e)

  // Já é texto pronto para o usuário (servidor ocupado, fora do ar, timeout).
  // Embrulhar em "A análise falhou" contradiria a própria mensagem.
  if (isApiError(e)) return msg

  const semRede = msg.includes("Failed to fetch") || msg.includes("NetworkError")
  if (!semRede) return `A análise falhou: ${msg}`

  // Modo desenvolvedor: quem roda backend local sabe o que fazer. (localhost
  // funciona offline, então `online` não entra nesta decisão.)
  if (local) {
    return `Não foi possível falar com o backend em ${base}. Confirme que ele está rodando (uvicorn app.main:app --reload).`
  }

  // Único caso em que dá pra AFIRMAR que o problema é a internet do usuário.
  // (`onLine: true` não prova conexão; `false` prova a ausência dela.)
  if (!online) {
    return "Você está sem conexão com a internet. Reconecte e tente de novo — seus dados continuam preenchidos."
  }

  // Aqui "Failed to fetch" continua ambíguo, e medir no servidor mostrou por
  // quê (14/08/2026): o 429 do limite de requisições é gerado pelo nginx, SEM
  // cabeçalho CORS. Com o host declarado em `host_permissions` o painel fica
  // isento de CORS e passa a LER esse 429 (aí cai no ramo de ApiError, com
  // mensagem exata) — mas isso vale só para os hosts declarados. Um build
  // apontado para outro endereço, ou um erro do proxy fora do previsto, ainda
  // chega aqui indistinguível de queda de rede. Afirmar "verifique sua
  // conexão" mandaria o usuário caçar problema na internet dele enquanto o
  // servidor apenas o estava limitando, então a mensagem cita as duas causas.
  return `Não foi possível falar com o servidor (${base}). Pode ser sua conexão, ou o servidor recusando por excesso de análises ao mesmo tempo — a equipe divide o mesmo limite. Espere um minuto e tente de novo; se continuar, avise o responsável técnico.`
}

/** Arredonda os campos que o backend tipa como int; os demais passam intactos. */
export function normalizaCampo(chave: string, valor: number): number {
  return CAMPOS_INTEIROS.has(chave) ? Math.round(valor) : valor
}

type Field = { label: string; key: string; ph?: string; inteiro?: boolean }

// Campos que o backend tipa como int (app/schema/schema.py). Enviar decimal
// neles devolve 422 "int_from_float", que chegava ao gestor como "A análise
// falhou: Falha na análise: 422" — sem dizer qual campo nem o que corrigir.
// Meia impressão não existe, então arredondar é normalizar entrada inválida,
// não inventar dado; o valor arredondado é escrito de volta no formulário para
// o gestor ver exatamente o que foi enviado.
const CAMPOS_INTEIROS = new Set([
  "impressions", "reach", "link_clicks", "all_clicks", "landing_page_views",
  "conversions", "weekly_conversions", "video_views_3s", "video_views_50pct",
  "thruplays", "min_weekly_conversions"
])

const FIELDS_DELIVERY: Field[] = [
  { label: "Impressões", key: "impressions", ph: "0", inteiro: true },
  { label: "Gasto (R$)", key: "spend", ph: "0" },
  { label: "CPM", key: "cpm", ph: "0" },
  { label: "CPC", key: "cpc", ph: "0" },
  { label: "CPA", key: "cpa", ph: "0" },
  // CPL destrava o Cenário F (Lead Frio), inalcançável pelo formulário até
  // 2026-08-01: o engine lê `cpl`, mas não havia onde informá-lo.
  { label: "CPL", key: "cpl", ph: "0" },
  { label: "ROAS", key: "roas", ph: "0" }
]
const FIELDS_CREATIVE: Field[] = [
  { label: "Hook rate (%)", key: "hook_rate", ph: "0" },
  { label: "Hold rate (%)", key: "hold_rate", ph: "0" },
  { label: "CTR link (%)", key: "ctr_link", ph: "0" },
  { label: "CTR todos (%)", key: "ctr_all", ph: "0" },
  { label: "Frequência", key: "frequency", ph: "0" },
  { label: "Conversões", key: "conversions", ph: "0", inteiro: true },
  // Cliques no link + visitas à página destravam os Cenários D (desalinhamento
  // com a landing page) e N (vazamento entre o clique e a página) — dois dos
  // quatro diagnósticos que o formulário manual não conseguia produzir.
  { label: "Cliques no link", key: "link_clicks", ph: "0", inteiro: true },
  { label: "Visitas à página", key: "landing_page_views", ph: "0", inteiro: true },
  // Conversões/semana e fase de aprendizado entraram aqui porque o engine passou
  // a EXIGIR estado de aprendizado para abrir a janela de escala vertical (ver
  // _evidencia_faltante_para_escala no backend). Sem estes campos o formulário
  // manual não conseguia satisfazer a regra: nem a campanha mais saudável
  // recebia a análise de escala — o critério ficaria inalcançável por construção.
  { label: "Conversões/semana", key: "weekly_conversions", ph: "0", inteiro: true }
]
const FIELDS_TARGETS: Field[] = [
  { label: "CPA máx.", key: "max_cpa", ph: "0" },
  // CPL máx. acompanha o CPL acima (Cenário F). CPM máx. destrava o Cenário J
  // (leilão caro) e é o teto que o Cenário G consulta para NÃO recomendar
  // escala num leilão já acima do limite.
  { label: "CPL máx.", key: "max_cpl", ph: "0" },
  { label: "CPM máx.", key: "max_cpm", ph: "25" },
  { label: "ROAS mín.", key: "min_roas", ph: "0" },
  { label: "CTR link mín. (%)", key: "min_ctr_link", ph: "1.5" },
  { label: "Hook rate mín. (%)", key: "min_hook_rate", ph: "35" }
]

/**
 * Chaves que o formulário MANUAL expõe. Exportado para teste: até 2026-08-01
 * faltavam `cpl`, `link_clicks`, `landing_page_views`, `max_cpl` e `max_cpm`,
 * e sem eles quatro dos quinze cenários do engine (D, F, J e N) eram
 * inalcançáveis por quem preenchesse o formulário — diagnósticos existentes no
 * backend que nenhum gestor conseguiria produzir. Medido por varredura de
 * 60.000 combinações antes e depois.
 */
export function chavesDoFormularioManual(): string[] {
  return [...FIELDS_DELIVERY, ...FIELDS_CREATIVE, ...FIELDS_TARGETS].map((f) => f.key)
}

// ── importação de arquivo (.json) ───────────────────────────────────────────
// Lista fechada dos campos aceitos, com o MESMO nome usado em Metrics/Targets
// (~types) e no contrato do backend (CONTRATO_API_FRONTEND.md). A cópia é
// sempre campo-a-campo por nome exato — nunca por posição/heurística — então
// "cpa": 50 no arquivo só pode virar metrics.cpa, nunca metrics.cpc. Chaves
// fora desta lista, ou com tipo errado, são ignoradas e reportadas na
// pré-visualização, nunca enviadas silenciosamente.
const METRIC_KEYS: (keyof Metrics)[] = [
  "impressions", "reach", "spend", "video_views_3s", "video_views_50pct", "thruplays",
  "hook_rate", "hold_rate", "link_clicks", "all_clicks", "ctr_link", "ctr_all",
  "cpm", "cpc", "cpl", "cpa", "roas", "landing_page_views", "lp_conversion_rate",
  "conversions", "weekly_conversions", "frequency", "learning_phase"
]
const TARGET_KEYS: (keyof Targets)[] = [
  "min_hook_rate", "min_hold_rate", "min_ctr_link", "max_ctr_all_ratio", "max_cpa",
  "max_cpc", "max_cpm", "max_cpl", "min_roas", "min_lp_conversion_rate",
  "max_frequency_fatigue", "max_frequency_critical", "max_frequency_horizontal",
  "min_weekly_conversions", "scale_cpa_margin", "scale_frequency_ceiling"
]

// Espelham os Literal do backend (app/schema/schema.py). Manter em sincronia:
// um valor fora daqui é 422 do outro lado.
const OBJECTIVE_VALUES = ["conversion", "lead", "traffic"] as const
const PLATFORM_VALUES = ["meta_ads", "google_ads", "tiktok_ads", "linkedin_ads"] as const

/** Aceita só valores da lista fechada; registra o inválido e usa o default. */
function pickEnum<T extends string>(
  v: unknown,
  permitidos: readonly T[],
  padrao: T,
  campo: string,
  invalidos: string[]
): T {
  if (v === undefined || v === null) return padrao
  if (typeof v === "string" && (permitidos as readonly string[]).includes(v)) return v as T
  invalidos.push(`${campo} ("${String(v)}" → usando "${padrao}")`)
  return padrao
}

export type ParsedFile = {
  input: AnalyzeInput
  unknownKeys: string[]
  invalidTypeKeys: string[]
  /** Campos de lista fechada com valor fora da lista (ex: plataforma com typo). */
  invalidValueKeys: string[]
}

export function parseFileJSON(raw: string): ParsedFile | { error: string } {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return { error: "JSON inválido — confira vírgulas e chaves. Use o formato de campaign/metrics/targets do CONTRATO_API_FRONTEND.md." }
  }
  // `typeof [] === "object"`: sem o Array.isArray, um JSON de lista na raiz
  // passava como "objeto sem campos" e caía nos defaults sem nenhum aviso.
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { error: "O arquivo precisa ser um objeto JSON com os blocos 'campaign', 'metrics' e/ou 'targets'." }
  }

  const root = obj as Record<string, unknown>
  const rawCampaign = (typeof root.campaign === "object" && root.campaign !== null ? root.campaign : {}) as Record<string, unknown>
  const rawMetrics = (typeof root.metrics === "object" && root.metrics !== null ? root.metrics : {}) as Record<string, unknown>
  const rawTargets = (typeof root.targets === "object" && root.targets !== null ? root.targets : {}) as Record<string, unknown>

  const metrics: Metrics = {}
  const targets: Targets = {}
  const unknownKeys: string[] = []
  const invalidTypeKeys: string[] = []
  const invalidValueKeys: string[] = []

  for (const [k, v] of Object.entries(rawMetrics)) {
    if (!METRIC_KEYS.includes(k as keyof Metrics)) { unknownKeys.push(`metrics.${k}`); continue }
    if (k === "learning_phase") {
      if (typeof v === "boolean") (metrics as Record<string, unknown>)[k] = v
      else invalidTypeKeys.push(`metrics.${k}`)
    } else if (typeof v === "number" && Number.isFinite(v)) {
      (metrics as Record<string, number>)[k] = normalizaCampo(k, v)
    } else {
      invalidTypeKeys.push(`metrics.${k}`)
    }
  }
  for (const [k, v] of Object.entries(rawTargets)) {
    if (!TARGET_KEYS.includes(k as keyof Targets)) { unknownKeys.push(`targets.${k}`); continue }
    if (typeof v === "number" && Number.isFinite(v)) (targets as Record<string, number>)[k] = normalizaCampo(k, v)
    else invalidTypeKeys.push(`targets.${k}`)
  }

  const nameFromFile = typeof rawCampaign.name === "string" ? rawCampaign.name.trim() : ""
  // Plataforma e objetivo são fechados. Antes qualquer string passava: um typo
  // como "googel_ads" era aceito, o backend devolvia 200 e o adapter — que só
  // reconhece "google_ads" — exibia a campanha como **Meta Ads**. O usuário lia
  // a plataforma errada como se fosse fato. Agora o valor inválido é listado na
  // pré-visualização e cai no default explicitamente, nunca em silêncio.
  const objectiveFromFile = pickEnum(rawCampaign.objective, OBJECTIVE_VALUES, "conversion", "campaign.objective", invalidValueKeys)
  const platformFromFile = pickEnum(rawCampaign.platform, PLATFORM_VALUES, "meta_ads", "campaign.platform", invalidValueKeys)
  const nicheFromFile = typeof rawCampaign.niche === "string" ? rawCampaign.niche : null

  const input: AnalyzeInput = {
    campaign: {
      id: nextLiveId(),
      name: nameFromFile || "Campanha via arquivo",
      objective: objectiveFromFile,
      platform: platformFromFile,
      niche: nicheFromFile
    },
    metrics,
    targets
  }

  return { input, unknownKeys, invalidTypeKeys, invalidValueKeys }
}

export function NewCampaignModal({
  onClose,
  onAnalyzed
}: {
  onClose: () => void
  onAnalyzed: (vm: CampaignVM) => void
}) {
  const [mode, setMode] = useState<"auto" | "manual" | "file">("manual")
  const [step, setStep] = useState(-1) // -1 = idle
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  // "" = não informado. Nunca vira `false` sozinho — ver comentário no <select>.
  const [learningPhase, setLearningPhase] = useState("")
  const [objective, setObjective] = useState("conversion")
  const [platform, setPlatform] = useState("meta_ads")
  const [values, setValues] = useState<Record<string, string>>({})
  const [autoStatus, setAutoStatus] = useState<"idle" | "detecting" | "error">("idle")
  const [autoError, setAutoError] = useState<string | null>(null)
  const [autoFound, setAutoFound] = useState(0)
  const [fileRaw, setFileRaw] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<ParsedFile | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const setV = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  // Detecção automática (provisória): lê a tabela de campanhas aberta na aba
  // do Ads Manager via content script (contents/ads-manager.ts). Best-effort
  // — a Meta pode mudar a página sem aviso; por isso os campos vêm sempre
  // editáveis antes do envio, nunca enviados direto.
  async function detectFromTab() {
    setAutoError(null)
    setAutoStatus("detecting")
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url || !/facebook\.com/.test(tab.url)) {
        setAutoStatus("error")
        setAutoError("Abra o Ads Manager (facebook.com) em uma aba e deixe a tabela de campanhas visível, depois tente de novo.")
        return
      }
      const res = await chrome.tabs.sendMessage(tab.id, { type: "NEXGESTOR_SCRAPE_REQUEST" })
      if (!res?.ok) throw new Error(res?.error ?? "Falha ao ler a página.")
      const found = Object.entries(res.metrics ?? {}) as [string, number][]
      if (found.length === 0) {
        setAutoStatus("error")
        setAutoError("Não encontrei métricas na página. Confirme que a tabela de campanhas está com as colunas visíveis (Impressões, CPM, Resultados etc.).")
        return
      }
      setValues((v) => ({ ...v, ...Object.fromEntries(found.map(([k, n]) => [k, String(n)])) }))
      if (res.name && !name) setName(res.name)
      setAutoFound(found.length)
      setAutoStatus("idle")
      setMode("manual") // reaproveita o formulário manual, já preenchido, para revisão
    } catch (e) {
      setAutoStatus("error")
      const msg = e instanceof Error ? e.message : String(e)
      setAutoError(
        msg.includes("Could not establish connection")
          ? "A extensão não conseguiu falar com a aba do Ads Manager. Recarregue a página do Facebook e tente de novo."
          : `Falha na detecção automática: ${msg}`
      )
    }
  }

  function buildInput(): AnalyzeInput {
    const metrics: Metrics = {}
    for (const f of [...FIELDS_DELIVERY, ...FIELDS_CREATIVE]) {
      const n = num(values[f.key] ?? "")
      if (n !== undefined) (metrics as Record<string, number>)[f.key] = normalizaCampo(f.key, n)
    }
    if (learningPhase !== "") metrics.learning_phase = learningPhase === "true"
    const targets: Targets = {}
    for (const f of FIELDS_TARGETS) {
      const n = num(values[f.key] ?? "")
      if (n !== undefined) (targets as Record<string, number>)[f.key] = normalizaCampo(f.key, n)
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

  async function runAnalyze(overrideInput?: AnalyzeInput) {
    setError(null)
    if (!overrideInput) {
      // Sem isto o formulário continuaria exibindo "120000,5" depois de enviar
      // 120000 — o gestor leria um número que não foi o analisado.
      setValues((atual) => {
        const ajustado = { ...atual }
        for (const f of [...FIELDS_DELIVERY, ...FIELDS_CREATIVE, ...FIELDS_TARGETS]) {
          const n = num(atual[f.key] ?? "")
          if (n === undefined) continue
          const norm = normalizaCampo(f.key, n)
          if (norm !== n) ajustado[f.key] = String(norm)
        }
        return ajustado
      })
    }
    const input = overrideInput ?? buildInput()

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
      setError(mensagemDeErro(e))
    }
  }

  const collecting = step >= 0

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && !collecting && onClose()}>
      <div className="modal">
        <div className="modal-grab" />
        <h2>Criar nova campanha</h2>
        <p className="sub">Insira manualmente, detecte na aba do Ads Manager ou importe um arquivo de dados.</p>

        {!collecting && (
          <div className="seg">
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><IconEdit />Inserir manual</button>
            <button className={mode === "auto" ? "active" : ""} onClick={() => setMode("auto")}><IconBolt />Coletar automático</button>
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}><IconRefresh />Importar arquivo</button>
          </div>
        )}

        {mode === "auto" && !collecting && (
          <div>
            <div className="detect"><span className="pulse" /><span>Coleta automática do <b>Meta Ads Manager</b></span></div>
            <button
              className="collect-btn"
              disabled={autoStatus === "detecting"}
              onClick={detectFromTab}
              style={autoStatus === "detecting" ? { opacity: 0.6, cursor: "wait" } : undefined}>
              <IconRefresh />{autoStatus === "detecting" ? "Lendo a página…" : "Detectar campanha na aba ativa"}
            </button>
            {autoError && (
              <div
                role="alert"
                style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "var(--red-bg)", color: "var(--red)", fontSize: 12.5, lineHeight: 1.45 }}>
                {autoError}
              </div>
            )}
            <p className="collect-hint">
              Provisório: lê a tabela de campanhas aberta na aba do Ads Manager (scraping da página). Frágil por
              natureza — confira os campos preenchidos antes de analisar. Será substituído pela Meta Marketing
              API (OAuth) antes do lançamento.
            </p>
          </div>
        )}
        {autoFound > 0 && mode === "manual" && !collecting && (
          <div style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "var(--amber-bg, rgba(245,158,11,.12))", color: "var(--amber)", fontSize: 12.5, lineHeight: 1.45 }}>
            {autoFound} campo(s) preenchido(s) automaticamente a partir da aba do Ads Manager — confira antes de analisar.
          </div>
        )}

        {mode === "file" && !collecting && (
          <div>
            <div className="detect"><span className="pulse" /><span>Importar dados de um <b>arquivo .json</b></span></div>

            <input
              className="file-input"
              type="file"
              accept=".json,.txt,application/json"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFileRaw(await f.text())
                setFilePreview(null)
                setFileError(null)
              }}
            />
            <textarea
              className="file-drop"
              rows={7}
              placeholder={'{\n  "campaign": { "name": "Black Friday" },\n  "metrics": { "cpa": 50, "impressions": 50000 },\n  "targets": { "max_cpa": 80 }\n}'}
              value={fileRaw}
              onChange={(e) => { setFileRaw(e.target.value); setFilePreview(null); setFileError(null) }}
            />

            <button
              className="collect-btn"
              style={{ marginTop: 10 }}
              onClick={() => {
                const result = parseFileJSON(fileRaw)
                if ("error" in result) { setFileError(result.error); setFilePreview(null); return }
                setFileError(null)
                setFilePreview(result)
              }}>
              <IconRefresh />Carregar e revisar
            </button>

            {fileError && (
              <div
                role="alert"
                style={{ margin: "10px 0", padding: "10px 12px", borderRadius: 10, background: "var(--red-bg)", color: "var(--red)", fontSize: 12.5, lineHeight: 1.45 }}>
                {fileError}
              </div>
            )}

            {filePreview && (
              <div className="grp" style={{ marginTop: 12 }}>
                <div className="grp-h">Pré-visualização — confira antes de analisar</div>
                <div style={{ fontSize: 12.5, color: "var(--txt-2)" }}>
                  <b style={{ color: "var(--txt)" }}>{filePreview.input.campaign.name}</b>
                  {" · "}{filePreview.input.campaign.objective}{" · "}{filePreview.input.campaign.platform}
                </div>

                {Object.keys(filePreview.input.metrics).length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>MÉTRICAS</div>
                    <ul className="preview-list">
                      {Object.entries(filePreview.input.metrics).map(([k, v]) => (
                        <li key={k}><span>{k}</span><span>{String(v)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {Object.keys(filePreview.input.targets).length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>METAS</div>
                    <ul className="preview-list">
                      {Object.entries(filePreview.input.targets).map(([k, v]) => (
                        <li key={k}><span>{k}</span><span>{String(v)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {filePreview.unknownKeys.length > 0 && (
                  <div style={{ color: "var(--amber)", fontSize: 11.5, marginTop: 10 }}>
                    Chaves desconhecidas ignoradas (não enviadas): {filePreview.unknownKeys.join(", ")}
                  </div>
                )}
                {filePreview.invalidTypeKeys.length > 0 && (
                  <div style={{ color: "var(--red)", fontSize: 11.5, marginTop: 6 }}>
                    Valores com tipo inválido ignorados (não enviados): {filePreview.invalidTypeKeys.join(", ")}
                  </div>
                )}
                {filePreview.invalidValueKeys.length > 0 && (
                  <div style={{ color: "var(--red)", fontSize: 11.5, marginTop: 6 }}>
                    Valor fora da lista aceita — revise antes de analisar: {filePreview.invalidValueKeys.join(", ")}
                  </div>
                )}

                <button className="submit" style={{ marginTop: 12 }} onClick={() => runAnalyze(filePreview.input)}>
                  Analisar campanha
                </button>
              </div>
            )}

            <p className="collect-hint">
              Formato: JSON com os blocos <code>campaign</code>, <code>metrics</code>, <code>targets</code> — mesmo
              esquema do backend (ver CONTRATO_API_FRONTEND.md). Cada chave só é copiada para o campo de mesmo
              nome — "cpa" nunca vira "cpc". Chaves desconhecidas ou com tipo errado nunca são enviadas: aparecem
              acima como aviso.
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
                    <option value="tiktok_ads">TikTok Ads</option>
                    <option value="linkedin_ads">LinkedIn Ads</option>
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
                {/* Tri-estado de propósito, não checkbox. Um checkbox desmarcado
                    afirmaria "não está em aprendizado" para quem simplesmente
                    não sabe — inventar evidência favorável é exatamente o
                    defeito que o gate do Cenário G existe para impedir. */}
                <div className="fld" style={{ gridColumn: "1/3" }}>
                  <label>Aprendizado limitado</label>
                  <select value={learningPhase} onChange={(e) => setLearningPhase(e.target.value)}>
                    <option value="">Não informado</option>
                    <option value="false">Não — conjunto já saiu do aprendizado</option>
                    <option value="true">Sim — conjunto em aprendizado limitado</option>
                  </select>
                </div>
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

            <button className="submit" onClick={() => runAnalyze()}>Analisar campanha</button>
          </div>
        )}
      </div>
    </div>
  )
}
