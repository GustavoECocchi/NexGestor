# NexGestor — Monorepo

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads / TikTok Ads / LinkedIn Ads). Monorepo unificando backend (FastAPI) e frontend (extensão Chrome, Plasmo + React + TS).

## Estrutura

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise de campanhas + integração Gemini
frontend/nexgestor-extension/      Extensão Chrome (side panel), Plasmo + React + TypeScript
.claude/commands/encerrar-sessao.md  comando de fim de sessão (raiz do monorepo)
```

## Backend — `backend/backend-nexgestor-main`

- FastAPI, endpoint único: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`). Contrato completo em `docs/CONTRATO_API_FRONTEND.md`.
- Engine: 11 cenários de diagnóstico, score ponderado (0–100) com `score_coverage`/`score_confidence`, métricas deriváveis a partir de brutos (impressions, reach, spend, etc.).
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

### Estado validado (2026-07-14)

- Suite: `pytest` em `backend/backend-nexgestor-main` → **104 passed, 1 failed** (105 testes).
- Falha: `test_engine.py::TestAuditoriaFixes::test_debug_default_false`. **Não é regressão de código** — `app/core/config.py` já define `DEBUG: bool = False` como default (item 7 da auditoria, resolvido). O teste falha neste ambiente porque o `.env` local do dev tem `DEBUG=True` (config de conveniência para desenvolvimento) e o pydantic-settings carrega o `.env` antes do teste rodar; o teste só remove a variável de **ambiente do SO**, não neutraliza o `.env`. Passa normalmente se o `.env` não tiver `DEBUG` setado ou em CI sem esse arquivo. Não foi corrigido nesta sessão — nenhuma mudança de código foi feita.

## Frontend — `frontend/nexgestor-extension`

- Extensão Chrome (side panel), Plasmo + React + TS. Abre ao lado do Meta Ads Manager.
- **Correção de estado (2026-07-16): a integração real com o backend já estava implementada** (não era "preparada mas não plugada" como este arquivo dizia). `NewCampaignModal.tsx` → `analyzeCampaign()` (`lib/api.ts`) → `responseToVM()` (`lib/adapt.ts`) → `upsertLive()` (`lib/store.ts`, persiste em `localStorage` com IDs ≥1000) → `App.tsx` mescla campanhas vivas + mock (`data/mock.ts`) na Home. Esse caminho completo já existe desde o commit inicial do monorepo (`29827ab`); esta seção do CLAUDE.md estava desatualizada, não o código.
- Validado nesta sessão: subi o backend real (`python -m uvicorn app.main:app --port 8000`) e mandei via `curl` um payload no formato exato que o `NewCampaignModal` monta (modo manual) para `POST /api/v1/campaign/analyze` — resposta correta, com cenário A detectado. `npx tsc --noEmit` no frontend passou sem erros.
- **Coleta automática implementada nesta sessão (2026-07-16) — PROVISÓRIA, decisão explícita do usuário.** `contents/ads-manager.ts` (content script Plasmo, `matches: ["https://*.facebook.com/*"]`) faz *scraping* da tabela de campanhas do Ads Manager via papéis ARIA (`role="row"/"columnheader"/"gridcell"`), mapeando cabeçalhos PT/EN conhecidos (Impressões, CPM, Resultados etc.) para os campos de `Metrics`. O botão "Coletar automático" no `NewCampaignModal.tsx` manda `chrome.tabs.sendMessage` pra aba ativa, recebe as métricas encontradas e **pré-preenche o formulário manual** (nunca envia direto — o usuário sempre revisa antes de analisar). Permissão `tabs` adicionada ao manifest (`package.json`).
  - **⚠️ Isto é temporário e frágil por natureza — combinado explicitamente com o usuário.** Scraping de DOM quebra sem aviso quando a Meta muda a estrutura da página, e os seletores não foram calibrados contra o Ads Manager ao vivo (não há acesso a uma conta real neste ambiente para testar). **Antes de lançar o produto, isto precisa ser substituído pela Meta Marketing API (OAuth)** — não esquecer/não deixar essa gambiarra ir para produção.
  - `tsc --noEmit` e `plasmo build` passaram limpos; manifest gerado confirma o content script registrado (`build/chrome-mv3-prod/manifest.json`). **Não testado num Ads Manager real** (sem conta disponível nesta sessão) — só a mecânica de mensageria/manifest foi validada, não a precisão do scraping em si.
- **Terceiro modo no `NewCampaignModal.tsx` — "Importar arquivo" (JSON), pra facilitar teste sem depender do scraping.** Usuário cola ou anexa (`<input type="file">`) um JSON com os blocos `campaign`/`metrics`/`targets` (mesmo esquema do `docs/CONTRATO_API_FRONTEND.md`). `parseFileJSON()` copia cada chave **por nome exato** contra uma whitelist fechada (`METRIC_KEYS`/`TARGET_KEYS`, espelhando `~types`) — nunca por posição/heurística, então `"cpa": 50` só pode virar `metrics.cpa`, nunca `metrics.cpc`. Chaves fora da whitelist (typo) ou com tipo errado (string onde esperava number) são ignoradas e **listadas na pré-visualização**, nunca enviadas silenciosamente. O usuário só consegue clicar "Analisar campanha" depois de ver essa pré-visualização (campanha + métricas + metas + avisos). Testado isoladamente (fora do bundle, script Node) com 3 casos: valor correto, chave com typo, tipo errado — os 3 confirmaram que não há vazamento entre campos.


Roadmap: ver docs/roadmap.md

