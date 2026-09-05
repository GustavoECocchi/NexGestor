import { getDono } from "~lib/dono"
import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM, ResultadoBenchmark } from "~types"

// Base do backend FastAPI. Defina VITE_API_BASE no .env para produção (ver
// .env.example). As mensagens de erro citam o endereço REAL configurado, não
// um localhost que o usuário nunca setou.
export const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://localhost:8000"

/** True quando o build aponta pra um backend local (modo desenvolvedor). */
export const IS_LOCAL_BACKEND = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(
  API_BASE
)

// A análise leva ~0,2s sem IA e ~3s com IA (o backend corta o Gemini em 8s).
// 30s é folga larga; existe para o caso em que o servidor aceita a conexão e
// depois trava — sem isto, o `fetch` fica pendurado para sempre e a tela
// permanece em "analisando" sem saída. Em localhost isso quase não acontecia;
// contra um servidor remoto, acontece.
const TIMEOUT_MS = 30_000

/**
 * Erro cuja mensagem JÁ ESTÁ ESCRITA para o usuário final: a UI mostra o texto
 * como está, sem embrulhar em "A análise falhou: ...".
 *
 * O embrulho não é cosmético — ele contradiz a mensagem. Dizer "a análise
 * falhou" quando o servidor está só ocupado manda o gestor procurar defeito
 * nos dados da campanha dele, que estão perfeitos.
 */
export class ApiError extends Error {
  readonly userFacing = true

  constructor(message: string) {
    super(message)
    this.name = "ApiError"
  }
}

/**
 * Duck-typing em vez de `instanceof`: o bundler pode duplicar o módulo entre
 * o content script e o side panel, e aí `instanceof` falharia para um erro
 * legítimo — a UI voltaria a embrulhar a mensagem sem ninguém perceber.
 */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof Error && (e as Partial<ApiError>).userFacing === true
}

/**
 * Abort do nosso timeout.
 *
 * Checa só o `name`, sem `instanceof` nenhum, porque as duas formas óbvias
 * falham em algum runtime: `instanceof DOMException` quebra onde esse global
 * não existe, e `instanceof Error` é FALSE para DOMException no jsdom (medido
 * — no Chrome é true). Errar aqui não dá erro visível: o abort escaparia como
 * exceção crua e o usuário leria "A análise falhou: aborted".
 */
function foiAbortado(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "AbortError"
  )
}

/**
 * Chama o engine determinístico (Fase E).
 * Rota real do backend: /api/v1/campaign/analyze
 * (main.py inclui o router com prefixo settings.API_V1_STR = "/api/v1").
 */
