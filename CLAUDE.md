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

## Rastreabilidade obrigatória de tarefas

Antes de declarar qualquer tarefa, etapa ou PR concluída, valide o trabalho e
registre a evidência em `docs/sessions/AAAA-MM-DD.md` — isso é parte da
definição de pronto, não um passo opcional de encerramento de sessão. Se o
item pertence a uma fase do roadmap, atualize também a linha correspondente
em `docs/roadmap.md` (só se ela mudou de fase).

Cada tarefa tem um destes estados, e eles não se confundem:

- **não iniciado**
- **em andamento**
- **implementado, não validado** — código escrito, suíte/build ainda não
  rodados (ou rodaram e falharam)
- **concluído e validado** — validado (suíte, build, ou revisão do diff
  quando a mudança é só documental) e com a evidência registrada
- **bloqueado** — com o motivo

Commit, push e deploy são estados independentes de "concluído e validado":
código pronto e testado não significa commitado, commitado não significa
enviado pro remoto, e enviado não significa implantado em produção. Declare
cada um separadamente — nunca confunda "código pronto" com "já está no ar".

`.claude/commands/encerrar-sessao.md` reconcilia `git status`/`git diff` com
esse registro e com o roadmap ao fim de cada sessão, como rede de segurança
contra tarefas esquecidas — não substitui o registro feito na hora em que a
tarefa termina.

## Backend — `backend/backend-nexgestor-main`

- FastAPI. Rotas principais: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`), `GET /api/v1/status` (estado da IA) e `/api/v1/campaigns*` (persistência isolada por dono, header `X-Nex-Dono` obrigatório). Contrato completo em `docs/CONTRATO_API_FRONTEND.md`.
- Engine: 15 cenários de diagnóstico (A–O), score ponderado (0–100) com `score_coverage`/`score_confidence` (confiança combina cobertura de métricas e volume de amostra), métricas deriváveis a partir de brutos (impressions, reach, spend, etc.). Plataformas suportadas: Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads.
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- Suite: **1674/1674**, sem falhas ambientais e sem nenhuma chamada de rede (`conftest.py` desliga a IA por padrão nos testes).
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

## Frontend

### Dashboard — `frontend/nexgestor-dashboard` (alvo de desenvolvimento ativo)

- Vite + React + TS + Tailwind, layout full-screen com sidebar. Substituiu a extensão como alvo de desenvolvimento em 2026-08-24. **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`.
- Identificação simples antes de entrar (`DonoGate.tsx` + `lib/dono.ts`, sem senha) — manda o header `X-Nex-Dono` em toda chamada de campanhas salvas.
- Reaproveita a lógica da extensão por cópia (`types.ts`, `lib/`, componentes); modos de criação de campanha: manual e importar arquivo (JSON, whitelist fechada de campos por nome exato) — sem o modo "coletar automático" da extensão.
- Suite: **513/513**.

### Extensão Chrome — `frontend/nexgestor-extension` (CONGELADA em 2026-08-24, cópia de referência)

- Side panel, Plasmo + React + TS. Não recebe mais commits — tag git local `extensao-estavel-2026-08` marca a cópia funcional de referência.
- Documentação completa (como funcionava, estrutura técnica, dívidas conhecidas): `docs/historico/nexgestor-extensao.md`.
- Migração da coleta automática pra Meta Marketing API (OAuth) segue adiada por decisão do usuário — não é prioridade enquanto durar o período de testes.
- Suite: 167/167.

Roadmap, decisões em aberto e histórico completo de cada sessão: `docs/roadmap.md` (que aponta pra `docs/sessions/AAAA-MM-DD.md`).
