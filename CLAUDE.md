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
- **Correção de estado (2026-07-16): a integração real com o backend já estava implementada** (não era "preparada mas não plugada" como este arquivo dizia). `NewCampaignModal.tsx` → `analyzeCampaign()` (`lib/api.ts`) → `responseToVM()` (`lib/adapt.ts`) → `upsertLive()` (`lib/store.ts`, persiste em `localStorage` com IDs ≥1000) → `App.tsx` mescla campanhas vivas + mock (`data/mock.ts`) na Home. Esse caminho completo já existe desde o commit inicial do monorepo (`29827ab`); esta seção do CLAUDE.md estava desatualizada, não o código.
- Validado nesta sessão: subi o backend real (`python -m uvicorn app.main:app --port 8000`) e mandei via `curl` um payload no formato exato que o `NewCampaignModal` monta (modo manual) para `POST /api/v1/campaign/analyze` — resposta correta, com cenário A detectado. `npx tsc --noEmit` no frontend passou sem erros.
- **Coleta automática implementada nesta sessão (2026-07-16) — PROVISÓRIA, decisão explícita do usuário.** `contents/ads-manager.ts` (content script Plasmo, `matches: ["https://*.facebook.com/*"]`) faz *scraping* da tabela de campanhas do Ads Manager via papéis ARIA (`role="row"/"columnheader"/"gridcell"`), mapeando cabeçalhos PT/EN conhecidos (Impressões, CPM, Resultados etc.) para os campos de `Metrics`. O botão "Coletar automático" no `NewCampaignModal.tsx` manda `chrome.tabs.sendMessage` pra aba ativa, recebe as métricas encontradas e **pré-preenche o formulário manual** (nunca envia direto — o usuário sempre revisa antes de analisar). Permissão `tabs` adicionada ao manifest (`package.json`).
  - **⚠️ Isto é temporário e frágil por natureza — combinado explicitamente com o usuário.** Scraping de DOM quebra sem aviso quando a Meta muda a estrutura da página, e os seletores não foram calibrados contra o Ads Manager ao vivo (não há acesso a uma conta real neste ambiente para testar). **Antes de lançar o produto, isto precisa ser substituído pela Meta Marketing API (OAuth)** — não esquecer/não deixar essa gambiarra ir para produção.
  - `tsc --noEmit` e `plasmo build` passaram limpos; manifest gerado confirma o content script registrado (`build/chrome-mv3-prod/manifest.json`). **Não testado num Ads Manager real** (sem conta disponível nesta sessão) — só a mecânica de mensageria/manifest foi validada, não a precisão do scraping em si.
- **Terceiro modo no `NewCampaignModal.tsx` — "Importar arquivo" (JSON), pra facilitar teste sem depender do scraping.** Usuário cola ou anexa (`<input type="file">`) um JSON com os blocos `campaign`/`metrics`/`targets` (mesmo esquema do `CONTRATO_API_FRONTEND.md`). `parseFileJSON()` copia cada chave **por nome exato** contra uma whitelist fechada (`METRIC_KEYS`/`TARGET_KEYS`, espelhando `~types`) — nunca por posição/heurística, então `"cpa": 50` só pode virar `metrics.cpa`, nunca `metrics.cpc`. Chaves fora da whitelist (typo) ou com tipo errado (string onde esperava number) são ignoradas e **listadas na pré-visualização**, nunca enviadas silenciosamente. O usuário só consegue clicar "Analisar campanha" depois de ver essa pré-visualização (campanha + métricas + metas + avisos). Testado isoladamente (fora do bundle, script Node) com 3 casos: valor correto, chave com typo, tipo errado — os 3 confirmaram que não há vazamento entre campos.

## Sessão de 2026-07-14

**Parte 1 — encerramento de rotina:** nenhuma mudança de código; só validação (104/105 testes, 1 falha ambiental — ver histórico do `.env`).

**Parte 2 — key real do Gemini configurada e testada ao vivo.** Mudanças de código feitas e validadas:

