# NexGestor — Monorepo

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads / TikTok Ads / LinkedIn Ads). Monorepo unificando backend (FastAPI) e frontend (dashboard web, Vite + React + TS).

## Estrutura

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise de campanhas + integração Gemini
frontend/nexgestor-dashboard/      Dashboard web (Vite + React + TS + Tailwind) — alvo de desenvolvimento ativo desde 2026-08-24
frontend/nexgestor-extension/      Extensão Chrome (side panel) — CONGELADA em 2026-08-24, sem novos commits (ver docs/roadmap.md item 3)
.claude/commands/encerrar-sessao.md  comando de fim de sessão: grava em docs/sessions/, atualiza docs/roadmap.md só se algo mudou de fase
.claude/commands/rascunho.md         lê e executa docs/rascunho_prompt.md
```

## Backend — `backend/backend-nexgestor-main`

- FastAPI. Rotas principais: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`), `GET /api/v1/status` (estado da IA) e `/api/v1/campaigns*` (persistência isolada por dono, header `X-Nex-Dono` obrigatório). Contrato completo em `docs/CONTRATO_API_FRONTEND.md`.
- Engine: 15 cenários de diagnóstico (A–O), score ponderado (0–100) com `score_coverage`/`score_confidence` (confiança combina cobertura de métricas e volume de amostra), métricas deriváveis a partir de brutos (impressions, reach, spend, etc.). Plataformas suportadas: Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads.
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- Suite: **1450/1450**, sem falhas ambientais e sem nenhuma chamada de rede (`conftest.py` desliga a IA por padrão nos testes).
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

## Frontend

### Dashboard — `frontend/nexgestor-dashboard` (alvo de desenvolvimento ativo)

- Vite + React + TS + Tailwind, layout full-screen com sidebar. Substituiu a extensão como alvo de desenvolvimento em 2026-08-24. **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`.
- Identificação simples antes de entrar (`DonoGate.tsx` + `lib/dono.ts`, sem senha) — manda o header `X-Nex-Dono` em toda chamada de campanhas salvas.
- Reaproveita a lógica da extensão por cópia (`types.ts`, `lib/`, componentes); modos de criação de campanha: manual e importar arquivo (JSON, whitelist fechada de campos por nome exato) — sem o modo "coletar automático" da extensão.
- Suite: **380/380**.

### Extensão Chrome — `frontend/nexgestor-extension` (CONGELADA em 2026-08-24, cópia de referência)

- Side panel, Plasmo + React + TS. Não recebe mais commits — tag git local `extensao-estavel-2026-08` marca a cópia funcional de referência.
- Tinha três modos de criação de campanha: manual, coletar automático (scraping via content script, provisório, nunca testado contra um Ads Manager real) e importar arquivo (JSON).
- Migração da coleta automática pra Meta Marketing API (OAuth) segue adiada por decisão do usuário — não é prioridade enquanto durar o período de testes.
- Suite: 167/167.

Roadmap, decisões em aberto e histórico completo de cada sessão: `docs/roadmap.md` (que aponta pra `docs/sessions/AAAA-MM-DD.md`).
