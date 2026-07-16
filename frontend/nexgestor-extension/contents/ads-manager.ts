import type { PlasmoCSConfig } from "plasmo"

import type { Metrics } from "~types"

// =============================================================================
// PROVISÓRIO — scraping do DOM do Ads Manager (stop-gap pré-lançamento).
//
// Isto NÃO é a integração definitiva. É uma leitura best-effort da tabela de
// campanhas via papéis ARIA (role="row"/"columnheader"/"gridcell"), que é o
// padrão comum de grids acessíveis — mas a Meta pode mudar a estrutura da
// página sem aviso, e o layout varia por idioma da conta (PT/EN cobertos
// abaixo; outros idiomas não). Antes de lançar o produto, isto precisa ser
// substituído pela Meta Marketing API (OAuth) — ver CLAUDE.md > Roadmap.
// =============================================================================

export const config: PlasmoCSConfig = {
  matches: ["https://*.facebook.com/*"],
  run_at: "document_idle"
}

type ScrapedMetrics = Partial<Metrics>

const HEADER_MAP: Array<{ match: RegExp; key: keyof Metrics }> = [
  { match: /^impress(ões|ions)$/i, key: "impressions" },
  { match: /^alcance$|^reach$/i, key: "reach" },
  { match: /^valor usado|amount spent/i, key: "spend" },
  { match: /^cpm/i, key: "cpm" },
  { match: /^cliques no link|link clicks/i, key: "link_clicks" },
  { match: /^ctr \(taxa de cliques no link\)|ctr \(link click-through rate\)/i, key: "ctr_link" },
  { match: /^ctr \(todos\)|ctr \(all\)/i, key: "ctr_all" },
  { match: /^frequência|frequency/i, key: "frequency" },
  { match: /^resultados$|^results$/i, key: "conversions" },
  { match: /^custo por resultado|cost per result/i, key: "cpa" },
  { match: /reproduç(ões|ão) de vídeo até 3 segundos|video plays at 3 seconds/i, key: "video_views_3s" },
  { match: /^thruplays?$/i, key: "thruplays" }
]

/** "1.234,56" (BR) ou "1,234.56" (EN) → number. Ignora símbolo de moeda/%. */
function parseLocaleNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[^\d,.\-]/g, "")
  if (!cleaned) return undefined
  const lastComma = cleaned.lastIndexOf(",")
  const lastDot = cleaned.lastIndexOf(".")
  const normalized =
    lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "")
  const n = Number(normalized)
  return Number.isFinite(n) ? n : undefined
}

function mapHeadersToKeys(headerCells: Element[]): Record<number, keyof Metrics> {
  const map: Record<number, keyof Metrics> = {}
  headerCells.forEach((cell, i) => {
    const text = cell.textContent?.trim() ?? ""
    const found = HEADER_MAP.find((h) => h.match.test(text))
    if (found) map[i] = found.key
  })
  return map
}

function scrapeTable(): ScrapedMetrics {
  const result: ScrapedMetrics = {}

  const headerRow = document.querySelector('[role="row"] [role="columnheader"]')?.closest('[role="row"]')
  if (!headerRow) return result

  const headerCells = Array.from(headerRow.querySelectorAll('[role="columnheader"]'))
  const keyByIndex = mapHeadersToKeys(headerCells)
  if (Object.keys(keyByIndex).length === 0) return result

  const dataRows = Array.from(document.querySelectorAll('[role="row"]')).filter(
    (r) => r !== headerRow && r.querySelector('[role="gridcell"]')
  )
  if (dataRows.length === 0) return result

  const cells = Array.from(dataRows[0].querySelectorAll('[role="gridcell"]'))
  for (const [idxStr, key] of Object.entries(keyByIndex)) {
    const idx = Number(idxStr)
    const text = cells[idx]?.textContent?.trim() ?? ""
    const n = parseLocaleNumber(text)
    if (n !== undefined) (result as Record<string, number>)[key] = n
  }
  return result
}

/** Nome da campanha: primeira célula da primeira linha de dados (best-effort). */
function detectCampaignName(): string | undefined {
  const cell = document.querySelector('[role="row"] [role="gridcell"]')
  return cell?.textContent?.trim() || undefined
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "NEXGESTOR_SCRAPE_REQUEST") return
  try {
    const metrics = scrapeTable()
    const name = detectCampaignName()
    sendResponse({ ok: true, metrics, name, url: location.href })
  } catch (e) {
    sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) })
  }
  return true
})
