# NexGestor — Monorepo

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads). Monorepo unificando backend (FastAPI) e frontend (extensão Chrome, Plasmo + React + TS).

## Estrutura

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise de campanhas + integração Gemini
frontend/nexgestor-extension/      Extensão Chrome (side panel), Plasmo + React + TypeScript
.claude/commands/encerrar-sessao.md  comando de fim de sessão (raiz do monorepo)
```

## Backend — `backend/backend-nexgestor-main`

- FastAPI, endpoint único: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`). Contrato completo em `CONTRATO_API_FRONTEND.md`.
- Engine: 11 cenários de diagnóstico, score ponderado (0–100) com `score_coverage`/`score_confidence`, métricas deriváveis a partir de brutos (impressions, reach, spend, etc.).
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

### Estado validado (2026-07-14)

- Suite: `pytest` em `backend/backend-nexgestor-main` → **104 passed, 1 failed** (105 testes).
- Falha: `test_engine.py::TestAuditoriaFixes::test_debug_default_false`. **Não é regressão de código** — `app/core/config.py` já define `DEBUG: bool = False` como default (item 7 da auditoria, resolvido). O teste falha neste ambiente porque o `.env` local do dev tem `DEBUG=True` (config de conveniência para desenvolvimento) e o pydantic-settings carrega o `.env` antes do teste rodar; o teste só remove a variável de **ambiente do SO**, não neutraliza o `.env`. Passa normalmente se o `.env` não tiver `DEBUG` setado ou em CI sem esse arquivo. Não foi corrigido nesta sessão — nenhuma mudança de código foi feita.

## Frontend — `frontend/nexgestor-extension`

- Extensão Chrome (side panel), Plasmo + React + TS. Abre ao lado do Meta Ads Manager.
- **Estado atual: roda 100% com dados mockados** (`data/mock.ts`). Conexão real com o backend (`lib/api.ts` → `POST /campaign/analyze`) está preparada mas **não plugada** — próximo passo é a Fase E (mapear `CampaignAnalysisResponse` → `CampaignVM`, plugar coleta real via content script ou Meta Marketing API).
- Nenhuma mudança de arquivo nesta sessão (`git diff` contra o último commit vazio para `frontend/`); `tsc --noEmit` não foi rodado por não haver alterações a validar.

## Sessão de 2026-07-14

- Sessão de encerramento apenas: **nenhuma mudança de código** foi feita (working tree já estava limpo no início). Rodei a suíte de testes do backend para confirmar o estado real antes de documentar.
- Resultado: 104/105 testes passando; a única falha é um artefato do `.env` local (ver acima), não um bug de código.
- Decisão: não "consertar" o teste/ambiente sem isso ser pedido explicitamente — apenas documentado aqui para a próxima sessão não reinvestigar do zero.

## Status atual / Roadmap

1. ✅ Backend: engine de diagnóstico + API validados por 104 testes (1 falha ambiental, ver acima).
2. ✅ Frontend: UI completa rodando sobre dados mockados.
3. ⬜ **Próximo passo (Fase E)**: plugar o frontend no backend real — mapear `CampaignAnalysisResponse` para `CampaignVM`, substituir `data/mock.ts`, implementar coleta (content script no Ads Manager ou Meta Marketing API via OAuth).
4. ⬜ Investigar/decidir se o teste `test_debug_default_false` deve ser ajustado para isolar o `.env` de dev (ex.: rodar com `_env_file=None` no teste), já que hoje ele é falso-negativo em qualquer máquina com `.env` local contendo `DEBUG=True`.