export async function analyzeCampaign(
  input: AnalyzeInput
): Promise<CampaignAnalysisResponse> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${API_BASE}/api/v1/campaign/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: ctrl.signal
    })

    // ⚠️ Os status abaixo só chegam até aqui se a origem do dashboard estiver
    // em CORS_ORIGINS no backend (app/core/config.py) — sem isso o navegador
    // bloqueia a resposta antes do JS conseguir ler o status, e tudo vira
    // "Failed to fetch". Isso vale tanto pro 200 quanto pro erro do proxy
    // (429/502/503/504): um 429 do nginx sem cabeçalho CORS é bloqueado do
    // mesmo jeito que seria um 200 sem CORS — a diferença entre "origem
    // liberada" e "origem não liberada" aparece justamente nesses erros.
    //
    // 429/503 = limite de requisições. Vale distinguir: a campanha não tem
    // problema nenhum, é só esperar. O nginx do VPS responde 503 quando o
    // `limit_req_status 429` não está configurado — por isso os dois.
    if (res.status === 429 || res.status === 503) {
      throw new ApiError(
        "O servidor está recebendo muitas análises agora. Espere um minuto e tente de novo."
      )
    }

    // Atrás de um proxy, backend caído é 502 e backend travado é 504 — os dois
    // são "o servidor", nunca os dados de quem está usando.
    if (res.status === 502 || res.status === 504) {
      throw new ApiError(
        "O servidor está fora do ar no momento. Tente de novo em alguns minutos; se continuar, avise o responsável técnico."
      )
    }

    // Demais códigos ficam crus de propósito: são inesperados, e o número é o
    // que permite alguém diagnosticar.
    if (!res.ok) throw new Error(`Falha na análise: ${res.status}`)

    // A leitura do corpo fica DENTRO do timeout: cabeçalhos podem chegar
    // rápido e o corpo nunca terminar. Cancelar o timer antes disto deixaria a
    // tela em "analisando" para sempre — o caso que este timeout existe para
    // cobrir (coberto por teste).
    return (await res.json()) as CampaignAnalysisResponse
  } catch (e) {
    // AbortError só acontece pelo nosso timeout — o usuário não cancela nada.
    if (foiAbortado(e)) {
      throw new ApiError(
        `O servidor não respondeu em ${TIMEOUT_MS / 1000}s. Tente de novo em alguns minutos.`
      )
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

// =============================================================================
// Benchmark de mercado (fase-2b) — enriquece tiles sem meta do gestor.
// =============================================================================

/**
 * Um item de `resultados` é aceito só se obedecer ao discriminante inteiro
 * (`encontrado: true` exige `value` finito + `fonte` + `fonte_url` http(s) +
 * `capturado_em`; `encontrado: false` exige `motivo`), a métrica pertencer à
 * lista PEDIDA e não se repetir. Qualquer desvio — tipo errado, campo
 * faltando, métrica que ninguém pediu, HTML/JSON parcial — descarta o
 * corpo INTEIRO (`null`), nunca deixa um item malformado seguir sozinho
 * (achado da revisão Opus, 2026-09-04: um item `null`/incoerente chegava
 * intacto até `aplicarBenchmark` e quebrava a entrega da análise principal).
 */
/**
 * URL exibível como link: http(s) COM host analisável. Prefixo não basta —
 * `https://` sozinho passava na versão anterior (revisão Opus, 2026-09-05) e
 * viraria um `href` quebrado na UI. Espelha `url_publica_valida` do backend.
 */
export function urlDeFonteValida(url: unknown): url is string {
  if (typeof url !== "string" || !url.trim()) return false
  try {
    const u = new URL(url.trim())
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    return !!u.hostname && (u.hostname.includes(".") || u.hostname === "localhost")
  } catch {
    return false
  }
}

/**
 * Invariantes de uma referência de mercado EXIBÍVEL — aplicadas tanto na
 * resposta nova da API quanto no que volta do `localStorage`/da API de
 * campanhas (revisão Opus, 2026-09-05: validar só a resposta nova não
 * protege o payload persistido, que `MetricFeed` renderiza direto).
 *
 * `0 < value <= 100` porque a única métrica com busca real hoje é CTR Link,
 * percentual — espelha `_FAIXA_PLAUSIVEL` do backend.
 */
export function referenciaDeMercadoValida(r: unknown): boolean {
  if (typeof r !== "object" || r === null) return false
  const o = r as Record<string, unknown>
  if (typeof o.value !== "number" || !Number.isFinite(o.value)) return false
  if (o.value <= 0 || o.value > 100) return false
  if (typeof o.fonte !== "string" || !o.fonte.trim()) return false
  if (!urlDeFonteValida(o.fonte_url)) return false
  if (typeof o.capturado_em !== "string" || Number.isNaN(Date.parse(o.capturado_em))) return false
  return true
}

function validarResultadosBenchmark(
  bruto: unknown,
  metricasPedidas: readonly string[]
): ResultadoBenchmark[] | null {
  if (typeof bruto !== "object" || bruto === null) return null
  const resultados = (bruto as { resultados?: unknown }).resultados
  if (!Array.isArray(resultados)) return null

  const pedidas = new Set(metricasPedidas)
  const vistas = new Set<string>()
  const validados: ResultadoBenchmark[] = []

  for (const item of resultados) {
    if (typeof item !== "object" || item === null) return null
    const r = item as Record<string, unknown>

    if (typeof r.metric !== "string" || !pedidas.has(r.metric) || vistas.has(r.metric)) return null
    vistas.add(r.metric)

    if (r.encontrado === true) {
      if (!referenciaDeMercadoValida(r)) return null
      validados.push({
        metric: r.metric, encontrado: true, value: r.value as number,
        fonte: (r.fonte as string).trim(), fonte_url: (r.fonte_url as string).trim(),
        capturado_em: r.capturado_em as string
      })
    } else if (r.encontrado === false) {
      if (typeof r.motivo !== "string" || !r.motivo.trim()) return null
      validados.push({
        metric: r.metric, encontrado: false, motivo: r.motivo,
        motivo_tipo: typeof r.motivo_tipo === "string" ? r.motivo_tipo : undefined
      })
    } else {
      return null // discriminante ausente ou fora de {true, false}
    }
  }
  return validados
}

/**
 * Busca benchmark de mercado pra métricas sem meta definida pelo gestor.
 * `null` em QUALQUER falha (rede, timeout, 422/501/503/500, JSON inválido,
 * corpo malformado) — é um enriquecimento opcional, nunca pode interromper
 * ou atrasar a análise principal, que já foi entregue quando isto roda (a
 * orquestração mora em `App.tsx`, ver `onAnalyzed`).
 */
export async function buscarBenchmarkMercado(entrada: {
  niche: string
  platform: string
  objective: string
  metrics: string[]
}): Promise<ResultadoBenchmark[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/benchmark/mercado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entrada),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    const corpo: unknown = await res.json()
    return validarResultadosBenchmark(corpo, entrada.metrics)
  } catch {
    return null
  }
}

