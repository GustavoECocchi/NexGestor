import { useEffect, useRef, useState } from "react"

import { FieldHint } from "~components/FieldHint"
import { IconCheck, IconEdit, IconRefresh } from "~components/Icons"
import { responseToVM } from "~lib/adapt"
import { registrarAnalise } from "~lib/aiHealth"
import {
  analyzeCampaign,
  API_BASE,
  IS_LOCAL_BACKEND,
  isApiError,
  isMetricConsistencyError,
  type ErroConsistenciaMetrica
} from "~lib/api"
import { isCampaignNiche, NICHE_LABELS, NICHE_VALUES } from "~lib/niche"
import { nextLiveId } from "~lib/store"
import type { AnalyzeInput, CampaignNiche, CampaignVM, Metrics, Targets } from "~types"

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

type Field = { label: string; key: string; ph?: string; inteiro?: boolean; hint: string }

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
  { label: "Impressões", key: "impressions", ph: "0", inteiro: true, hint: "Quantas vezes seu anúncio foi exibido, no total." },
  { label: "Investimento (R$)", key: "spend", ph: "0", hint: "Quanto você já investiu nessa campanha." },
  { label: "CPM", key: "cpm", ph: "0", hint: "Quanto você paga a cada 1.000 exibições do anúncio." },
  { label: "CPC", key: "cpc", ph: "0", hint: "Quanto você paga, em média, cada vez que alguém clica no anúncio." },
  { label: "CPA", key: "cpa", ph: "0", hint: "Quanto custou, em média, cada conversão (venda, cadastro etc.) gerada." },
  // CPL destrava o Cenário F (Lead Frio), inalcançável pelo formulário até
  // 2026-08-01: o engine lê `cpl`, mas não havia onde informá-lo.
  { label: "CPL", key: "cpl", ph: "0", hint: "Quanto custou, em média, cada lead (contato captado) gerado." },
  { label: "ROAS", key: "roas", ph: "0", hint: "Quanto voltou em receita para cada R$1 investido. 2x = dobrou o dinheiro investido." }
]
const FIELDS_CREATIVE: Field[] = [
  { label: "Hook rate (%)", key: "hook_rate", ph: "0", hint: "De quem viu o anúncio, quantos assistiram pelo menos 3 segundos — mede se o começo prende atenção." },
  // Ajuda corrigida em 2026-09-09 (P5): dizia "de quem começou a assistir,
  // quantos ficaram até a metade" — duas coisas erradas ao mesmo tempo. O
  // denominador é `impressions`, não quem começou a assistir (tabela de
  // derivação em docs/CONTRATO_API_FRONTEND.md), e "até a metade" descreve
  // `video_views_50pct`, outro campo.
  //
  // A primeira correção trocou isso por "assistido quase inteiro — pelo menos
  // 15 segundos, ou até 97% dele", o que trouxe dois problemas: 15s de um
  // vídeo longo não é "quase inteiro" (a frase se contradizia), e o limiar em
  // si não tem fonte conferida — a página primária da Meta sobre ThruPlay não
  // abriu na consulta de 2026-09-09. O texto agora aponta o campo do relatório
  // e diz o que ele conta, sem afirmar o limiar. Ver a mensagem equivalente em
  // app/service/metric_consistency.py.
  { label: "Hold rate (%)", key: "hold_rate", ph: "0", hint: "De quantas vezes o anúncio apareceu, em quantas o vídeo foi reproduzido por tempo suficiente para a plataforma contar como ThruPlay. É o número do campo 'ThruPlays' do seu relatório." },
  { label: "CTR link (%)", key: "ctr_link", ph: "0", hint: "De quem viu o anúncio, quantos clicaram para ir ao seu site/página." },
  { label: "CTR todos (%)", key: "ctr_all", ph: "0", hint: "Como o CTR link, mas conta qualquer clique no anúncio (curtir, comentar etc.), não só o link." },
  { label: "Frequência", key: "frequency", ph: "0", hint: "Quantas vezes, em média, a mesma pessoa viu esse anúncio. Número alto pode cansar o público." },
  { label: "Conversões", key: "conversions", ph: "0", inteiro: true, hint: "Quantas vendas, cadastros ou outra ação que você definiu como meta já aconteceram." },
  // Cliques no link + visitas à página destravam os Cenários D (desalinhamento
  // com a landing page) e N (vazamento entre o clique e a página) — dois dos
  // quatro diagnósticos que o formulário manual não conseguia produzir.
  { label: "Cliques no link", key: "link_clicks", ph: "0", inteiro: true, hint: "Quantas vezes clicaram para ir do anúncio até seu site." },
  { label: "Visitas à página", key: "landing_page_views", ph: "0", inteiro: true, hint: "Quantas dessas pessoas realmente abriram sua página de destino." },
  // Conversões/semana e fase de aprendizado entraram aqui porque o engine passou
  // a EXIGIR estado de aprendizado para abrir a janela de escala vertical (ver
  // _evidencia_faltante_para_escala no backend). Sem estes campos o formulário
  // manual não conseguia satisfazer a regra: nem a campanha mais saudável
  // recebia a análise de escala — o critério ficaria inalcançável por construção.
  { label: "Conversões/semana", key: "weekly_conversions", ph: "0", inteiro: true, hint: "Quantas conversões essa campanha costuma gerar por semana." }
]
const FIELDS_TARGETS: Field[] = [
  { label: "CPA máx.", key: "max_cpa", ph: "0", hint: "O quanto, no máximo, você aceita pagar por cada conversão antes de considerar caro." },
  // CPL máx. acompanha o CPL acima (Cenário F). CPM máx. destrava o Cenário J
  // (leilão caro) e é o teto que o Cenário G consulta para NÃO recomendar
  // escala num leilão já acima do limite.
  { label: "CPL máx.", key: "max_cpl", ph: "0", hint: "O quanto, no máximo, você aceita pagar por cada lead antes de considerar caro." },
  { label: "CPM máx.", key: "max_cpm", ph: "25", hint: "O quanto, no máximo, você aceita pagar a cada 1.000 exibições antes de considerar caro." },
  { label: "ROAS mín.", key: "min_roas", ph: "0", hint: "O retorno mínimo que você espera para cada R$1 investido." },
  { label: "CTR link mín. (%)", key: "min_ctr_link", ph: "1.5", hint: "A taxa mínima de cliques que você espera do anúncio." },
  { label: "Hook rate mín. (%)", key: "min_hook_rate", ph: "35", hint: "A taxa mínima de \"prendeu atenção nos 3s iniciais\" que você espera." }
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
/**
 * Campos que entram nas regras de consistência do backend (P5).
 *
 * Um valor inválido NESTES campos não pode virar "campo ausente" nem virar um
 * valor diferente: o backend deriva a taxa a partir dos brutos e aceitaria a
 * campanha, que é exatamente o que a regra existe para impedir (achado 4 da
 * revisão Codex, 2026-09-08 — `ctr_link: "0,4"` no arquivo era descartado e a
 * campanha passava).
 *
 * Isto NÃO é uma cópia da matriz de regras: a comparação continua sendo feita
 * só no backend. Aqui só se decide o que fazer com um valor que sequer é uma
 * contagem ou taxa possível — bloquear em vez de apagar ou arredondar.
 */
const CAMPOS_P5 = new Set<string>([
  "impressions", "video_views_3s", "thruplays", "link_clicks", "all_clicks",
  "landing_page_views", "conversions",
  "hook_rate", "hold_rate", "ctr_link", "ctr_all", "lp_conversion_rate"
])

/** Rótulo legível de um campo de métrica, para as mensagens de bloqueio. */
const ROTULO_P5: Record<string, string> = {
  impressions: "Impressões",
  video_views_3s: "Visualizações de 3s",
  thruplays: "ThruPlays",
  link_clicks: "Cliques no link",
  all_clicks: "Cliques (todos os tipos)",
  landing_page_views: "Visitas à página",
  conversions: "Conversões",
  hook_rate: "Hook rate (%)",
  hold_rate: "Hold rate (%)",
  ctr_link: "CTR link (%)",
  ctr_all: "CTR todos (%)",
  lp_conversion_rate: "Conversão na página (%)"
}

export function rotuloDoCampo(chave: string): string {
  return ROTULO_P5[chave] ?? chave
}

/**
 * Por que um valor JÁ NUMÉRICO de um campo de P5 não pode seguir — ou `null`.
 *
 * Achado 4 da revisão Codex de 2026-09-09: `normalizaCampo` arredondava os
 * campos inteiros com `Math.round` ANTES de qualquer verificação, nos dois
 * modos. `link_clicks: -0.4` virava `-0`, que sai como `0` no JSON: o backend
 * recusa o valor original (`ge=0`, `int`) e aceita o normalizado. Uma campanha
 * inválida passava a existir porque o cliente "consertou" o número sozinho.
 *
 * A resposta é bloquear e explicar, preservando o que a pessoa escreveu —
 * nunca reescrever o valor. Vale só para os campos de P5; os demais campos
 * inteiros continuam sendo arredondados como sempre (ver `normalizaCampo`).
 */
export function problemaEmValorP5(chave: string, valor: number): string | null {
  if (!CAMPOS_P5.has(chave)) return null
  const rotulo = rotuloDoCampo(chave)
  if (valor < 0) {
    return (
      `O campo '${rotulo}' está preenchido com um número negativo (${String(valor)}). ` +
      "Nenhum desses números pode ser menor que zero — nem uma contagem, nem uma taxa. " +
      "Corrija o valor ou apague o campo."
    )
  }
  if (CAMPOS_INTEIROS.has(chave) && !Number.isInteger(valor)) {
    return (
      `O campo '${rotulo}' está preenchido com ${String(valor)}, que não é um número ` +
      "inteiro. Esse campo conta quantas vezes algo aconteceu, e não existe meia " +
      "vez. Escreva o número inteiro que você quer informar."
    )
  }
  return null
}

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

/**
 * Mesma ideia de `pickEnum`, mas SEM default: `niche` (fase-2b) não tem um
 * valor neutro seguro — inventar um atribuiria ao gestor uma escolha que ele
 * nunca fez (mesmo erro de "zero fabricado" já corrigido em 2026-07-28 para
 * métricas). Ausente OU fora da lista viram `undefined`, registrados do
 * mesmo jeito em `invalidos` — o chamador é quem decide bloquear a análise.
 */
function pickEnumObrigatorio<T extends string>(
  v: unknown,
  ehValido: (v: unknown) => v is T,
  campo: string,
  invalidos: string[]
): T | undefined {
  if (ehValido(v)) return v
  invalidos.push(`${campo} (${v == null ? "ausente" : `"${String(v)}"`} → obrigatório, selecione um valor válido)`)
  return undefined
}

export type ParsedFile = {
  input: AnalyzeInput
  unknownKeys: string[]
  invalidTypeKeys: string[]
  /** Campos de lista fechada com valor fora da lista (ex: plataforma com typo). */
  invalidValueKeys: string[]
  /**
   * Campos de P5 com valor inválido — impedem analisar (não são "ignorados"
   * nem "corrigidos"). Os demais campos continuam sendo descartados com aviso
   * (valor de tipo errado) ou arredondados (contagem fracionária), como antes.
   */
  bloqueios: { key: string; message: string }[]
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
  const bloqueios: { key: string; message: string }[] = []

  for (const [k, v] of Object.entries(rawMetrics)) {
    if (!METRIC_KEYS.includes(k as keyof Metrics)) { unknownKeys.push(`metrics.${k}`); continue }
    if (k === "learning_phase") {
      if (typeof v === "boolean") (metrics as Record<string, unknown>)[k] = v
      else invalidTypeKeys.push(`metrics.${k}`)
    } else if (typeof v === "number" && Number.isFinite(v)) {
      // A verificação vem ANTES de `normalizaCampo`: arredondar primeiro é o
      // que transformava `-0.4` em `0` e fazia o backend aceitar (achado 4).
      const problema = problemaEmValorP5(k, v)
      if (problema) bloqueios.push({ key: k, message: `${problema} Corrija o arquivo e importe de novo.` })
      else (metrics as Record<string, number>)[k] = normalizaCampo(k, v)
    } else {
      invalidTypeKeys.push(`metrics.${k}`)
      // Descartar um valor inválido de campo de P5 transformaria erro em
      // ausência e deixaria o backend derivar a taxa dos brutos.
      if (CAMPOS_P5.has(k)) {
        bloqueios.push({
          key: k,
          message:
            `O campo '${rotuloDoCampo(k)}' está preenchido com um valor que não é um número. ` +
            "Ele não vai ser apagado nem ignorado: corrija o valor no arquivo (só o número, " +
            "sem aspas) e importe de novo, ou remova esse campo do arquivo se você não tem o dado."
        })
      }
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
  // `niche` (fase-2b): ausente ou fora da lista bloqueia "Analisar campanha"
  // (ver `runAnalyze`) — nunca cai num default inventado.
  const nicheFromFile = pickEnumObrigatorio(rawCampaign.niche, isCampaignNiche, "campaign.niche", invalidValueKeys)

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

  return { input, unknownKeys, invalidTypeKeys, invalidValueKeys, bloqueios }
}

/**
 * Problemas nos campos de P5 preenchidos no formulário manual.
 *
 * Duas portas para o mesmo buraco, as duas fechadas aqui:
 *   • texto que não é número — `num()` devolve `undefined` e o campo sumia do
 *     payload ("erro vira ausência", achado 4 de 2026-09-08);
 *   • número que não é uma contagem/taxa possível — `normalizaCampo` o
 *     arredondava antes de sair ("erro vira valor válido", achado 4 de
 *     2026-09-09). Ver `problemaEmValorP5`.
 */
export function problemasP5NoFormulario(
  valores: Record<string, string>
): { key: string; message: string }[] {
  const problemas: { key: string; message: string }[] = []
  for (const f of [...FIELDS_DELIVERY, ...FIELDS_CREATIVE]) {
    if (!CAMPOS_P5.has(f.key)) continue
    const escrito = (valores[f.key] ?? "").trim()
    if (escrito === "") continue
    const n = num(escrito)
    if (n === undefined) {
      problemas.push({ key: f.key, message: mensagemCampoNaoNumerico(f.key, escrito) })
      continue
    }
    const problema = problemaEmValorP5(f.key, n)
    if (problema) problemas.push({ key: f.key, message: problema })
  }
  return problemas
}

/** Mensagem de um campo de P5 preenchido com texto que não é número. */
export function mensagemCampoNaoNumerico(chave: string, escrito: string): string {
  return (
    `O campo '${rotuloDoCampo(chave)}' está preenchido com "${escrito.trim()}", ` +
    "que não é um número. Escreva só o número (use vírgula para os decimais, " +
    "como 1,5) ou apague o campo. Se ficar assim, esse valor seria descartado " +
    "e a campanha analisada como se você não tivesse informado nada nele."
  )
}

/**
 * Campos que a importação realmente descartou — os bloqueados ficam de fora,
 * porque nada foi descartado neles: a análise inteira está parada por eles.
 */
export function ignoradosNaPreVisualizacao(arquivo: ParsedFile): string[] {
  const bloqueados = new Set(arquivo.bloqueios.map((b) => `metrics.${b.key}`))
  return arquivo.invalidTypeKeys.filter((k) => !bloqueados.has(k))
}

/**
 * Um problema apontado na última tentativa de analisar.
 *
 * `revalidar` marca que um dos campos envolvidos foi editado DEPOIS da
 * rejeição: não sabemos mais se o problema continua, e afirmar que ele foi
 * resolvido seria mentira (achado 5 da revisão Codex, 2026-09-08 — trocar
 * 0,4 por 1,5 com 100 impressões e 50 cliques apagava o alerta embora os
 * números continuassem incompatíveis). Quem decide é a próxima análise.
 */
type ErroDeConsistencia = ErroConsistenciaMetrica & { revalidar?: boolean }

export function NewCampaignModal({
  onClose,
  onAnalyzed
}: {
  onClose: () => void
  /**
   * `input` (fase-2b) vai junto de propósito: quem orquestra o
   * enriquecimento de benchmark (`App.tsx`) precisa de `campaign.niche`/
   * `platform`/`objective` CRUS, que não fazem parte do `CampaignVM`
   * persistido. Ver achado da revisão Opus (2026-09-04): o enriquecimento
   * não pode rodar AQUI, porque este componente desmonta assim que
   * `onAnalyzed` é chamado (`onClose`/`setModal("none")` no mesmo tick) —
   * uma promise em voo continuaria rodando, mas sem ninguém pra receber o
   * resultado com segurança.
   */
  onAnalyzed: (vm: CampaignVM, input: AnalyzeInput) => void
}) {
  // "auto" (coleta via content script no Ads Manager) existia só na extensão
  // — fora de escopo aqui, ver storage.py/CLAUDE.md sobre o pivô extensão →
  // dashboard. Fica "manual" | "file" até a Meta Marketing API (OAuth) entrar.
  const [mode, setMode] = useState<"manual" | "file">("manual")
  const [step, setStep] = useState(-1) // -1 = idle
  const [error, setError] = useState<string | null>(null)
  // P5 (2026-09-08): contradições entre métricas, devolvidas pelo backend já
  // associadas aos campos envolvidos (ver ~lib/api), mais os bloqueios locais
  // de valor não numérico. Vazio fora de uma tentativa rejeitada.
  const [fieldErrors, setFieldErrors] = useState<ErroDeConsistencia[]>([])
  const [name, setName] = useState("")
  // "" = não informado. Nunca vira `false` sozinho — ver comentário no <select>.
  const [learningPhase, setLearningPhase] = useState("")
  const [objective, setObjective] = useState("conversion")
  const [platform, setPlatform] = useState("meta_ads")
  // "" = não escolhido. Ao contrário de objective/platform, não tem default
  // seguro (fase-2b) — `runAnalyze` bloqueia a análise enquanto estiver "".
  const [niche, setNiche] = useState<CampaignNiche | "">("")
  const [values, setValues] = useState<Record<string, string>>({})
  const [fileRaw, setFileRaw] = useState("")
  const [fileError, setFileError] = useState<string | null>(null)
  const [filePreview, setFilePreview] = useState<ParsedFile | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const setV = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    // Editar NÃO apaga o problema: marca que ele precisa ser conferido de novo.
    // O cliente não repete a comparação (a regra vive só no backend), então a
    // única coisa honesta a dizer aqui é "mudou, analise de novo para saber".
    // Erros que não citam este campo continuam confirmados, sem serem escondidos.
    setFieldErrors((atual) =>
      atual.map((fe) => (fe.fields.includes(key) ? { ...fe, revalidar: true } : fe))
    )
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
        platform,
        niche: niche || undefined
      },
      metrics,
      targets
    }
  }

  async function runAnalyze(overrideInput?: AnalyzeInput) {
    setError(null)
    setFieldErrors([])
    if (!overrideInput) {
      // Campo de P5 com valor impossível: bloquear ANTES de qualquer coisa —
      // inclusive antes da reescrita de normalização logo abaixo, que é o que
      // transformava "-0,4" em "0" na tela e no payload (achado 4, 2026-09-09).
      // O que a pessoa escreveu fica exatamente como está.
      const problemas = problemasP5NoFormulario(values)
      if (problemas.length > 0) {
        setFieldErrors(problemas.map((p) => ({ fields: [p.key], message: p.message })))
        return
      }
      // Sem isto o formulário continuaria exibindo "120000,5" depois de enviar
      // 120000 — o gestor leria um número que não foi o analisado. Só chega
      // aqui o que já passou pelo bloqueio acima.
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
    // niche (fase-2b) não tem default seguro — ver comentário no <select> e em
    // parseFileJSON. Bloqueia aqui em vez de inventar um valor, pros dois
    // modos (manual e arquivo).
    if (!input.campaign.niche) {
      setError("Selecione o nicho da campanha antes de analisar.")
      return
    }

    setStep(0)
    timer.current = setTimeout(() => setStep(1), 500) // request em voo

    try {
      const res = await analyzeCampaign(input)
      clearTimeout(timer.current)
      setStep(2)
      // Único ponto do produto que sabe se a IA REALMENTE respondeu. O
      // `/status` só diz se ela está configurada — chave revogada ou cota
      // estourada passam por lá como "disponível". Ver ~lib/aiHealth.
      registrarAnalise(res.ai_insights != null)
      const vm = responseToVM(res, input)

      // Entrega IMEDIATA (fase-2b, achado da revisão Opus): a análise do
      // engine já está pronta — o enriquecimento de benchmark de mercado
      // roda depois, em segundo plano, orquestrado por quem chama
      // `onAnalyzed` (`App.tsx`), nunca aqui. Prender a tela esperando uma
      // chamada extra ao Gemini seria pior que mostrar o resultado e
      // atualizar a campanha silenciosamente quando (e se) a referência
      // chegar.
      timer.current = setTimeout(() => onAnalyzed(vm, input), 450)
    } catch (e) {
      clearTimeout(timer.current)
      setStep(-1)
      // P5: contradição/impossibilidade nos dados — não é falha de rede nem
      // bug do servidor, então não passa por `mensagemDeErro`. Os valores
      // preenchidos continuam no formulário (nunca limpamos `values` aqui).
      if (isMetricConsistencyError(e)) {
        setFieldErrors(e.fieldErrors)
        return
      }
      setError(mensagemDeErro(e))
    }
  }

  const collecting = step >= 0

  /** Índice em `fieldErrors` do primeiro erro que envolve este campo, ou -1. */
  const erroIndexDoCampo = (key: string) => fieldErrors.findIndex((fe) => fe.fields.includes(key))

  /**
   * Acessibilidade e realce de um campo citado num erro.
   *
   * `aria-invalid` só enquanto o problema está CONFIRMADO pela última análise.
   * Depois de editar o campo, a explicação continua associada (`describedby`),
   * mas não afirmamos mais que o valor é inválido — ninguém revalidou ainda.
   */
  const propsDeErro = (errIdx: number) => {
    if (errIdx < 0) return {}
    const pendente = fieldErrors[errIdx].revalidar === true
    return {
      "aria-invalid": pendente ? undefined : true,
      "aria-describedby": `consistencia-erro-${errIdx}`,
      style: { borderColor: pendente ? "var(--amber)" : "var(--red)" }
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && !collecting && onClose()}>
      <div className="modal">
        <div className="modal-grab" />
        <h2>Criar nova campanha</h2>
        <p className="sub">Insira manualmente ou importe um arquivo de dados.</p>

        {!collecting && (
          <div className="seg">
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}><IconEdit />Inserir manual</button>
            <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}><IconRefresh />Importar arquivo</button>
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
              style={{ marginTop: 14 }}
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
                style={{ margin: "14px 0", padding: "14px 16px", borderRadius: 12, background: "var(--red-bg)", color: "var(--red)", fontSize: "var(--text-body)", lineHeight: 1.6 }}>
                {fileError}
              </div>
            )}

            {filePreview && (
              <div className="grp" style={{ marginTop: 16 }}>
                <div className="grp-h">Pré-visualização — confira antes de analisar</div>
                <div style={{ fontSize: "var(--text-body)", color: "var(--txt-2)" }}>
                  <b style={{ color: "var(--txt)" }}>{filePreview.input.campaign.name}</b>
                  {" · "}{filePreview.input.campaign.objective}{" · "}{filePreview.input.campaign.platform}
                  {" · "}{filePreview.input.campaign.niche ? NICHE_LABELS[filePreview.input.campaign.niche] : "nicho ausente"}
                </div>

                {Object.keys(filePreview.input.metrics).length > 0 && (
                  <>
                    <div style={{ fontSize: "var(--text-label)", color: "var(--txt-2)", marginTop: 14 }}>MÉTRICAS</div>
                    <ul className="preview-list">
                      {Object.entries(filePreview.input.metrics).map(([k, v]) => (
                        <li key={k}><span>{k}</span><span>{String(v)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {Object.keys(filePreview.input.targets).length > 0 && (
                  <>
                    <div style={{ fontSize: "var(--text-label)", color: "var(--txt-2)", marginTop: 14 }}>METAS</div>
                    <ul className="preview-list">
                      {Object.entries(filePreview.input.targets).map(([k, v]) => (
                        <li key={k}><span>{k}</span><span>{String(v)}</span></li>
                      ))}
                    </ul>
                  </>
                )}
                {filePreview.unknownKeys.length > 0 && (
                  <div style={{ color: "var(--amber)", fontSize: "var(--text-body)", marginTop: 14 }}>
                    Chaves desconhecidas ignoradas (não enviadas): {filePreview.unknownKeys.join(", ")}
                  </div>
                )}
                {ignoradosNaPreVisualizacao(filePreview).length > 0 && (
                  <div style={{ color: "var(--red)", fontSize: "var(--text-body)", marginTop: 8 }}>
                    Valores com tipo inválido ignorados (não enviados):{" "}
                    {ignoradosNaPreVisualizacao(filePreview).join(", ")}
                  </div>
                )}

                {/* P5: estes NÃO são "ignorados" nem corrigidos — impedem
                    analisar, porque descartá-los (ou arredondá-los) faria o
                    backend derivar a taxa dos brutos e aceitar a campanha. */}
                {filePreview.bloqueios.length > 0 && (
                  <div
                    role="alert"
                    style={{
                      marginTop: 12, padding: "14px 16px", borderRadius: 12,
                      background: "var(--red-bg)", color: "var(--red)",
                      fontSize: "var(--text-body)", lineHeight: 1.6
                    }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>
                      O arquivo não pode ser analisado como está.
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>
                      {filePreview.bloqueios.map((b) => (
                        <li key={b.key}>{b.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {filePreview.invalidValueKeys.length > 0 && (
                  <div style={{ color: "var(--red)", fontSize: "var(--text-body)", marginTop: 8 }}>
                    Valor fora da lista aceita — revise antes de analisar: {filePreview.invalidValueKeys.join(", ")}
                  </div>
                )}

                <button
                  className="submit"
                  style={{ marginTop: 16 }}
                  disabled={filePreview.bloqueios.length > 0}
                  onClick={() => runAnalyze(filePreview.input)}>
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
                    {i < step ? <IconCheck style={{ width: 20, height: 20, color: "var(--green)" }} /> : i === step ? <div className="spin" /> : null}
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
              margin: "14px 0",
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: "var(--text-body)",
              lineHeight: 1.6
            }}>
            {error}
          </div>
        )}

        {/* P5: sempre visível (nunca só em hover), independe do modo — vale
            tanto para manual (balões associados abaixo) quanto para importação
            de arquivo, que não tem inputs individuais para ancorar o balão. */}
        {fieldErrors.length > 0 && !collecting && (
          <div
            role="alert"
            style={{
              margin: "14px 0",
              padding: "14px 16px",
              borderRadius: 12,
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: "var(--text-body)",
              lineHeight: 1.6
            }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              Alguns dados não combinam entre si — corrija antes de analisar:
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
              {fieldErrors.map((fe, i) => (
                <li key={i} id={`consistencia-erro-${i}`}>
                  {fe.message}
                  {fe.revalidar && (
                    <>
                      {" "}
                      <b>Você mudou um desses campos. Clique em “Analisar campanha”
                      para conferir se agora os números combinam.</b>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === "manual" && !collecting && (
          <div>
            <div className="grp">
              <div className="grp-h">Identificação</div>
              <div className="fld-grid">
                {/* "1/-1" (não "1/3"): a última linha, seja lá qual for —
                    "1/3" faria o grid de 1 coluna do mobile (docs/rascunho_
                    prompt.md, 2026-09-05) criar uma 2ª coluna implícita só
                    pra caber o span, e Objetivo/Plataforma auto-posicionados
                    voltavam a aparecer lado a lado mesmo com 1 coluna
                    declarada — achado ao validar o formulário em 390px. */}
                <div className="fld" style={{ gridColumn: "1/-1" }}>
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
                <div className="fld">
                  <label>
                    Nicho
                    <FieldHint text="Usado só para buscar um benchmark de mercado nas métricas sem meta definida — não muda o diagnóstico do engine." />
                  </label>
                  <select
                    value={niche}
                    onChange={(e) => setNiche(e.target.value as CampaignNiche | "")}
                  >
                    <option value="">Selecione…</option>
                    {NICHE_VALUES.map((v) => (
                      <option key={v} value={v}>{NICHE_LABELS[v]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grp">
              <div className="grp-h">Entrega &amp; custo</div>
              <div className="fld-grid">
                {FIELDS_DELIVERY.map((f) => {
                  const errIdx = erroIndexDoCampo(f.key)
                  return (
                    <div className="fld" key={f.key}>
                      <label>{f.label}<FieldHint text={f.hint} /></label>
                      <input
                        inputMode="decimal" placeholder={f.ph} value={values[f.key] ?? ""} onChange={setV(f.key)}
                        {...propsDeErro(errIdx)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grp">
              <div className="grp-h">Criativo &amp; cliques</div>
              <div className="fld-grid">
                {FIELDS_CREATIVE.map((f) => {
                  const errIdx = erroIndexDoCampo(f.key)
                  return (
                    <div className="fld" key={f.key}>
                      <label>{f.label}<FieldHint text={f.hint} /></label>
                      <input
                        inputMode="decimal" placeholder={f.ph} value={values[f.key] ?? ""} onChange={setV(f.key)}
                        {...propsDeErro(errIdx)}
                      />
                    </div>
                  )
                })}
                {/* Tri-estado de propósito, não checkbox. Um checkbox desmarcado
                    afirmaria "não está em aprendizado" para quem simplesmente
                    não sabe — inventar evidência favorável é exatamente o
                    defeito que o gate do Cenário G existe para impedir. */}
                {/* "1/-1" (não "1/3"): a última linha, seja lá qual for —
                    "1/3" faria o grid de 1 coluna do mobile (docs/rascunho_
                    prompt.md, 2026-09-05) criar uma 2ª coluna implícita só
                    pra caber o span, e Objetivo/Plataforma auto-posicionados
                    voltavam a aparecer lado a lado mesmo com 1 coluna
                    declarada — achado ao validar o formulário em 390px. */}
                <div className="fld" style={{ gridColumn: "1/-1" }}>
                  <label>
                    Aprendizado limitado
                    <FieldHint text={'As plataformas de anúncio (Meta, Google...) levam um tempo "aprendendo" o público ideal para sua campanha. Marque "Sim" se ela ainda está nessa fase inicial. Deixe "Não informado" se você não sabe.'} />
                  </label>
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
                    <label>{f.label}<FieldHint text={f.hint} /></label>
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
