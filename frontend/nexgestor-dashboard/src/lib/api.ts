import { getDono } from "~lib/dono"
import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM } from "~types"

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
 * Salva (cria ou atualiza) uma campanha. Devolve o id do servidor, ou `null`
 * se não foi possível salvar — nesse caso a campanha continua só no navegador.
 */
export async function salvarCampanha(vm: CampaignVM): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...donoHeaders() },
      body: JSON.stringify({ payload: vm, id: vm.serverId ?? null }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null

    const salva = (await res.json()) as { id?: number }
    return typeof salva.id === "number" ? salva.id : null
  } catch {
    return null
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