// =============================================================================
// Estado das capacidades do servidor (IA, persistência).
// =============================================================================

/**
 * O que o indicador de IA do cabeçalho pode mostrar.
 *
 * `desconhecido` é um estado de primeira classe, não um detalhe: um servidor
 * antigo (sem a rota `/status`) e um servidor fora do ar são indistinguíveis
 * daqui, e nos dois casos afirmar "IA desligada" seria inventar uma informação
 * que não temos. O indicador diz que não sabe.
 *
 * `falhando` = o servidor DIZ ter a IA, mas a última análise voltou sem ela.
 * Ver ~lib/aiHealth para por que essa distinção precisa existir.
 */
export type EstadoIA = "on" | "off" | "falhando" | "desconhecido"

export interface StatusServidor {
  ai: { enabled: boolean; available: boolean; model: string }
  persistence: { enabled: boolean }
  /** Ausente em servidor anterior à fase-2b — trate como benchmark indisponível. */
  benchmark?: { enabled: boolean; available: boolean }
}

// Compartilha a MESMA promise entre chamadas concorrentes (ex: o selo de IA
// no cabeçalho e a checagem de elegibilidade do benchmark, ambos podendo
// disparar perto um do outro na mesma análise) — evita dois GETs simultâneos
// pro mesmo dado. Limpo assim que a chamada resolve (sucesso ou falha): não é
// um cache com TTL, só evita duplicar uma requisição já EM VOO.
let _statusEmVoo: Promise<StatusServidor | null> | null = null

/**
 * Lê as capacidades ligadas no servidor. `null` quando não deu para saber.
 *
 * Timeout curto de propósito: isto alimenta um selo no cabeçalho, não o fluxo
 * principal. Se o servidor demorar, o selo fica "desconhecido" e a pessoa segue
 * usando o produto — travar 30s por um indicador seria pior que não tê-lo.
 *
 * Sem header de dono: capacidade do servidor não é dado de ninguém.
 */
export async function buscarStatus(): Promise<StatusServidor | null> {
  if (_statusEmVoo) return _statusEmVoo
  const promessa = _buscarStatusAgora()
  _statusEmVoo = promessa
  try {
    return await promessa
  } finally {
    if (_statusEmVoo === promessa) _statusEmVoo = null
  }
}

