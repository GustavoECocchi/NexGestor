import type { AnalyzeInput, CampaignAnalysisResponse, CampaignVM } from "~types"

// Base do backend FastAPI. Defina PLASMO_PUBLIC_API_BASE no .env para produção.
// No build da equipe (build-team.sh) isto vira a URL do VPS — por isso é
// exportado: as mensagens de erro precisam citar o endereço REAL que a
// extensão chamou, não um localhost que o usuário nunca configurou.
export const API_BASE =
  process.env.PLASMO_PUBLIC_API_BASE ?? "http://localhost:8000"

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

    // ⚠️ Os status abaixo só chegam até aqui se o host da API estiver em
    // `host_permissions` (package.json) — é isso que isenta o painel do CORS.
    // Sem essa declaração, respostas geradas pelo PROXY (e não pelo backend)
    // saem sem cabeçalho CORS, o Chrome as bloqueia antes do JS ler o status, e
    // tudo vira "Failed to fetch".
    //
    // Medido em 14/08/2026, Chromium 151, duas cópias do mesmo build diferindo
    // SÓ nessa linha do manifest, contra o servidor real:
    //
    //   com o host declarado  → leu 5×200 e 9×429, nenhuma bloqueada
    //   sem o host declarado  → 14 de 14 bloqueadas ("TypeError: Failed to fetch")
    //
    // Numa chamada isolada (sem estourar o limite) as duas leem 200 — o
    // backend manda CORS. A diferença aparece justamente no erro do proxy.
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
// ⚠️ BASE COMPARTILHADA — decisão TEMPORÁRIA do período de testes (14/08/2026):
//    não há login nem dono, então toda a equipe vê (e pode apagar) as mesmas
//    campanhas. Isso muda antes do lançamento; o caminho de migração está em
//    `backend/.../app/service/storage.py`.
//
// Regra de ouro destas funções: NUNCA derrubar a UI nem apagar dado local por
// causa do servidor. Se a persistência estiver desligada ou fora do ar, a
// extensão volta a funcionar como antes, só com o localStorage.
// =============================================================================

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
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    // 501 = persistência desligada neste servidor. Não é erro: é a
    // configuração antiga (stateless), e a extensão precisa seguir funcionando.
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
      headers: { "Content-Type": "application/json" },
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
