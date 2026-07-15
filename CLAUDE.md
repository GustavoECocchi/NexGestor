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

**Parte 1 — encerramento de rotina:** nenhuma mudança de código; só validação (104/105 testes, 1 falha ambiental — ver histórico do `.env`).

**Parte 2 — key real do Gemini configurada e testada ao vivo.** Mudanças de código feitas e validadas:

- **`GEMINI_MODEL` corrigido**: o default (`gemini-2.5-flash`) e `gemini-flash-latest` **não funcionam mais** para keys novas — a API do Google retorna 404 "no longer available to new users". Testado contra a key real: `gemini-flash-lite-latest` funciona e responde em ~3s com o schema estruturado (`gemini-flash-latest` funciona mas leva ~9s, passando do timeout de 8s configurado). Trocado em `config.py`, `.env` e `.env.example`.
- **Vazamento real de key detectado e corrigido**: ao rodar a suíte com a key real configurada, um teste falhou e o pytest imprimiu `repr(Settings())` no output — que incluía a `GEMINI_API_KEY` em texto puro. Corrigido com `Field(repr=False)` no campo em `config.py`; confirmado que `repr(Settings())` não expõe mais a key. **Ação pendente do usuário**: a key que apareceu nesta sessão deve ser considerada exposta — recomendei rotacionar/revogar no Google AI Studio.
- **`_redact_key` em `ai_service.py` ampliado**: só cobria o formato antigo de key (`AIza` + 35 chars); keys novas (formato `AQ.xxx`, comprimento variável) não batiam no regex. Agora também redige a key exata configurada em runtime (`settings.GEMINI_API_KEY`), cobrindo qualquer formato.
- **`.gitignore` do backend corrigido**: tinha `.env.*` sem a exceção `!.env.example` (a raiz do monorepo já tinha a exceção certa, mas o `.gitignore` aninhado do backend não), então o `.env.example` do backend nunca foi commitado. Adicionada a exceção.
- **Teste end-to-end real confirmado**: `POST /api/v1/campaign/analyze` com a key configurada retornou `ai_insights` preenchido de verdade (resumo executivo, cenário extra, insights contextuais, avisos de risco) — a integração Gemini funciona ponta a ponta, não só nos testes com mock.
- Suite após as correções: **103 passed, 2 failed** (105 testes) — as 2 falhas são **as mesmas de sempre, mais uma nova do mesmo padrão**: `test_debug_default_false` e `test_engine_detecta_cenario_ai_none` assumem "ambiente sem `.env` real" (sem `DEBUG=True`/sem key), o que deixou de ser verdade agora que o `.env` de dev tem uma key real configurada. Não são regressões de código.

## Status atual / Roadmap

1. ✅ Backend: engine de diagnóstico + API validados por 103–104 testes (2 falhas ambientais, ver acima — não são bugs de código).
2. ✅ **Integração Gemini validada ao vivo** — key real configurada, modelo corrigido (`gemini-flash-lite-latest`), resposta de IA confirmada ponta a ponta via chamada HTTP real ao endpoint.
3. ✅ Frontend: UI completa rodando sobre dados mockados.
4. ⬜ **Próximo passo (Fase E)**: plugar o frontend no backend real — mapear `CampaignAnalysisResponse` para `CampaignVM`, substituir `data/mock.ts`, implementar coleta (content script no Ads Manager ou Meta Marketing API via OAuth).
5. ⬜ **Pendente do usuário**: rotacionar a `GEMINI_API_KEY` — o valor atual apareceu em texto puro no output de um teste durante esta sessão (antes da correção do `repr`) e deve ser considerado exposto.
6. ⬜ Investigar/decidir se `test_debug_default_false` e `test_engine_detecta_cenario_ai_none` devem isolar o `.env` de dev explicitamente nos testes (ex.: `_env_file=None`), já que hoje qualquer `.env` local com `DEBUG=True` ou key real gera falso-negativo nesses dois testes.
