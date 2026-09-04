# NexGestor — Monorepo

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads / TikTok Ads / LinkedIn Ads). Monorepo unificando backend (FastAPI) e frontend (dashboard web, Vite + React + TS).

## Estrutura

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise de campanhas + integração Gemini
frontend/nexgestor-dashboard/      Dashboard web (Vite + React + TS + Tailwind) — único frontend ativo
AGENTS.md                          instruções equivalentes a este arquivo, para agentes fora do Claude Code (ex.: Codex)
.claude/commands/encerrar-sessao.md  comando de fim de sessão: grava em docs/sessions/, atualiza docs/roadmap.md só se algo mudou de fase
.claude/commands/rascunho.md         lê e executa docs/rascunho_prompt.md
```

Este projeto tem mais de um agente de IA trabalhando nele (Claude Code e
Codex, usados como auxiliares pelo mesmo usuário) — arquivos de processo
(`AGENTS.md`, entradas em `docs/sessions/`, ajustes neste `CLAUDE.md`) podem
aparecer sem terem sido gerados nesta sessão. Trate como trabalho de colega
de equipe: preserve, não sobrescreva sem necessidade, e leia antes de mexer.

## Backend — `backend/backend-nexgestor-main`

- FastAPI. Rotas principais: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`), `GET /api/v1/status` (estado da IA) e `/api/v1/campaigns*` (persistência isolada por dono, header `X-Nex-Dono` obrigatório). Contrato completo em `docs/CONTRATO_API_FRONTEND.md`.
- Engine: 15 cenários de diagnóstico (A–O), score ponderado (0–100) com `score_coverage`/`score_confidence` (confiança combina cobertura de métricas e volume de amostra), métricas deriváveis a partir de brutos (impressions, reach, spend, etc.). Plataformas suportadas: Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads.
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- Suite: **1496/1496**, sem falhas ambientais e sem nenhuma chamada de rede (`conftest.py` desliga a IA por padrão nos testes).
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

## Frontend

### Dashboard — `frontend/nexgestor-dashboard` (único frontend ativo)

- Vite + React + TS + Tailwind, layout full-screen com sidebar. **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`.
- Identificação simples antes de entrar (`DonoGate.tsx` + `lib/dono.ts`, sem senha) — manda o header `X-Nex-Dono` em toda chamada de campanhas salvas.
- Modos de criação de campanha: manual e importar arquivo (JSON, whitelist fechada de campos por nome exato).
- Suite: **445/445**.

### Extensão Chrome — removida do repositório em 2026-09-01

`frontend/nexgestor-extension/` **não existe mais aqui** — descontinuada em
2026-08-24, removida do código-fonte em 2026-09-01 (zero dependência
funcional confirmada antes da remoção). Recuperável pela tag git local
`extensao-estavel-2026-08` (última cópia funcional, suite 167/167).
Documentação completa (como funcionava, estrutura técnica, dívidas
conhecidas): `docs/historico/nexgestor-extensao.md`.

Roadmap, decisões em aberto e histórico completo de cada sessão: `docs/roadmap.md` (que aponta pra `docs/sessions/AAAA-MM-DD.md`).

## Rastreabilidade obrigatória de tarefas

O registro da conclusão faz parte da própria tarefa — não é uma atividade
opcional deixada apenas para o fim da sessão. Antes de informar ao usuário que
uma tarefa, etapa ou PR terminou:

1. confira o diff real e execute as validações proporcionais ao risco;
2. registre em `docs/sessions/AAAA-MM-DD.md` o identificador/nome da tarefa,
   escopo entregue, arquivos relevantes, validações realmente executadas e
   pendências;
3. atualize imediatamente o item correspondente em `docs/roadmap.md` quando
   ele mudar de fase; se a tarefa não pertence ao roadmap, o registro da
   sessão é suficiente;
4. só então comunique a conclusão.

Use estados distintos e não os trate como sinônimos:

- **não iniciado**: nenhuma implementação relevante existe;
- **em andamento**: há trabalho parcial ou critérios ainda pendentes;
- **implementado, não validado**: o código existe, mas a validação necessária
  não terminou ou falhou;
- **concluído e validado**: critérios de aceitação atendidos e comandos/testes
  registrados com resultado real;
- **bloqueado**: impedimento concreto documentado, com o que falta para sair
  dele.

Commit, push e deploy são estados independentes. Uma tarefa pode estar
concluída e validada, mas ainda não commitada, não enviada ou não implantada;
o registro deve dizer isso explicitamente. Nunca marque como concluído apenas
porque o código foi escrito, nunca registre teste que não foi executado e não
reescreva histórico antigo para fazê-lo parecer atual. No encerramento da
sessão, reconcilie o Git com sessão e roadmap para capturar qualquer registro
que tenha sido esquecido durante o trabalho.