- **`GEMINI_MODEL` corrigido**: o default (`gemini-2.5-flash`) e `gemini-flash-latest` **não funcionam mais** para keys novas — a API do Google retorna 404 "no longer available to new users". Testado contra a key real: `gemini-flash-lite-latest` funciona e responde em ~3s com o schema estruturado (`gemini-flash-latest` funciona mas leva ~9s, passando do timeout de 8s configurado). Trocado em `config.py`, `.env` e `.env.example`.
- **Vazamento real de key detectado e corrigido**: ao rodar a suíte com a key real configurada, um teste falhou e o pytest imprimiu `repr(Settings())` no output — que incluía a `GEMINI_API_KEY` em texto puro. Corrigido com `Field(repr=False)` no campo em `config.py`; confirmado que `repr(Settings())` não expõe mais a key. **Ação pendente do usuário**: a key que apareceu nesta sessão deve ser considerada exposta — recomendei rotacionar/revogar no Google AI Studio.
- **`_redact_key` em `ai_service.py` ampliado**: só cobria o formato antigo de key (`AIza` + 35 chars); keys novas (formato `AQ.xxx`, comprimento variável) não batiam no regex. Agora também redige a key exata configurada em runtime (`settings.GEMINI_API_KEY`), cobrindo qualquer formato.
- **`.gitignore` do backend corrigido**: tinha `.env.*` sem a exceção `!.env.example` (a raiz do monorepo já tinha a exceção certa, mas o `.gitignore` aninhado do backend não), então o `.env.example` do backend nunca foi commitado. Adicionada a exceção.
- **Teste end-to-end real confirmado**: `POST /api/v1/campaign/analyze` com a key configurada retornou `ai_insights` preenchido de verdade (resumo executivo, cenário extra, insights contextuais, avisos de risco) — a integração Gemini funciona ponta a ponta, não só nos testes com mock.
- Suite após as correções: **103 passed, 2 failed** (105 testes) — as 2 falhas são **as mesmas de sempre, mais uma nova do mesmo padrão**: `test_debug_default_false` e `test_engine_detecta_cenario_ai_none` assumem "ambiente sem `.env` real" (sem `DEBUG=True`/sem key), o que deixou de ser verdade agora que o `.env` de dev tem uma key real configurada. Não são regressões de código.
- **Auditoria completa de vazamento da key** (pedida explicitamente após o susto do repr): rodei um agente de exploração cobrindo `model_dump()`/`print(settings)`, exception handlers, config de logging (DEBUG em httpx/urllib3/google-genai), endpoints que exponham config, arquivos `.log` residuais, histórico do git (`.env` real nunca foi commitado, confirmado) e fixtures de teste. Único achado adicional: `app/routes/routes.py:44` e `app/service/service.py:1093` usavam `logger.exception(...)` (traceback cru, só no log do servidor, nunca na resposta HTTP) sem passar por `_redact_key()` — hoje sem vetor ativo (o `call_gemini` já intercepta e redige tudo antes), mas corrigido por defesa em profundidade: agora ambos formatam o traceback com `traceback.format_exc()` e aplicam `_redact_key()` antes de logar. Suite continua 103/105 depois da mudança.

## Status atual / Roadmap

1. ✅ Backend: engine de diagnóstico + API validados por 103–104 testes (2 falhas ambientais, ver acima — não são bugs de código).
2. ✅ **Integração Gemini validada ao vivo** — key real configurada, modelo corrigido (`gemini-flash-lite-latest`), resposta de IA confirmada ponta a ponta via chamada HTTP real ao endpoint.
3. ✅ Frontend: UI completa; modo manual já plugado no backend real (ver correção de estado acima), mock continua como demo ao lado das campanhas vivas.
4. 🟡 **Coleta automática — provisória (scraping via content script), não é a solução final.** Funciona mecanicamente (mensageria + manifest validados), mas não foi testada contra um Ads Manager real e **deve ser trocada pela Meta Marketing API (OAuth) antes do lançamento** — combinado explicitamente com o usuário em 2026-07-16.
5. ⬜ **Pendente (líder da equipe)**: revogar a `GEMINI_API_KEY` atual — o valor apareceu em texto puro no output de um teste durante esta sessão (antes da correção do `repr`) e deve ser considerado exposto. O líder da equipe vai revogar; depois disso, gerar uma key nova e configurar no `.env` local antes de usar a IA de novo.
6. ⬜ Investigar/decidir se `test_debug_default_false` e `test_engine_detecta_cenario_ai_none` devem isolar o `.env` de dev explicitamente nos testes (ex.: `_env_file=None`), já que hoje qualquer `.env` local com `DEBUG=True` ou key real gera falso-negativo nesses dois testes.
