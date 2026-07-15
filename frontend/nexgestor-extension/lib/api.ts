import type { AnalyzeInput, CampaignAnalysisResponse } from "~types"

// Base do backend FastAPI. Defina PLASMO_PUBLIC_API_BASE no .env para produção.
const API_BASE = process.env.PLASMO_PUBLIC_API_BASE ?? "http://localhost:8000"

/**
 * Chama o engine determinístico (Fase E).
 * Rota real do backend: /api/v1/campaign/analyze
 * (main.py inclui o router com prefixo settings.API_V1_STR = "/api/v1").
 */
export async function analyzeCampaign(
  input: AnalyzeInput
): Promise<CampaignAnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/v1/campaign/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  })
  if (!res.ok) throw new Error(`Falha na análise: ${res.status}`)
  return (await res.json()) as CampaignAnalysisResponse
}