async function _buscarStatusAgora(): Promise<StatusServidor | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/status`, {
      signal: AbortSignal.timeout(8000)
    })
    // 404 = servidor anterior a esta rota. Não é erro de rede, mas o efeito
    // para o dashboard é o mesmo: não dá para afirmar nada sobre a IA.
    if (!res.ok) return null

    const dados = (await res.json()) as Partial<StatusServidor>
    // Validação defensiva: um proxy mal configurado pode devolver 200 com HTML.
    if (!dados || typeof dados.ai !== "object" || dados.ai === null) return null
    if (typeof dados.ai.available !== "boolean") return null

    return dados as StatusServidor
  } catch {
    return null
  }
}

/**
 * Traduz o que sabemos no estado que o selo exibe.
 *
 * `saude` é o que a última análise DE FATO mostrou (ver ~lib/aiHealth) e tem
 * precedência sobre a promessa do servidor: `/status` só confirma que a IA está
 * configurada — chave revogada ou cota estourada continuam respondendo
 * `available: true` de lá. Observação vence declaração.
 */
export function estadoDaIA(
  status: StatusServidor | null,
  saude: "ok" | "falhou" | null = null
): EstadoIA {
  if (status === null) return "desconhecido"
  if (!status.ai.available) return "off"
  return saude === "falhou" ? "falhando" : "on"
}

// =============================================================================
// Campanhas salvas no servidor.
//
// ⚠️ Isoladas por `dono` (25/08/2026), AINDA SEM LOGIN DE VERDADE: cada
//    chamada leva o header X-Nex-Dono (ver ~lib/dono) — uma string simples,
//    sem senha, que separa a visão de cada pessoa. Quem souber o valor alheio
//    ainda lê os dados dele. O caminho para autenticação de verdade está em
//    `backend/.../app/service/storage.py`.
//
// Regra de ouro destas funções: NUNCA derrubar a UI nem apagar dado local por
// causa do servidor. Se a persistência estiver desligada ou fora do ar, o
// dashboard volta a funcionar como antes, só com o localStorage.
// =============================================================================

/**
 * Header com o identificador do dono, quando existe.
 *
 * Vazio (`{}`) só acontece se algo chamar estas funções antes do DonoGate
 * capturar o identificador — não deveria ocorrer no fluxo normal da UI, mas
 * a função não lança: o backend responde 422 e as funções acima já tratam
 * "não deu para falar com a persistência" sem derrubar a tela.
 */
function donoHeaders(): Record<string, string> {
  const dono = getDono()
  return dono ? { "X-Nex-Dono": dono } : {}
}

/** Uma campanha como o servidor a devolve. */
interface LinhaSalva {
  id: number
  payload: CampaignVM
  criado_em?: string
  atualizado_em?: string
}

/**
 * Lista as campanhas do servidor.
 *
 * `null` significa "não deu para falar com a persistência" (desligada, fora do
 * ar, sem rede) — deliberadamente diferente de `[]`, que significa "a base
 * respondeu e está vazia". Quem chama precisa distinguir: no primeiro caso
 * mantém o cache local; no segundo, a base realmente não tem nada.
 */
export async function listarCampanhasSalvas(): Promise<CampaignVM[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/campaigns`, {
      headers: donoHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    // 501 = persistência desligada neste servidor. Não é erro: é a
    // configuração antiga (stateless), e o dashboard precisa seguir funcionando.
    if (!res.ok) return null

    const dados = (await res.json()) as { campanhas?: LinhaSalva[] }
    if (!Array.isArray(dados.campanhas)) return null

    return dados.campanhas
      .filter((l) => l && typeof l.id === "number" && l.payload && typeof l.payload === "object")
      .map((l) => ({ ...l.payload, id: idLocalDoServidor(l.id), serverId: l.id }))
  } catch {
    return null
  }
}

/**
 * Por que `salvarCampanha` não conseguiu salvar.
 *
 * `permanente` é a distinção que faltava (auditoria de rede, 2026-09-03,
 * achado A3): falha TRANSITÓRIA (rede caída, servidor fora do ar, 500, 501 —
 * persistência desligada é config esperada, não erro) vale a pena retentar
 * na próxima abertura, exatamente como já acontecia. Falha PERMANENTE (413 —
 * payload grande demais) nunca vai ter sucesso sozinha: antes, ela caía no
 * mesmo `null` que a transitória, e o laço de sincronização (`App.tsx`)
 * retentava pra sempre, sem jamais avisar o usuário de que aquela campanha
 * nunca sairia do navegador dele.
 *
 * Revisão do Opus (2026-09-04), achado R1: 507 (base do servidor cheia) foi
 * classificado como PERMANENTE na primeira versão desta correção — errado.
 * É estado do SERVIDOR, não da campanha: alguém libera espaço (a própria
 * Home tem botão de apagar) e a MESMA campanha, sem mudar nada, passaria a
 * caber. Marcar como permanente trocava "retenta pra sempre em silêncio"
 * (o bug original) por "nunca mais tenta, mesmo depois de resolvido" — uma
 * regressão de consistência eventual, provada ao vivo: liberar espaço no
 * servidor e reenviar o MESMO payload passa a responder 200. 507 agora é
 * `permanente: false` (o laço de sync continua retentando) com um `aviso`
 * pra informar o usuário sem bloquear a recuperação automática.
 */
export type ResultadoSalvar =
  | { ok: true; id: number }
  | { ok: false; permanente: false; aviso?: string }
  | { ok: false; permanente: true; explicacao: string }

/**
 * Salva (cria ou atualiza) uma campanha.
 *
 * `vm.clientId` (gerado e persistido ANTES desta chamada — ver
 * `lib/store.ts:garantirClientId`) viaja no payload para o servidor
 * reconhecer um reenvio da MESMA campanha como atualização, não como cópia
 * nova (achado A4: sem isto, uma resposta perdida depois do servidor já ter
 * gravado — abort do timeout, queda de rede no meio do 200 — faz a próxima
 * abertura inserir a campanha de novo).
 */
export async function salvarCampanha(vm: CampaignVM): Promise<ResultadoSalvar> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...donoHeaders() },
      body: JSON.stringify({ payload: vm, id: vm.serverId ?? null, client_id: vm.clientId ?? null }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })

    if (res.status === 413) {
      return { ok: false, permanente: true, explicacao: "Campanha grande demais para o servidor aceitar." }
    }
    if (res.status === 507) {
      // Não é `permanente`: é a base do servidor cheia, não um problema
      // desta campanha — continua elegível pro laço de sync retentar assim
      // que alguém liberar espaço (R1).
      return { ok: false, permanente: false, aviso: "A base do servidor está cheia — fale com quem administra." }
    }
    if (!res.ok) return { ok: false, permanente: false }

    const salva = (await res.json()) as { id?: number }
    return typeof salva.id === "number" ? { ok: true, id: salva.id } : { ok: false, permanente: false }
  } catch {
    return { ok: false, permanente: false }
  }
}

/**
 * Converte o id do servidor no id que a UI usa.
 *
 * O deslocamento existe porque a UI reserva ids < 1000 para as campanhas de
 * exemplo (mock) e usa `isLiveId` para separar as duas coisas — o id 1 do
 * servidor viraria a campanha de exemplo nº 1 sem esta conversão.
 */
export function idLocalDoServidor(serverId: number): number {
  return 1000 + serverId
}

/** Resultado de apagar — "sumiu" cobre o 404, que na prática é sucesso. */
export type ResultadoApagar = "apagada" | "sumiu" | "falhou"

/**
 * Apaga uma campanha da base compartilhada.
 *
 * 404 vira "sumiu", não erro: na base compartilhada outra pessoa pode ter
 * apagado a mesma campanha antes. O objetivo do usuário ("que ela não esteja
 * mais lá") foi atingido, então tratar como falha só geraria alarme falso.
 */
export async function apagarCampanha(serverId: number): Promise<ResultadoApagar> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/campaigns/${serverId}`, {
      method: "DELETE",
      headers: donoHeaders(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (res.ok) return "apagada"
    if (res.status === 404) return "sumiu"
    return "falhou"
  } catch {
    return "falhou"
  }
}
