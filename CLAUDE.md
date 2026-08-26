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

## Sessão de 2026-07-14

**Parte 1 — encerramento de rotina:** nenhuma mudança de código; só validação (104/105 testes, 1 falha ambiental — ver histórico do `.env`).

**Parte 2 — key real do Gemini configurada e testada ao vivo.** Mudanças de código feitas e validadas:

- **`GEMINI_MODEL` corrigido**: o default (`gemini-2.5-flash`) e `gemini-flash-latest` **não funcionam mais** para keys novas — a API do Google retorna 404 "no longer available to new users". Testado contra a key real: `gemini-flash-lite-latest` funciona e responde em ~3s com o schema estruturado (`gemini-flash-latest` funciona mas leva ~9s, passando do timeout de 8s configurado). Trocado em `config.py`, `.env` e `.env.example`.
- **Vazamento real de key detectado e corrigido**: ao rodar a suíte com a key real configurada, um teste falhou e o pytest imprimiu `repr(Settings())` no output — que incluía a `GEMINI_API_KEY` em texto puro. Corrigido com `Field(repr=False)` no campo em `config.py`; confirmado que `repr(Settings())` não expõe mais a key. **Ação pendente do usuário**: a key que apareceu nesta sessão deve ser considerada exposta — recomendei rotacionar/revogar no Google AI Studio.
- **`_redact_key` em `ai_service.py` ampliado**: só cobria o formato antigo de key (`AIza` + 35 chars); keys novas (formato `AQ.xxx`, comprimento variável) não batiam no regex. Agora também redige a key exata configurada em runtime (`settings.GEMINI_API_KEY`), cobrindo qualquer formato.
- **`.gitignore` do backend corrigido**: tinha `.env.*` sem a exceção `!.env.example` (a raiz do monorepo já tinha a exceção certa, mas o `.gitignore` aninhado do backend não), então o `.env.example` do backend nunca foi commitado. Adicionada a exceção.
- **Teste end-to-end real confirmado**: `POST /api/v1/campaign/analyze` com a key configurada retornou `ai_insights` preenchido de verdade (resumo executivo, cenário extra, insights contextuais, avisos de risco) — a integração Gemini funciona ponta a ponta, não só nos testes com mock.
- Suite após as correções: **103 passed, 2 failed** (105 testes) — as 2 falhas são **as mesmas de sempre, mais uma nova do mesmo padrão**: `test_debug_default_false` e `test_engine_detecta_cenario_ai_none` assumem "ambiente sem `.env` real" (sem `DEBUG=True`/sem key), o que deixou de ser verdade agora que o `.env` de dev tem uma key real configurada. Não são regressões de código. *(Nota de 2026-07-16: essa contagem de 2 falhas valia apenas enquanto a key ainda autenticava; depois que ela foi revogada, `test_engine_detecta_cenario_ai_none` voltou a passar sozinho, deixando só 1 falha — ver sessão de 2026-07-16 parte 3, que corrigiu as duas causas de raiz.)*
- **Auditoria completa de vazamento da key** (pedida explicitamente após o susto do repr): rodei um agente de exploração cobrindo `model_dump()`/`print(settings)`, exception handlers, config de logging (DEBUG em httpx/urllib3/google-genai), endpoints que exponham config, arquivos `.log` residuais, histórico do git (`.env` real nunca foi commitado, confirmado) e fixtures de teste. Único achado adicional: `app/routes/routes.py:44` e `app/service/service.py:1093` usavam `logger.exception(...)` (traceback cru, só no log do servidor, nunca na resposta HTTP) sem passar por `_redact_key()` — hoje sem vetor ativo (o `call_gemini` já intercepta e redige tudo antes), mas corrigido por defesa em profundidade: agora ambos formatam o traceback com `traceback.format_exc()` e aplicam `_redact_key()` antes de logar. Suite continua 103/105 depois da mudança.

## Sessão de 2026-07-16 (parte 3) — testes isolados do `.env` + key confirmada revogada

**Mudança de código** (branch `worktree-isolar-env-testes`, PR #1, mergeado na `main` via squash em 2026-07-16 — commit `29fd5b8`):

- `test_engine.py::TestAuditoriaFixes::test_debug_default_false`: agora usa `Settings(_env_file=None)` em vez de só remover `DEBUG` do ambiente do SO. Isso neutraliza de vez a influência do `.env` de dev (que tem `DEBUG=True` por conveniência).
- `test_ai_integration.py::TestIADesativada`: ganhou uma fixture `autouse` que faz `patch("app.service.ai_service.is_ai_available", return_value=False)`. Antes a classe inteira ("quando `GEMINI_API_KEY` está vazia") só torcia pro ambiente não ter key configurada — com uma key válida no `.env`, os três testes fariam chamada de rede real ao Gemini a cada `pytest` (lento, gasta cota, não determinístico).
- **Validado com teste de mutação**: inverti `DEBUG: bool = True` no `config.py`, confirmei que `test_debug_default_false` falha, revertido depois. O teste pega regressão de verdade, não é vacuoso.
- Suite: **105 passed, 0 failed** (105 testes) — testado nos dois cenários: com o `.env` de dev real copiado pra dentro (que antes causava a falha) e sem `.env` nenhum (ambiente limpo). Ambos 105/105.

**Achado ao investigar por que a suite tinha "melhorado sozinha" antes desta mudança** (estava 104/105, não 103/105 como a sessão anterior registrou): a key do Gemini configurada no `.env` de dev retorna **`401 UNAUTHENTICATED`** numa chamada real à API — ou seja, **a key exposta na sessão de 2026-07-14 já foi revogada** pelo líder da equipe. O `.env` local ainda tem essa key morta; para voltar a usar a IA é preciso gerar uma nova no Google AI Studio e configurar no `.env`.

**Merge do PR**: `gh` CLI instalado e autenticado nesta sessão (`gh auth login --web`) especificamente para poder criar/mergear PRs direto pelo terminal. PR #1 criado e mergeado via squash contra `main` (https://github.com/GustavoECocchi/NexGestor/pull/1); branch remota `worktree-isolar-env-testes` deletada automaticamente no merge.

## Decisão de escopo (2026-07-16)

**Meta Marketing API (OAuth) — adiada de propósito.** O usuário confirmou explicitamente que o projeto está entrando em período de testes e que a migração do scraping (item 4 abaixo) para a Meta Marketing API fica para depois — não é prioridade enquanto os testes rodam. Não retomar esse trabalho por iniciativa própria; só quando o usuário sinalizar que o período de testes terminou ou que está perto de lançar para usuários reais. O scraping continua sendo aceitável **apenas** para esse período de testes, não para produção.

## Sessão de 2026-07-24 — pasta local sem git reconectada ao repositório remoto

Sessão administrativa, sem mudança de código/produto. A sessão anterior (nesta mesma pasta) foi encerrada abruptamente porque o usuário trocou o tema do **Cursor** (o editor, não o cursor do mouse) — isso disparou um reload de janela/extension host que matou o terminal integrado onde o Claude Code CLI rodava. Não foi um bug do Claude Code nem perda de trabalho; confirmado que nenhum código tinha sido alterado antes do encerramento.

- **Achado:** a pasta de trabalho (`~/Downloads/NexGestor-main`) nunca teve `.git` — é um unzip do GitHub (sufixo `-main` no nome), não um `git clone`. Não havia como commitar/dar push a partir daqui, apesar deste `CLAUDE.md` documentar PRs e commits reais feitos em outra cópia do repositório.
- **Corrigido:** `git init` + `git remote add origin https://github.com/GustavoECocchi/NexGestor.git` + `git fetch`. Antes de tocar em qualquer coisa, comparei o conteúdo local com `origin/main` (checkout num worktree temporário + `diff -rq`): eram **idênticos**, exceto `.claude/settings.local.json` (config local do Claude Code, nunca versionada) e a pasta `knowledge-core/` (projeto completamente à parte — FAQ/skills/vídeos em Node e Python — que não pertence ao NexGestor e não deve ser versionado aqui). Anexei a branch local `main` ao `origin/main` existente (`git symbolic-ref HEAD refs/heads/main` + `git reset --mixed origin/main`) sem reescrever histórico nem sobrescrever nenhum arquivo — a pasta agora é um checkout git normal, com o mesmo histórico do GitHub.
- **Testes:** `pytest` em `backend/backend-nexgestor-main` → **105 passed, 0 failed**. Sem mudanças no frontend nesta sessão, então `tsc --noEmit` não foi rodado (nada para validar).

## Sessão de 2026-07-24 (parte 2) — polimento de UX do frontend

Ambiente de execução resolvido primeiro: a pasta era um unzip sem `.git` (reconectada ao `origin/main` na parte 1 desta data). Plasmo **funciona** no Fedora 44 (`npm install` + `plasmo build` ok, 563 pacotes); o que faltava era um navegador — instalado **Chromium 150** via `dnf`. A extensão foi carregada no Brave do usuário (build unpacked em `frontend/nexgestor-extension/build/chrome-mv3-prod`). Nota de ambiente: as ferramentas de automação de navegador **não** interagem com páginas internas (`brave://extensions`) nem com o diálogo nativo de "Load unpacked" — carregar a extensão é passo manual do usuário.

**Mudanças de código (commits `020970a` + `6b8d56c`, na `main`, já com push):** revisão de UX pedida pelo usuário, implementada em 7 frentes + validada por `tsc --noEmit` limpo e `plasmo build` ok a cada passo. **Nenhuma testada contra o Ads Manager real** (mesma limitação de sempre — sem conta) e **não há testes automatizados de frontend** no projeto; a validação foi type-check + build + um teste Node isolado da lógica de roteamento do Copiloto (12/12 rotas corretas). Ou seja: validado que compila/empacota e que a lógica pura roteia certo, **não** que renderiza bonito ao vivo.

- **Copiloto (`Copilot.tsx`) agora responde à pergunta digitada.** Antes ignorava o input e devolvia sempre o mesmo texto (baseado em `scenarios[0]`). Agora faz matching por tema (CPA, ROAS, CTR, frequência, ação, causa, escalar, oportunidade, sugestão) usando dados reais do `CampaignVM`, com fallback honesto ("não tenho resposta específica ainda"). + 3 chips de pergunta rápida. **Continua sendo heurística local por regex, não NLU/IA de verdade** — é honesto sobre isso no fallback. Regex de remoção de acento foi trocado de caracteres combinantes literais (frágil) para a forma escapada `\u0300-\u036f`.
- **Checkmarks das Ações prioritárias persistem** em `localStorage` por campanha (`lib/store.ts`: `loadDoneActions`/`toggleDoneAction`, chave `nex:doneActions`). Antes era `useState` local e sumia ao sair/voltar. **Dívida conhecida:** a chave é o *título* da ação (engine não dá id estável) — reanálise com título repetido reaproveita o "feito"; o mapa cresce sem limpeza.
- **Atalho de busca visível:** `Header.tsx` trocou o ícone de lupa solto por um campo mostrando `Ctrl K`/`⌘K` (detecção via `navigator.platform`, depreciado mas ok). Discoverability — o próprio usuário não sabia que o Command Palette existia.
- **Estado vazio / sinalização de exemplos:** `Home.tsx` mostra aviso "Você ainda não criou nenhuma campanha" quando `liveCount === 0` (passa `live.length` do `App.tsx`). O branch `campaigns.length === 0` continua como fallback defensivo (hoje inalcançável porque o mock está sempre presente; passa a valer quando o mock sair).
- **Mock reduzido de 4 para 2 campanhas** (`data/mock.ts`): par contrastante Black Friday (RED, score 28) × Topo de Funil LAL 1% (BLUE, score 92), renumeradas ids 1 e 2, para o comparativo ter um par didático. `findCampaign` não é usado em lugar nenhum (verificado) — renumerar foi seguro. Cards de exemplo ganharam tag "exemplo" + coloração delicada (borda tracejada, tom azulado) via `.card.demo`; a campanha viva do usuário aparece sem tag/borda sólida, distinguindo-se dos demos.
- **Acessibilidade de teclado:** card, botão "Voltar" e checkbox de ação viraram focáveis (`tabIndex`, `role`, `onKeyDown` Enter/Espaço) com `:focus-visible`.
- **Removida affordance de clique falsa** dos cards de Sugestões (tinham hover/cursor mas nenhum `onClick`).

**Assets:** commit `6b8d56c` adicionou o PNG da logo (`ChatGPT Image Jul 24, 2026, 12_32_50 PM.png`) na raiz do frontend — **ainda não integrado** (decisão do usuário: integração depois). Nome com espaços/vírgula: renomear para algo como `assets/logo.png` na hora de integrar. *(Resolvido em 2026-07-25 — ver sessão abaixo.)*

**Pendências levantadas nesta sessão (não resolvidas):** *(ambas resolvidas em 2026-07-25 — ver sessão abaixo.)*
- O "Resumo geral" (`Summary.tsx`) soma investimento/receita/ROAS de **todas** as campanhas na tela, incluindo o dinheiro fake dos 2 exemplos. Some quando o mock sair; dá para filtrar por campanhas vivas antes, se o usuário quiser.
- Integrar a logo (renomeando o arquivo).

## Sessão de 2026-07-25 — logo integrada, tema claro/escuro e correções de revisão

Sessão só de frontend (nenhuma mudança no backend). 4 commits na `main`, todos com push: `c854833`, `77139f3`, `e7164e9`, `ad577bf`.

**Como foi validado:** `tsc --noEmit` + `plasmo build` limpos a cada passo, **e desta vez também com verificação visual ao vivo** — servi o build (`build/chrome-mv3-prod`) num servidor HTTP local e abri o `sidepanel.html` no navegador via automação, conferindo os dois temas em todas as telas (home, resumo, cards, modal de nova campanha, command palette, detalhe de campanha). Isso é mais do que as sessões anteriores conseguiram (que pararam em type-check + build), mas **continua não sendo teste contra o Ads Manager real** (sem conta) e **o projeto segue sem nenhum teste automatizado de frontend**.

### O que foi feito

- **Logo integrada** (`c854833`). Recortei só o símbolo N/G do PNG original (o texto "NEXGESTOR" já é renderizado pelo `Header`), com fundo transparente, salvo em `assets/logo.png`. `Header.tsx` usa a imagem no lugar do `IconLogo` SVG genérico (removido de `Icons.tsx`, não era mais usado em lugar nenhum). Criado `images.d.ts` declarando o módulo `*.png` (o `tsc` reclamava). PNG original de nome esquisito removido.
- **`Summary.tsx` não soma mais dinheiro fake** (`c854833`). Os totais de Investimento/Receita/ROAS médio/CPA médio agora somam só campanhas com `isLiveId(c.id)` (função que já existia em `lib/store.ts`). **Os chips de status continuam contando tudo na tela de propósito** — eles filtram a lista abaixo, que mistura vivas + exemplos; mudar isso quebraria a relação chip↔lista. Verificado ao vivo: sem campanha viva o resumo mostra R$ 0; injetando uma campanha viva, passa a mostrar exatamente os números dela.
- **Peso visual nos tiles do Resumo** (`77139f3`). Cada tile financeiro ganhou um ícone em chip colorido (azul/verde/violeta/laranja), valor com mais peso tipográfico, e novas variáveis `--violet`/`--orange`. Puramente visual.
- **Tema claro/escuro** (`e7164e9`). Referências pesquisadas: Triple Whale (mesmo nicho, analytics de ads) pro tom do claro, Linear pra manter o escuro elegante.
  - `lib/theme.ts`: hook com persistência em `localStorage` (`nex:theme`), respeita `prefers-color-scheme` até o usuário escolher explicitamente no toggle. Efeito no nível do módulo aplica o tema salvo antes do React montar, pra não piscar o tema errado.
  - Toggle sol/lua no `Header`, com animação de troca do ícone.
  - **A mudança estrutural que viabilizou tudo:** ~30 cores que estavam hardcoded em hex espalhadas pelo CSS viraram `color-mix()` sobre as variáveis. Sem isso, o tema não se propagaria sem reescrever componente por componente. `status.ts` também: o `stroke` do score ring virou `var()`.

### Correções da revisão (`ad577bf`)

Revisão crítica do que tinha acabado de ser entregue, com **3 bugs reais encontrados e corrigidos**:

1. **Bug de lógica no `useTheme`** — o listener de `prefers-color-scheme` checava a preferência salva só na montagem. Quem abrisse sem preferência salva e depois usasse o toggle ficava com o listener ativo: uma mudança de tema do SO viraria o **ícone sem virar as cores** (o `data-theme` já estava fixado), dessincronizando estado e DOM e deixando o clique seguinte aparentemente morto. A checagem passou pra dentro do handler.
2. **Contraste abaixo do WCAG no tema claro** — calculados os ratios de toda a paleta: `--muted` estava em **2,91:1** (mínimo 4,5), e é justamente a cor das labels de 9,5–10,5px em maiúsculas (`RESUMO GERAL`, `INVESTIMENTO`, `CPA`). Corrigido pra `#646f88` (**4,69:1**); `--txt-3` pra `#7b8499`. **O tema escuro passou em todos os tokens**, não foi mexido.
3. **Franja escura na logo** — o primeiro recorte usou corte binário por limiar e deixou **2,55% dos pixels opacos** como resíduo quase-preto nas bordas: invisível no header escuro, contorno sujo no claro. Refeita a partir do original (recuperado do histórico do git) recuperando a transparência de verdade (un-premultiply sobre fundo preto). Franja final: **0 pixels**.

Mais um ponto de atenção tratado na mesma revisão: as animações adicionadas não respeitavam **`prefers-reduced-motion`**. Adicionado o bloco — com o cuidado de forçar `opacity:1` em `.card`/`.mtile`, que nascem com `opacity:0` e dependem da animação `rise` pra aparecer (desligar animação sem isso deixaria os cards **invisíveis**). Validado que os 3 cards seguem visíveis com animação desligada.

**Bug de percepção investigado e corrigido durante a sessão:** o usuário relatou que textos "piscavam" ao trocar de tema. Medindo `font-size`/`transform` computados quadro a quadro durante o toggle, os valores ficaram idênticos o tempo todo — não era bug de layout. A causa era a regra global de transição incluir `color`: texto bold grande cruzando de quase-branco pra quase-preto passa por um cinza sujo no meio, o que cria ilusão de "inchar". Agora só fundo/borda fazem fade; texto troca de cor instantaneamente.

### Pendências / dívidas conhecidas

- **`data/mock.ts` ainda existe** — as 2 campanhas de exemplo continuam na Home ao lado das vivas. O `Summary` já as ignora nos totais, mas os chips de status ainda as contam (decisão consciente, ver acima).
- **`.nex-fab` / `.nex-panel` no `style.css` são CSS morto** — nenhum componente usa essas classes (verificado por grep). Sobrou de uma abordagem de sidebar injetada que não é a atual (side panel). Candidato a remoção.
- **`.collect-btn` e `.nex-fab` usam gradiente hardcoded** (`#5b8cff,#7d6bff`) em vez das variáveis de tema — no tema claro continuam com o azul/violeta escuro. Funciona (texto branco sobre gradiente saturado), mas é inconsistente com o resto da paleta clara.
- ~~Sem teste automatizado de frontend~~ — resolvido na parte 3 desta sessão (ver abaixo).

## Sessão de 2026-07-25 (parte 2) — IA revalidada de ponta a ponta + regra de segredos

**IA revalidada com key nova.** `.env` recriado a partir do `.env.example` (não existia mais neste checkout). Subi o backend real (`uvicorn app.main:app --port 8000`) e mandei um payload real (o mesmo formato que o `NewCampaignModal` monta) pro `POST /api/v1/campaign/analyze`: resposta `200 OK` com `ai_insights` preenchido de verdade (resumo executivo, cenário extra, insight contextual, aviso de risco — todos coerentes com os dados enviados). Suite rodou **105/105** com a key real presente no `.env`, confirmando que o isolamento de testes (sessão de 2026-07-16 parte 3) continua segurando: nenhuma chamada de rede real durante o pytest. Servidor de teste desligado ao final. **Modelo continua `gemini-flash-lite-latest`.**

**Vocês colocaram um limite de gasto de R$15 na key** — bom registrar pra sessões futuras serem econômicas com chamadas de teste reais.

**Incidente: duas keys vazaram no chat durante o processo de configuração — e a causa foi uma orientação minha errada.** Eu disse pra rodar `! sed -i "s#...#...#" .env` afirmando que "isso edita o arquivo sem a key passar por mim". **Isso é falso.** O prefixo `!` só pula a confirmação de permissão — o comando digitado (com a key em texto puro) e sua saída continuam entrando no meu contexto exatamente como qualquer mensagem da conversa, e por isso os servidores da Anthropic os processam como o resto do chat. A primeira key vazou assim (e o comando ainda saiu incompleto, sem o caminho do arquivo — vazou à toa, nem chegou a configurar nada). As duas keys expostas foram tratadas como queimadas, mesmo a primeira nunca tendo autenticado.

**Regra fixada daqui pra frente:** qualquer segredo (API key, senha, token) só pode ser configurado editando o arquivo **num editor/terminal aberto por fora desta sessão de chat** — nunca digitado ou colado aqui, com ou sem `!`. O fluxo que funcionou e deve ser repetido: usuário edita o `.env` externamente → avisa só "pronto" → Claude confirma que o campo tem conteúdo por contagem de caracteres (`grep -c`/`wc -c`), **nunca exibindo o valor**. Mitigações adicionais recomendadas (não aplicadas ainda, ficam de sugestão): restringir a key no Google Cloud Console só à Generative Language API, e manter o hábito de rotacionar sempre que uma key tocar o chat.

## Sessão de 2026-07-25 (parte 3) — testes automatizados do frontend (primeira vez)

O projeto nunca teve nenhum teste automatizado de frontend — toda validação até aqui era `tsc --noEmit` + `plasmo build` + verificação visual manual. Configurado **Vitest + `@testing-library/react`** (ambiente jsdom); `@vitejs/plugin-react` não pôde ser instalado (conflito de peer dependency com a árvore do Parcel que o Plasmo já traz — `@babel/core` em versões incompatíveis), mas não fez falta: o transform de JSX/TSX do Vitest via esbuild (`esbuild.jsx: "automatic"` no `vitest.config.ts`) resolve sozinho.

**Configuração que exigiu atenção:** o alias `~*` do `tsconfig.json` é fusão direta (`~lib/x` → `./lib/x`, sem `/` entre o til e o resto — diferente da convenção comum de alias). Um alias de string simples (`find: "~"`) no Vite/Vitest só casa com prefixo seguido de `/`, então **não resolvia nada** — precisou de regex com backreference (`find: /^~(.*)$/, replacement: path.resolve(__dirname, "$1")`). Imports de imagem (`~assets/logo.png`) são mockados à parte (`test/__mocks__/asset.ts`) via um alias regex mais específico, checado antes do genérico.

**Duas funções privadas foram exportadas** (só isso, nenhuma mudança de comportamento) pra ficarem testáveis: `parseFileJSON`/`num` em `NewCampaignModal.tsx`, `buildReply`/`norm` em `Copilot.tsx`. Antes só tinham sido verificadas por scripts Node ad-hoc fora do bundle (mencionado nas sessões de 2026-07-24), sem cobertura real.

**Cobertura (99 testes, 8 arquivos, todos passando):**
- `lib/sanitize.ts` (`sanitizeHtml`) — o mais crítico: é o sanitizador por allowlist usado em todo `dangerouslySetInnerHTML` da UI. Testado contra `<script>`, handlers inline (`onerror`, `onmouseover`), tags desconhecidas, e um caso adversarial de `<`s repetidos tentando reconstruir uma tag.
- `lib/adapt.ts` (`responseToVM`) — o adapter backend→UI mais complexo do projeto: resolução de status GREEN→BLUE (janela de escala), prioridade gestor-enviou-vs-engine-avaliou, invest/revenue nunca inventados sem base, truncamento de sugestões da IA no limite de 5, fallbacks da faixa de IA e da oportunidade.
- `lib/store.ts` — `isLiveId`, upsert/persistência em localStorage, geração de próximo id, checkmarks de ações, localStorage corrompido não derruba a UI.
- `lib/theme.ts` (`useTheme`) — inclui **teste de regressão do bug real corrigido mais cedo nesta sessão** (mudança de tema do SO não pode sobrescrever uma escolha explícita do usuário).
- `components/Copilot.tsx` (`buildReply`) — roteamento por tema (CPA/ROAS/CTR/frequência/ação/causa/oportunidade/sugestão) sempre grounded nos dados reais da campanha, nunca texto solto; fallback honesto quando a pergunta foge do roteiro.
- `components/NewCampaignModal.tsx` (`parseFileJSON`) — a garantia de segurança da importação de JSON: cópia só por nome exato de campo (nunca por posição), chaves fora da whitelist e tipos errados são reportados e **ignorados**, nunca aceitos silenciosamente.
- `components/Summary.tsx` — teste de regressão do bug de dinheiro fake corrigido na parte 1 desta sessão: com exemplos na tela sem nenhuma campanha viva, os totais ficam R$ 0; com uma viva junto dos exemplos, os totais refletem só ela.

**Achado durante a escrita dos testes (documentado, não "corrigido" — não é bug perigoso):** `parseFileJSON` aceita um array JSON na raiz sem erro (`typeof [] === "object"` em JS), tratando-o como "sem campos" e caindo nos defaults. Não é falha de segurança (nenhum dado incorreto é aceito), só uma validação de entrada mais frouxa do que pareceria à primeira vista — registrado no teste em vez de silenciosamente assumido.

`npm test` roda a suíte; `npm run test:watch` pro modo watch. Suite completa: **99/99**. `tsc --noEmit` e `plasmo build` seguem limpos com os arquivos de teste incluídos (o `tsconfig.json` já inclui `./**/*.ts` por padrão). `README.md` da extensão atualizado (estava desatualizado dizendo "roda só com mock, backend não plugado" — não era mais verdade desde 2026-07-16) e ganhou seção de testes.

## Sessão de 2026-07-26 — revisão do backend, correções de UI e publicação no repo da empresa

Sessão longa, 4 commits na `main` (`d6d328b`, `9b65462`, `afbc936`, `6d55b86`), todos com push. Suítes ao final: **backend 109/109**, **frontend 99/99**, `tsc --noEmit` e `plasmo build` limpos.

### Frontend — hover dos cards (e um erro meu de validação)

Pedido de UX: hover mais visível nos cards da Home, "estilo Apple". Implementei lift + scale + sombra em camadas com easing de spring, **afirmei ter validado visualmente, e estava errado**. Quando o usuário desconfiou ("no dark não é perceptível né"), a investigação revelou que o efeito **nunca funcionou** — nem o `translateY(-2px)` que já existia antes.

- **Causa raiz:** no cascade do CSS, declarações de animação vencem declarações normais de autor. A animação de entrada `rise` usava `fill:forwards` terminando em `transform:none`, o que **congelava o transform do card para sempre** e anulava silenciosamente o `:hover`. O que eu vi nas capturas foi só a sombra mudando.
- Provado por medição: com a animação ativa, card sob o mouse ficava em `transform:none` / largura 1870; desligando-a, ia para `scale(1.018) translateY(-6px)` / 1903.
- **Correção:** `rise` passou a animar via `from` + `fill:backwards` (deixa de contribuir ao terminar, liberando o hover). `.mtile` migrado para o mesmo padrão via variável `--rise-from`, preservando sua distância original de 8px.
- **Segundo bug na mesma revisão:** `.card:hover` e `.card.demo` têm especificidade idêntica (0,2,0) e `.demo` vinha depois — vencia. Os cards de exemplo **não recebiam realce nenhum**. Não peguei na primeira validação porque só testei o card vivo. `:hover` movido para depois.
- **Terceiro:** eu havia afirmado que `prefers-reduced-motion` neutralizava o movimento "automaticamente" — **falso**, pela mesma questão de especificidade. Corrigido explicitamente, mais `animation-delay:0ms` (não coberto pela regra de duração; com o novo fill-mode seguraria os cards invisíveis durante o stagger).

> **Lição a carregar:** captura de tela não prova que um efeito de transform funcionou — sombra e cor mudando dão a impressão de que sim. Para hover/animação, medir geometria (`getBoundingClientRect`/`getComputedStyle`) com e sem o estado.

### Backend — revisão completa (3 bugs) + suíte queimando cota paga

Revisão sistemática das 1.186 linhas do `service.py` mais schema/rotas/config/IA. Bugs achados por **fuzz de 60.000 payloads válidos** (aceitos pelo schema, então qualquer exceção é bug do engine):

1. **HTTP 500 no Cenário F** (`_detect_cold_lead`): `CPA=0` é valor válido (`ge=0`) mas *falsy*; o texto escolhia o ramo CPA/CPL com `if m.cpa`, caía no ramo do CPL e formatava `None` → `TypeError`.
2. **Afirmação factualmente falsa** — mesma linha, pior que o crash: com CPA acima do teto e CPL dentro da meta (quem qualificava era o CPL), o diagnóstico dizia *"CPA R$100.00 dentro do teto de R$10.00"*. Texto errado num laudo que o gestor lê para decidir. Corrigido rastreando qual sinal realmente qualificou (`cpa_ok`/`cpl_ok`).
3. **Semáforo do Hold Rate invertido:** limiar de RED fixo em 10, ignorando o target. Com `min_hold_rate` abaixo de 10 o RED ficava ACIMA da meta — `hold_rate=7.0` contra meta 5.0 saía **RED com score 100/100**. Trocado por `min(10.0, target*0.7)`, que preserva exatamente o comportamento no default (meta 15 → limiar 10, verificado).

**Padrão comum aos três: `0` tratado como ausente.** `if m.cpa`, `if m.spend`, `if m.frequency` aparecem em vários detectores. Corrigi onde causava crash ou texto falso; nos demais o efeito hoje é benigno (só omite uma frase de evidência), **mas a armadilha continua lá** — vale adotar `is not None` como regra para métrica numérica.

**Defeito de infraestrutura de testes (o mais caro):** `pytest` abria **6 conexões reais para `generativelanguage.googleapis.com`** a cada execução — cota paga queimada em toda rodada, contra o limite de R$15 da key, além de suíte lenta (59s) e dependente de rede. Passava despercebido porque a falha da IA degrada graciosamente: **os testes passavam de qualquer jeito**. A correção de 2026-07-16 isolou apenas `TestIADesativada`; os testes de endpoint (`client.post(...)`) seguiam expostos. Adicionado `conftest.py` desligando a IA por padrão.

**Validação:** fuzz de 60k passou de 2 falhas para 0. Suíte 109/109 em **0,7s** (era 59s), com **0 tentativas de rede externa** — provado por experimento controlado bloqueando sockets: com o conftest → 0; com `--noconftest` → 6 conexões ao endpoint do Gemini. Os 4 testes de regressão novos passaram por **teste de mutação** (revertendo cada correção, eles falham).

### Frontend — quadrado azul no score e limpeza

- **Quadrado azul em volta do anel de score** (relatado pelo usuário). Não vinha do `style.css`: o elemento tinha `box-shadow: 0 0 0 3px rgba(59,130,246,.5)` — o azul-500 e o formato do utilitário `ring` do **Tailwind**. O projeto carrega `@tailwind utilities` com `content` varrendo todo `.ts/.tsx`, e a classe do anel se chamava literalmente **`ring`**, o mesmo nome do utilitário. O CSS gerado tinha duas regras `.ring` e, como mexem em propriedades diferentes, as duas aplicavam. Renomeada para `.score-ring`. Varredura das 149 classes do projeto confirmou que **era a única colisão**. *(O Tailwind segue emitindo a regra `.ring` — o extrator provavelmente acha "ring" dentro de `string` — mas agora é CSS morto que não casa com elemento nenhum.)*
- **CSS morto removido:** `.nex-fab`/`.nex-panel` e a variável `--nex-w` (30 linhas), resquício da sidebar injetada que o side panel substituiu. Zero referências no TS/TSX, incluindo o content script.
- **`.collect-btn`** passou a derivar o gradiente das variáveis de tema (era hex fixo com as cores do escuro). O `color-mix` a 75% não é estética: com as cores puras o texto branco de 14px/700 ficava **abaixo do AA** (accent escuro 3,16:1; violet escuro 2,78:1). A 75% as quatro paradas ficam entre 4,68:1 e 8,51:1 — medido ao vivo nos dois temas.

### Publicação no repositório da empresa

`NexGoldCompany/NexGestor` (privado) estava vazio e agora tem os **24 commits de histórico completo** (decisão do usuário: preservar histórico em vez de commit único).

- **O remote `empresa` já existia mas com erro de digitação** (`NexGold-Company` em vez de `NexGoldCompany`) — era por isso que parecia inacessível. Corrigido.
- **Auditoria de segredos antes de publicar:** varri o conteúdo dos 23 commits — nenhum `.env` real, nenhuma chave verdadeira, só `.env.example`. Um alerta apareceu (string com cara de chave no `test_engine.py`): investigada sem exibi-la, está lá desde o commit inicial, dentro do teste de `_redact_key`, com formato/comprimento diferentes das chaves reais — **fixture sintética, não vazamento**. Ainda assim tornada autodescritiva, porque o secret scanning do GitHub poderia sinalizá-la e gerar alerta falso para a equipe.

### Alerta de secret scanning do GitHub (mesmo dia) — falso positivo, causado por esta documentação

Poucos minutos depois do push, o GitHub abriu um alerta de **"Google API Key"** no repositório pessoal. Investigado e resolvido no mesmo dia:

- **A localização era `CLAUDE.md`, não código.** A string sinalizada era o placeholder falso que a própria seção acima citava por extenso ao documentar a troca da fixture. Ou seja: a fixture foi trocada para evitar ruído de scanner e a documentação da troca virou o ruído.
- **Verificação decisiva:** a chave real do `.env` (53 chars, formato `AQ.`) foi comparada contra todos os blobs de todos os commits — **não aparece em nenhum**. Existem só 2 strings no formato `AIza`+35 em todo o histórico, ambas sintéticas (a fixture original, digitada à mão, e o placeholder da documentação). O detector do GitHub, que valida o formato real com precisão, nunca sinalizou a fixture original — evidência adicional de que ela nunca foi chave verdadeira.
- **Correção estrutural:** o teste de `_redact_key` agora **monta a chave falsa em tempo de execução** por concatenação, em vez de conter um literal. Não existe mais nenhuma string detectável como chave no repositório, então o alerta não pode reaparecer por essa via. A asserção de comprimento (`== 39`) garante que o formato continua exercitando o regex real — e ela de fato pegou um erro de um caractere na primeira tentativa.

> **Regra prática que fica:** nunca escrever um exemplo de segredo — mesmo falso — como literal, nem em código nem em documentação. Em código, montar em runtime; em documentação, descrever o formato (`AIza` + 35 caracteres) em vez de exibir uma string completa.

**⬜ PENDENTE — o alerta #1 continua ABERTO no repo pessoal.** A correção impede que o problema *reapareça*, mas não fecha o alerta existente: a string ainda vive em 29 commits do histórico já publicado. **Não resolver isso reescrevendo o histórico** — reescrever 29 commits publicados, quebrando o clone de quem já baixou, para remover uma string comprovadamente falsa seria pior que o problema. O caminho correto é **fechar o alerta manualmente como falso positivo** (o GitHub tem a categoria "Used in tests"), em Security → Secret scanning no repositório. Foi oferecido fazer isso via API, mas como resolver alerta de segurança fica registrado na conta do usuário, ficou aguardando decisão dele — **não foi fechado**.

**⬜ Não verificável no repo da empresa:** a API de secret scanning retorna 404 para `NexGoldCompany/NexGestor` porque o usuário não é admin. Se o scanning estiver ativo lá, um alerta equivalente deve ter surgido e **alguém com permissão de admin precisa fechá-lo**. Se aparecer algum alerta apontando para arquivo que **não** seja `CLAUDE.md` ou `test_engine.py`, é coisa diferente desta e merece investigação nova.
- **`knowledge-core/` não foi junto** (projeto à parte) — confirmado via API que o repo recebeu só `backend`, `frontend`, `CLAUDE.md`, `README.md`, `.claude`, `.gitignore`.
- **README na raiz criado** (não existia — quem clonasse encontrava duas pastas e nenhuma instrução): pré-requisitos, subir backend (venv + `requirements.txt` + `.env`), buildar e carregar a extensão, rodar as duas suítes, índice da documentação. Inclui a **regra de segredos explícita** e declara as duas limitações que a equipe precisa saber antes de avaliar (scraping provisório; sem persistência).
- **Permissão:** o usuário tem `push` mas **não é admin** no repo da empresa — branch protection, descrição e colaboradores precisam de alguém com admin.
- `origin` (pessoal) e `empresa` estão no mesmo commit (`6d55b86`).

## Sessão de 2026-07-28 — planejamento do período de testes (sem mudança de código)

Sessão só de conversa/planejamento, nenhum arquivo alterado. Suite backend reconferida ao final: **109/109**. Frontend não tocado, `tsc` não rodado (nada para validar).

- **Confirmado que esta pasta é a versão mais atual**: `main` sincronizado com `empresa/main` (`NexGoldCompany/NexGestor`), commit de topo (`a1a749a`) bate com o último documentado aqui.
- **Discussão sobre tipos de teste para o período de testes com a equipe.** Como a suíte automatizada já cobre regressão de lógica, o gap real é validação humana/produto real: (1) coleta automática contra um Ads Manager real, (2) UAT alguém de fora seguindo o README do zero, (3) checagem informal de multiusuário (cada testador tem seu próprio `localStorage`, sem nada compartilhado).
- **Limitação registrada explicitamente**: Claude não consegue fazer os três testes acima sozinho neste ambiente — não há conta Meta Ads real logada em navegador (item 1), não simula bem a perspectiva de "usuário de fora" por já conhecer o projeto inteiro (item 2), e não substitui pessoas/navegadores diferentes de verdade (item 3). O que Claude consegue fazer sem depender disso: rodar as suítes automatizadas, e testar os modos **manual** e **importar arquivo** do `NewCampaignModal` de ponta a ponta via navegador (nenhum dos dois depende do Ads Manager).
- **Decisão do usuário: teste da coleta automática (que depende de validação contra o Meta/Ads Manager real) fica fora de escopo por agora.** Não é mais só a migração pra Meta Marketing API que está adiada (já registrado em "Decisão de escopo", 2026-07-16) — a própria *validação* do scraping atual contra uma conta real também não vai acontecer nesta rodada de testes. Não puxar esse teste como prioridade nas próximas sessões até o usuário sinalizar o contrário.
- **Usuário cogitou pedir a um agente Codex externo que gere um `teste.md`** e trazer pra Claude revisar. Ressalva registrada na conversa: se o ambiente do Codex também não tiver navegador com sessão real do Facebook logada, ele esbarra na mesma limitação do item acima — a lacuna só fecha se houver acesso real à conta, não pela ferramenta usada. Quando o arquivo chegar, tratá-lo como entrada a **auditar contra o código real** (mesmo padrão usado nos bugs achados em 2026-07-26), não aceitar as afirmações de bate-pronto.
- Explicado ao usuário, sem mudança de código, como os 3 modos de criação de campanha funcionam hoje (`NewCampaignModal.tsx`): **manual** (formulário direto), **coletar automático** (scraping via content script, sempre cai de volta no formulário manual pra revisão, nunca envia direto) e **importar arquivo** (`.json` com whitelist fechada de campos por nome exato, chaves desconhecidas/tipo errado só aparecem como aviso na pré-visualização, nunca são enviadas).

## Sessão de 2026-07-28 (parte 2) — auditoria do `teste.md`, 4 cenários novos, revisão do prompt da IA, números animados

Sessão longa, 3 commits na `main` (`1501bc5`, `82f0cb9`, `1682f14`), **ainda sem push** até este encerramento. Suítes ao final: **backend 1350/1350**, **frontend 165/165**, `tsc --noEmit` e `plasmo build` limpos.

### Parte A — auditoria do relatório externo (`teste.md`, agente Codex)

Usuário trouxe um `teste.md` gerado por um agente Codex externo avaliando o commit `c2eb9ca`, com instrução explícita de **auditar contra o código real, não aceitar de bandeja** (decisão já registrada na sessão anterior). Os 5 achados (NG-T01 a NG-T05) foram reproduzidos um a um contra o engine antes de qualquer correção — todos se confirmaram. Três estavam **subestimados**:

- **NG-T05 (extremo numérico vira `null`) só cobria metade do problema.** O relatório tratou como "caso irrealista de entrada". Rejeitar não-finito no schema (`NaN`/`Infinity`) não resolve sozinho: com `spend=1e308` e `impressions=1` — dois números perfeitamente finitos e válidos — o estouro acontece na **derivação** dentro do engine (CPM = spend/impressions × 1000 vira infinito). Só foi pego porque o teste de regressão escrito para "resolver" o achado falhou sozinho.
- **NG-T01 (Cenário G recomenda escala sem evidência) era um padrão, não um bug isolado.** G é o único dos onze detectores que recomenda *gastar mais*, e o único cujo gatilho era ausência de alarme em vez de dano observado. O mesmo raciocínio vazava por três portas que o relatório não abriu: o fallback mínimo (engine vazio + IA indisponível) fechava com "considerar expansão de orçamento"; o Copiloto respondia "Sim" a "vale escalar?"; e o prompt da IA, no modo principal, instruía "identificar oportunidades" sem informar quanto do quadro ela estava vendo. As três foram corrigidas junto.
- **NG-T03 (enums abertos) e o array-na-raiz do JSON de importação** eram achados corretos e viraram `Literal` fechado no schema (`objective`, `platform`) e `Array.isArray` explícito no parser do frontend, respectivamente.

**Achados próprios, fora do relatório**, encontrados varrendo o código com o mesmo padrão de suspeita:

- `NaN`/`-Infinity` em métricas causavam **HTTP 500 sem corpo**: o `ge=0` do Pydantic reprovava, mas o handler de validação do FastAPI devolve o input recebido dentro do 422, e `json.dumps` recusa `NaN` — o erro estourava na *renderização* da resposta, depois de qualquer try/except. Corrigido com um handler de exceção próprio que sanitiza floats não-finitos antes de serializar (`app/main.py`).
- **Zeros fabricados vazando como fato pela UI** (achado próprio, não estava no relatório): `adapt.ts` usava `?? 0` para métrica ausente. O Copiloto afirmava *"o CPA atual desta campanha é R$ 0,00"*, o comparador dava vitória de "CPA menor" à campanha **sem** CPA, e o CPA médio do Resumo era puxado para baixo por campanhas sem o dado. `cpaNum`/`roasNum`/`ctrNum`/`freqNum` viraram `number | null`.
- **Padrão `if valor` tratando `0` como ausente** (dívida já registrada em 2026-07-26, nunca resolvida): `if data.spend`, `if m.cpa` etc. no pré-processamento e nos detectores. Campanha recém-ligada com `spend=0` perdia CPM/CPC/CPA derivados sem aviso. Trocado por `is not None` em todo `service.py`.

**Correção central: `_evidencia_faltante_para_escala`.** O Cenário G agora exige frequência, estado de aprendizado (`learning_phase` ou `weekly_conversions`) e ROAS (só quando há meta de ROAS definida) antes de abrir a janela de escala — e passou a recusar escala num leilão com CPM acima do teto (achado durante a própria auditoria, não estava no relatório original). O mesmo gate foi propagado para o fallback mínimo, para o prompt da IA (via bloco de cobertura) e para o Copiloto.

### Parte B — validação ao vivo no navegador (build real, side panel 420px)

Build servido localmente e navegado via automação de Chrome. Confirmado visualmente, não só por teste automatizado:

- Detalhe abre em `scrollTop = 0` em 3 caminhos (clique no card, reload com tela persistida, pós-análise).
- Selo "complementado por IA" só aparece quando `ai_insights` existe de verdade; sem IA a seção é só "Diagnóstico".
- Copiloto responde *"Esta campanha não tem CPA registrado"* em vez de inventar R$ 0,00.
- Comparador mostra `—` no lugar de R$ 0,00 e não elege mais vencedor por ausência de dado.
- **Teste de ponta a ponta com backend real e IA real ligada** (2 chamadas ao Gemini, dentro do limite de R$15 combinado): com 25% de cobertura a IA respondeu *"a baixa cobertura de dados impede qualquer recomendação de escala"* e sugeriu congelar o orçamento; com 87% de cobertura voltou ao tom normal e recomendou escalar — confirmando que a regra nova não deixou a IA conservadora demais.

**A validação ao vivo revelou 3 bugs que nenhum teste automatizado tinha pego**, todos corrigidos na mesma sessão:

1. **Transiente de rolagem real**: `Home` e `CampaignDetail` renderizam ambos um `<div className="scroll">` na mesma posição da árvore — o React reaproveitava o **mesmo nó do DOM** ao trocar de tela, herdando o `scrollTop` da tela anterior (medido: 531 → 0 em ~0,5s, um "flash" visível no meio da página). Corrigido com `key` distinto por tela em `App.tsx`. Não é coberto por teste automatizado (jsdom não tem layout/scroll real) — só por medição ao vivo.
2. **Veredito do comparador invertia o diagnóstico**: pegava `scenarios[0]` às cegas, então uma campanha cuja ação é "aumentar orçamento agora" (Cenário G) era descrita como tendo "sinais que merecem atenção antes de receber mais verba". Corrigido excluindo G dessa frase; adicionada ressalva quando o "vencedor" da comparação tem confiança baixa (pode vencer por falta de dado, não por performance). Coberto por 4 testes novos.
3. **Formulário manual não coletava os dados que a própria correção do dia passou a exigir**: sem campo de `learning_phase`/`weekly_conversions`, nem a campanha mais saudável preenchida manualmente conseguia abrir a janela de escala — o critério ficou inalcançável por construção até ser achado ao vivo. Adicionados os dois campos; o de aprendizado é **tri-estado** ("Não informado"/Não/Sim), não checkbox, porque desmarcado afirmaria falsamente "não está em aprendizado" para quem só não informou. Validado ao vivo (score 100, cobertura 87%, Cenário G disparando), não coberto por teste automatizado de UI.

### Parte C — 4 cenários novos + revisão da confiança do score

Pedido do usuário: garantir que a variedade real de campanha não deixa o produto "sem o que dizer". Rodei 5 situações comuns de tráfego pago contra o engine e as piores respostas eram todas "manter ativa, monitorar 48h" em cima de problema real. 4 cenários novos, **nenhum campo de schema novo** (o dado já chegava):

- **L — Gasto sem Retorno**: `conversions == 0` com gasto relevante (acima do teto de CPA, ou 100+ cliques sem meta). Antes: R$2.000 gastos, 1.600 cliques, zero conversão → "monitorar", score 84. Agora: RED, "pausar e validar rastreamento e página".
- **M — Amostra Insuficiente**: `0 < conversions < 10`. Antes: 2 conversões com métricas "ótimas" → GREEN, Escalável, "aumentar orçamento agora". Agora: suprime G/H, "acumular volume antes de decidir" — prioridade 3 (é limite do que dá pra afirmar, não falha da campanha).
- **N — Vazamento Clique→Página**: `landing_page_views < 70%` dos `link_clicks` (mínimo 50 cliques pra não ser ruído). Antes: 1.600 cliques → 300 visitas (81% perdido) → Saudável, nenhum cenário. Agora: RED/YELLOW conforme severidade, quantifica o R$ perdido.
- **O — Receita Abaixo da Meta**: `roas < min_roas` com `cpa <= max_cpa`. Antes: ROAS 1,2x contra meta 3,0x com CPA ok → "monitorar", ROAS só ficava vermelho no semáforo sem causa. Agora: aponta que o gargalo é ticket médio/margem, não mídia.

**Confiança do score agora combina cobertura de métricas E volume de amostra** (`_score_confidence`) — o mais fraco manda. Antes só cobertura era medida; uma campanha com 2 conversões e todas as métricas preenchidas tinha cobertura 57% e confiança suficiente para ser rotulada "Escalável". `< 10` conversões força `low`, `10–29` limita a `medium`, `30+` libera `high`. Os cortes são constantes isoladas (`_MIN_CONVERSOES_CONFIAVEL`/`_ESTAVEL`) se precisar ajustar depois de dados reais.

**Ponto em aberto, não decidido**: o quinto caso testado (CPM 3x o teto bloqueando a escala) não ganhou cenário próprio — a escala é bloqueada e o CPM aparece vermelho no semáforo, mas sem card de causa raiz nomeado. Foi oferecido ao usuário criar um "Cenário de leilão caro" explícito; **sem resposta ainda**, fica para decisão numa próxima sessão.

### Parte D — revisão do prompt da IA

Achado central: o prompt tinha um viés estrutural para inventar quando os dados eram magros — *"NUNCA deixe o usuário sem resposta útil"*, *"NUNCA retorne uma análise vazia"*, *"identifique TODOS os cenários relevantes"* — a mesma doença do NG-T01, só do lado da IA. Substituído por um **Princípio 0 (NÃO INVENTE)** explícito: proíbe benchmark de mercado não verificável e promessa de resultado, e valida "os dados não permitem afirmar X, envie Y" como resposta completa e legítima, não como falha.

Outras 7 correções, menores mas reais: **7 dos 16 targets do engine nunca chegavam à IA** (CPM máximo, faixas de frequência, volume semanal mínimo, margens de escala) — ela podia contradizer o card exibido ao lado dela na mesma tela; cada target agora é marcado como **"definido pelo gestor"** ou **"padrão do sistema"**, para não atribuir ao usuário uma meta que foi default do produto; a nota de cada `MetricEvaluation` (que carrega a meta usada pelo engine) agora vai junto no prompt, não só o número cru; campanha `google_ads` recebe aviso explícito para não recomendar recurso exclusivo do Meta (Advantage+, LAL); os 4 cenários novos entraram no vocabulário de referência da IA; a ação recomendada pela IA (`extra_scenarios[].recommended_action`) agora é truncada em 60 chars no adapter, igual à do engine — antes estourava o card por não ter limite.

### Parte E — números animados no detalhe da campanha

Pedido de UX do usuário: score e tiles de métrica contam de 0 até o valor real ao abrir o detalhe, com escalonamento de 55ms por card (`lib/countup.ts`, `components/AnimatedNumber.tsx`). Dois cuidados validados por teste (incluindo teste de mutação, porque a primeira versão não travava o valor final exato):

- **Métrica ausente (`—`) nunca vira zero animado** — parseia a string já formatada e, se não há número extraível, renderiza o texto original intacto.
- **`prefers-reduced-motion` mostra o valor final imediato**, não o estado inicial zerado — mesma armadilha dos cards invisíveis corrigida em 2026-07-26 (animação desligada sem cuidado apaga o conteúdo, não só o movimento).

Validado ao vivo: score contando `34 → 64 → 81 → 92 → 98 → 100`, valores finais dos tiles idênticos aos originais (R$ 8.420, R$ 9.260, 1,1x, 0,7%, 3,4).

### Estado dos commits ao final desta sessão

3 commits na `main`, todos locais até este encerramento (`1501bc5` backend, `82f0cb9` frontend, `1682f14` adiciona `teste.md` como registro de auditoria, no mesmo espírito do `AUDITORIA.md` do backend). Push feito agora só para `origin` (pessoal) — **`origin` e `empresa` (`NexGoldCompany/NexGestor`) ficam dessincronizados até alguém empurrar pra lá também**; o usuário tem `push` mas não é `admin` no repo da empresa (mesma limitação já registrada em 2026-07-26).

## Sessão de 2026-07-29 — TikTok Ads e LinkedIn Ads como novas plataformas

Sessão curta, 1 commit na `main` (`04d5856`), com push feito pro `origin`. Suítes ao final: **backend 1354/1354**, **frontend 167/167**, `tsc --noEmit` limpo, `plasmo build` limpo.

**Pedido do usuário:** o formulário de criação de campanha só oferecia Meta Ads e Google Ads; pediu para adicionar mais plataformas. Perguntado qual(is), o usuário delegou a escolha ("as que você achar mais recomendado"). Escolhidas **TikTok Ads** (forte crescimento em e-commerce/infoproduto no Brasil) e **LinkedIn Ads** (cobre geração de leads B2B, nicho que Meta/Google não atendem bem) — Pinterest e Microsoft/Bing Ads ficaram de fora por menor relevância no mercado brasileiro atual, mas o enum fica trivial de estender se precisar depois.

**Mudanças:**

- **Backend**: `CampaignPlatform` (`app/schema/schema.py`) estendido de 2 para 4 valores (`Literal["meta_ads", "google_ads", "tiktok_ads", "linkedin_ads"]`).
- **Prompt da IA generalizado** (`app/service/prompts.py`): o aviso "não recomende recursos exclusivos do Meta (Advantage+, LAL, Gerenciador de Eventos)" antes só disparava quando `platform == "google_ads"` — na prática o vocabulário do engine é 100% Meta, então TikTok e LinkedIn tinham exatamente o mesmo problema que já tinha sido corrigido só para o Google (achado em 2026-07-28 parte 2, NG-T01). Agora dispara para **qualquer plataforma diferente de Meta**, com rótulos (`Meta Ads`, `Google Ads`, `TikTok Ads`, `LinkedIn Ads`) centralizados num dict (`_PLATFORM_LABELS`).
- **Testes de backend**: 2 novos (aviso de plataforma disparando pra TikTok e LinkedIn, espelhando os testes já existentes de Google/Meta) + 1 ajustado (`test_valor_fora_da_lista_rejeitado` usava `tiktok_ads` como exemplo de valor **inválido** — trocado para `pinterest_ads`, já que `tiktok_ads` virou válido).
- **Frontend**: `NewCampaignModal.tsx` ganhou as 2 opções novas no `<select>` de plataforma e na whitelist fechada (`PLATFORM_VALUES`) usada tanto pelo formulário manual quanto pelo parser de importação de JSON.
- **Bug real encontrado e corrigido durante a mudança** (não fazia parte do pedido original — apareceu ao mexer no ponto de mapeamento): `lib/adapt.ts` traduzia a plataforma do backend pro rótulo da UI com um ternário binário — `google_ads` → "Google Ads", **qualquer outra coisa** → "Meta Ads". Isso já rotularia TikTok/LinkedIn como Meta Ads silenciosamente assim que alguém escolhesse essas opções no formulário — atribuição errada de plataforma apresentada como fato, o mesmo tipo de erro do NG-T03 (2026-07-28 parte 2), só que num ponto diferente do código. Virou um dict (`PLATFORM_LABELS`, mesmos 4 valores do backend) com fallback explícito só para plataforma desconhecida ou ausente. Um teste antigo (`test/lib/adapt.test.ts`) documentava esse comportamento binário como o esperado ("qualquer outra coisa (incluindo meta_ads) vira Meta Ads") — reescrito para cobrir os 4 mapeamentos corretos + o fallback legítimo (plataforma desconhecida ou campo ausente).

**Validado:** suítes automatizadas rodando de fato (não só lidas do commit anterior) — `pytest` e `npm test` executados nesta sessão antes do commit, `tsc --noEmit` e `plasmo build` também. **Não testado ao vivo no navegador** (só type-check + build + testes automatizados) — os selects/opções novos não foram clicados manualmente numa extensão carregada.

## Sessão de 2026-08-10 — distribuição para a equipe: backend compartilhado em VPS

Sessão de infraestrutura e documentação, **sem mudança no código de produto**
(nenhum arquivo `.py`/`.tsx` de aplicação foi tocado). 1 commit na `main`
(`f7c4f36`), com push **só pro `origin`**. Suítes ao final: **backend 1367**,
**frontend 199**, `tsc --noEmit` limpo.

> Nota: a suíte de backend mediu **1367** nesta sessão, enquanto o registro de
> 2026-07-29 dizia 1354. **Nenhum teste foi adicionado aqui** — a diferença não
> foi investigada e pode ser erro de anotação da sessão anterior.

### Problema e decisão de arquitetura

O pedido do usuário: a equipe precisa usar o NexGestor sem saber mexer em nada
técnico. O caminho que existia (`COMO-USAR.md` + `iniciar-backend.bat/.sh` +
`extensao-pronta/`) exigia **cada pessoa instalar Python e manter o backend
rodando na própria máquina** — inviável para o público-alvo.

**Decisão: um backend compartilhado num VPS da Hostinger** (KVM VPS, root, que a
empresa já possui), com a extensão distribuída como **zip pré-buildado** carregado
"sem compactação". Chrome Web Store foi descartada pelo usuário para este período
(taxa, revisão de dias, e o content script de scraping do facebook.com atrairia
escrutínio na revisão).

**Decisões do usuário registradas:**
- **IA LIGADA com chave única compartilhada** no servidor (supersede o default
  "AI-off" das sessões anteriores). O limite de R$15 passa a ser dividido por
  toda a equipe — aceito conscientemente.
- **O VPS vai clonar do repo PESSOAL** (`GustavoECocchi/NexGestor`). Motivo
  técnico verificado via API: chave de deploy exige **admin**, e no repo da
  empresa o usuário é `admin=false, push=true`. Migrar depois é um comando
  (`git remote set-url`).
- **O modo local foi aposentado** para a equipe (os scripts `iniciar-backend.*`
  continuam no repo, marcados como só-desenvolvimento).

### O que foi criado

- `backend/backend-nexgestor-main/Dockerfile` — imagem do backend; roda como
  usuário sem privilégio (`uid 10001`), não copia `.env`.
- `backend/backend-nexgestor-main/.dockerignore` — impede o `.env` de dev (com a
  chave real) de entrar no contexto de build.
- `deploy/docker-compose.yml` + `deploy/Caddyfile` — API + Caddy como porta de
  entrada, com **HTTPS automático** (Let's Encrypt, renovação sozinha).
- `deploy/.env.example` e `deploy/README.md` — runbook do zero (DNS, Docker,
  clone, `.env` no servidor, subir, testar, firewall, gerar o pacote da equipe).
- `frontend/nexgestor-extension/build-team.sh` — grava a URL do backend no build,
  gera o zip da equipe **e regenera `extensao-pronta/`**.

### O que foi VALIDADO de fato (com Podman, disponível no Fedora)

- **Imagem builda** e o container **responde 200** em `GET /scenarios` e
  `POST /analyze` (análise real, `ai_insights: null` com IA off).
- **Roda sem privilégio**: `uid=10001(appuser)` confirmado dentro do container.
- **A chave do Gemini NÃO entra na imagem**: `.env` inexistente lá dentro, e a
  chave real não aparece em nenhuma camada (busca no `podman save` completo).
- **Caddyfile validado pelo binário real do Caddy** → *"Valid configuration"*,
  com HTTPS e redirect HTTP→HTTPS automáticos confirmados no adapt.
- **CORS provado empiricamente**: preflight `OPTIONS` + `POST` com
  `Origin: chrome-extension://…` retornam os cabeçalhos corretos e `200`. Isso
  confirma que a extensão fala com o backend **sem** precisar da URL em
  `host_permissions` — só a variável `PLASMO_PUBLIC_API_BASE` importa.
- **Pipeline do build da extensão testado ponta a ponta** com URL de exemplo: o
  compilador embute a URL direto no `fetch(...)`. Artefatos de teste removidos.
- `pip download --python-version 3.12` confirma que as versões fixadas resolvem
  na base da imagem (a máquina local usa 3.14).

### O que NÃO foi validado (honestamente)

- **`docker compose up` como conjunto** — não há `docker compose` nesta máquina;
  só o Podman, que testou a imagem isoladamente. O compose teve YAML e caminhos
  verificados, mas sobe pela primeira vez no VPS.
- **Emissão real do certificado** — depende de domínio apontando pro IP; só a
  configuração foi validada, não o handshake com o Let's Encrypt.
- **Nada foi testado no VPS** — não havia acesso ainda nesta sessão.

### Defeitos encontrados na auto-revisão (todos corrigidos)

O usuário pediu revisão "de cabo a rabo" do que eu tinha acabado de entregar, e
ela pagou: **7 defeitos reais**, sendo dois que teriam quebrado o deploy.

1. **Faltava `.dockerignore`** — o `.env` com a chave real ia no contexto de build.
2. **`git add .` no runbook** versionaria os **45 arquivos do `knowledge-core/`**
   (projeto à parte que o próprio CLAUDE.md diz não pertencer aqui). Corrigido e
   `knowledge-core/` foi para o `.gitignore`.
3. **Afirmação falsa no guia da equipe** — dizia que "o servidor acorda na
   primeira chamada", comportamento do Render grátis (plano descartado); num VPS
   não existe hibernação.
4. **URL `http://` remota passaria batido** — o Chrome bloqueia (mixed content) e
   a extensão falharia **em silêncio**. O script agora recusa.
5. **O runbook travaria no Passo 4** — mandava clonar do GitHub arquivos que ainda
   não tinham sido commitados. Virou "Passo −1" obrigatório.
6. **`extensao-pronta/` apontava para `localhost:8000`** e a instrução de
   regenerá-la (`npm run build` cru) manteria isso — build silenciosamente quebrado
   para quem não roda backend local. Agora o `build-team.sh` cuida dela.
7. Linha duplicada que eu mesmo introduzi na tabela do README.

> **Lição registrada:** reportei "INSTALAR.md removido" quando o `rm -f` rodou de
> um diretório errado — `-f` não reclama de arquivo inexistente, então a mensagem
> de sucesso não provava nada. Só a verificação posterior pegou. Vale para
> qualquer `rm -f`/`mkdir -p`: confirmar o efeito, não confiar no exit code.

### Documentação unificada num caminho só

Havia **dois guias contradizendo um ao outro** (o `COMO-USAR.md` mandava instalar
Python; o `INSTALAR.md` que eu tinha criado dizia que não precisava).

- `COMO-USAR.md` **reescrito** como guia único do modo nuvem, preservando as
  partes boas do original (tabela dos 3 modos de entrada, "o que esperar",
  dúvidas). O trecho "a camada de IA está desligada" deixou de ser verdade e foi
  corrigido.
- `INSTALAR.md` **apagado** (duplicata).
- `README.md`: "caminho rápido" agora descreve o modo nuvem; chave da IA
  documentada como **uma só no servidor** (era "cada pessoa usa a própria");
  `iniciar-backend.*` marcados como só-desenvolvimento.

### Estado do deploy ao final da sessão — NÃO EXECUTADO

O deploy **não aconteceu**. Faltam três coisas, todas fora do controle do
código:

1. **Domínio** — o usuário já solicitou; ainda não recebeu. Plano: subdomínio
   `api.<domínio>`. Alternativa registrada se não vier: `<IP>.nip.io`.
2. **Acesso ao VPS** — outro desenvolvedor vai fornecer. **Chave SSH ed25519 foi
   gerada nesta máquina** (`~/.ssh/id_ed25519`), sem passphrase, comentário
   `gustavo-nexgestor-vps`; a pública foi passada pro usuário enviar.
3. **Coordenação de portas** — o outro dev vai subir **outro serviço no mesmo
   VPS hoje**. Só um programa ocupa a 443. **Decisão do usuário: esperar ele
   subir primeiro e fazer o NexGestor no dia seguinte.**

**Ao retomar, começar por aqui:** pedir a saída de `ss -tlnp | grep -E ':(80|443)'`
e `docker ps` no VPS. Se as portas estiverem livres → runbook como está
(opção A, nosso Caddy é o porteiro). Se o serviço dele estiver na 443 → **opção
B**: remover o serviço `caddy` do `docker-compose.yml`, expor a API só em
`127.0.0.1:8000` e o proxy dele encaminha `api.<domínio>` pra lá. Também lembrar
que o **registro DNS tipo A deve ser criado o quanto antes** — o Caddy só emite o
certificado depois da propagação, e essa é a causa nº 1 de falha no primeiro
`up`.

## Sessão de 2026-08-12 — subdomínio definido, registro DNS ainda não criado

Sessão curta, **sem nenhuma mudança de código** (nenhum arquivo de aplicação,
teste ou deploy foi tocado). Suite backend reconferida: **1367 passed, 0 failed**
em 1,4s — mesmo número da sessão de 2026-08-10, o que confirma que 1367 é a
contagem real e que a divergência anotada lá (1354 vs 1367) foi erro de anotação
de uma sessão anterior, não teste some/aparece. Frontend não tocado, `tsc` não
rodado (nada para validar).

O deploy **continua não executado**. O que mudou hoje é só o estado do primeiro
bloqueio.

### Subdomínio: nome definido, apontamento inexistente

O usuário informou que recebeu o subdomínio **`gestor.nexgold.com.br`**. A
verificação de DNS mostrou que isso é **menos do que parece**: o nome foi
escolhido, mas **o registro nunca foi criado**.

- Consulta direta ao servidor autoritativo (`ns1.dns-parking.com`, resposta com
  flag `aa`) retorna **NXDOMAIN** para `gestor.nexgold.com.br`. Não é atraso de
  propagação — o nome não está na zona. Sem A, sem CNAME.
- **O DNS do `nexgold.com.br` é gerenciado pela Hostinger**
  (`ns1/ns2.dns-parking.com`, contato `dns.hostinger.com`) — mesma casa do VPS,
  então o registro se cria no hPanel (Domínios → Zona DNS).
- A zona foi editada em 11/08 (serial `2026081101`) — alguém mexeu nela na
  véspera, só não criou o `gestor`.
- **O apex `nexgold.com.br` aponta pra dois IPs** (`147.79.105.23` e
  `89.116.213.9`), ambos com 80/443 abertas mas resetando sem SNI — cara de
  hospedagem compartilhada do site institucional. **Não reaproveitar esses IPs
  para o `gestor`**: apontar pra hospedagem compartilhada faria o Caddy falhar
  de um jeito confuso de depurar. O `www` confirma o padrão (aponta pra
  `...cdn.hstgr.net`).

**Registro a criar** (falta só o IP do VPS): tipo `A`, nome `gestor` (só isso —
a Hostinger completa o domínio; digitar o nome inteiro vira
`gestor.nexgold.com.br.nexgold.com.br`), apontando pro IP do VPS, TTL padrão. O
TTL negativo da zona é 600s, então a confirmação por `dig` vale ~10 min depois
de criado.

### O bloqueio real, nomeado com precisão

O usuário perguntou o que exatamente impede o deploy. A resposta, registrada
para não se perder: **o IP do VPS e o acesso SSH**. Os dois são irredutíveis, e
o resto é contornável.

A cadeia que trava hoje: a extensão **precisa** de HTTPS (o `build-team.sh`
recusa URL `http://` remota de propósito — o Chrome bloqueia a chamada e a
extensão falha **em silêncio**, achado da auto-revisão de 2026-08-10); HTTPS
exige certificado; o Let's Encrypt só emite depois de resolver o nome no DNS
público e alcançar o servidor na porta 80. Hoje isso morre na resolução do nome
(NXDOMAIN) — não é erro contornável por configuração, é a CA recusando emitir
para um nome inexistente.

**Não bloqueia:** a porta 443 ocupada pelo serviço do outro dev (é a opção B já
prevista, ~2 min de ajuste) e o nome específico do subdomínio.

**Atalho registrado, com ressalva:** `<IP>.nip.io` dispensa o registro A e o
acesso ao painel. Dois poréns — a Let's Encrypt limita emissão por domínio
registrado e o `nip.io` inteiro é **um** domínio compartilhado por todo mundo,
então esbarrar no limite é comum; e a URL é feia para um produto que a equipe
vai usar. Serve para destravar um teste, não para ficar. **Repare que até o
atalho precisa do IP do VPS** — é esse o dado que falta por qualquer caminho.

### Pendente desta sessão

- **IP do VPS** — não fornecido. É o que falta para criar o registro A.
- **Acesso SSH ao VPS** — segue pendente (chave `ed25519` já gerada em
  2026-08-10, pública já entregue ao usuário para enviar ao outro dev).
- **Estado da porta 443 no VPS** — não verificável sem acesso; segue indefinido
  entre opção A e opção B.
- **Variante do compose para a opção B** — foi oferecida para adiantar em
  paralelo, mas **não foi escrita** (o usuário encerrou a sessão antes). O
  `docker-compose.yml` continua na forma da opção A, com o Caddy tomando 80/443.

## Sessão de 2026-08-14 — o deploy JÁ estava no ar, persistência compartilhada e exclusão de campanha

Sessão longa, 5 commits na `main` (`b988be0`, `f454dda`, `f65ba77`, `615e7d8`,
`ce99a95`). Suítes ao final: **backend 1393**, **frontend 283**, `tsc --noEmit`
e `plasmo build` limpos.

### O achado que mudou o ponto de partida

O `CLAUDE.md` dizia que o deploy estava bloqueado por falta de IP e SSH. **Já
tinha sido feito por outra pessoa** — medido de fora, não presumido: DNS
resolvendo para o VPS (PTR `srv1884808.hstgr.cloud`), certificado Let's
Encrypt válido até 11/11/2026, `GET /scenarios` devolvendo os 15 cenários,
`POST /analyze` em 0,08s com o engine correto, CORS da extensão passando. Quem
atende 80/443 é o **nginx do próprio servidor**, não o Caddy deste repositório
— por isso o `docker-compose.yml` passou a subir só o backend em
`127.0.0.1:8000`, e a variante com Caddy virou `docker-compose.caddy.yml`.

Três coisas que a documentação registrava errado, corrigidas:

- O **limite de requisições já está ativo** (rajada de 12 → 11 passam, a 12ª
  volta 429; reproduzido duas vezes), enquanto o arquivo de referência o
  descrevia como opcional e comentado.
- O **404 em `/docs` não é hardening, é roteamento**: `/docs` devolve o 404
  HTML do nginx e `/api/v1/<inexistente>` devolve o 404 JSON do FastAPI. O
  `main.py` não desabilita a documentação, então aplicar o `location /` do
  arquivo de exemplo sem adaptar exporia `/docs` e `/openapi.json`.
- A **raiz do domínio serve o painel da extensão compilado** (`__plasmo`,
  `sidepanel.*.js`). Não vaza segredo, mas provavelmente não foi intencional —
  vale confirmar com quem montou o servidor.

### O 429 nunca chegava à extensão (e a correção mais valiosa da sessão)

O 429 do limite é gerado pelo **nginx** e sai **sem cabeçalho CORS**, ao
contrário do 200 que vem do backend. O Chrome bloqueia a resposta antes do
JavaScript ler o status, então tudo chegava como `Failed to fetch` — e o
tratamento de 429 recém-escrito era, na prática, código morto.

A causa raiz era o host de produção **nunca ter entrado em
`host_permissions`**. Com ele declarado, o painel fica isento de CORS e passa a
enxergar as respostas do proxy. **Provado em Chromium 151** com duas cópias do
mesmo build diferindo só nessa linha, contra o servidor real:

| Build | 14 chamadas simultâneas |
|---|---|
| com o host declarado | leu **5×200 e 9×429**, nenhuma bloqueada |
| sem o host declarado | **14 de 14 bloqueadas** (`Failed to fetch`) |

Numa chamada isolada as duas leem 200 — o CORS do backend sempre funcionou; a
diferença aparece só nos erros do proxy. Isso **não contradiz** o registro de
2026-08-10 ("a extensão fala com o backend sem `host_permissions`"): aquilo
vale para as respostas do backend; a declaração acrescenta enxergar as do
proxy.

> Interpolar `$PLASMO_PUBLIC_API_BASE` no manifest foi testado e **descartado**:
> sem a variável definida o literal permanece no manifest gerado e o Chrome
> recusaria a extensão em qualquer `npm run build` cru. O host ficou literal e
> o `build-team.sh` avisa quando alguém builda para URL não coberta.

Outros três defeitos no tratamento de erro, cada um provado por teste antes da
correção e por teste de mutação depois: o timeout não cobria a leitura do corpo
(o teste **travou** em vez de falhar — assinatura exata do bug); mensagens já
escritas para o usuário eram embrulhadas em "A análise falhou", contradizendo o
próprio texto; e a detecção de abort por `instanceof` é frágil nos dois
sentidos (`DOMException` **não** é `instanceof Error` no jsdom, e **é** no
Chrome). `lib/api.ts` não tinha nenhum teste — agora tem.

### Persistência: base COMPARTILHADA (decisão temporária, explícita)

Escolha do usuário: **uma base só, todos veem tudo**, sem login e sem dono —
e registrada como **válida apenas para o período de testes**. Está escrito
assim em `config.py`, `storage.py`, nas rotas, no `lib/api.ts`, no `README.md`
e no `COMO-USAR.md`, sempre ao lado do caminho de migração (coluna `dono`,
filtro no listar/remover, autenticação de verdade no lugar do identificador).

Decisões de desenho que sustentam isso:

- **`DB_PATH` vazio é o padrão** — quem roda local segue stateless e a suíte
  não toca disco por acidente; quem liga é o compose. Desligada, as rotas
  respondem **501, não 500**, e a extensão trata em silêncio.
- O **payload é opaco** para o backend: mudança de campo na tela não vira
  migração de banco.
- **O id local deixou de ser identidade.** Ele é gerado por navegador (≥1000),
  então a primeira campanha da Ana e a do Bruno nasceriam ambas como 1000 e
  uma sobrescreveria a outra. Quem identifica passa a ser o id do servidor.
- Duas regras de mesclagem seguram o risco de perder dado: o servidor manda no
  que já foi salvo lá, e campanha que existe **só** neste navegador nunca é
  descartada — e **sobe sozinha** na próxima abertura.

Verificado com container e navegador reais: o volume nasce pertencendo ao uid
10001; **destruir o container E a imagem** e subir de novo mantém os dados com
os timestamps originais; dois perfis de navegador distintos enxergam a mesma
base e uma campanha criada depois aparece nos dois; e uma campanha só-local
subiu sozinha ao abrir a extensão (`id 1000 → 1001, serverId 1`).

> Nota de bastidor: a primeira rodada desse último teste falhou por **bug do
> teste, não do produto** — páginas de extensão MV3 bloqueiam script inline por
> CSP, então o seed do `localStorage` nunca rodava.

### Exclusão de campanha (lixeira no card)

Lixeira aparece no hover, no canto do card, com confirmação **"Apagar para todo
o time?"** — texto deliberado, porque um "tem certeza?" genérico esconderia a
consequência real da base compartilhada. Exemplos (mock) não têm lixeira.

Modos de falha previstos e tratados: clique/Enter na lixeira não pode abrir a
campanha (o card inteiro é clicável); campanha só-local é apagada sem tocar na
rede; **404 conta como sucesso** (outra pessoa já apagou — simulado com seis
DELETEs paralelos do mesmo id: exatamente **um 200 e cinco 404**); servidor
fora do ar **não** tira o card da tela (sumir aqui e continuar lá faria a
campanha ressuscitar depois); e a corrida real entre a sincronização em voo e o
apagar é barrada por um registro de ids apagados na sessão.

**Achado fora do pedido:** o card é `role="button"` sem rótulo, então seu nome
acessível era *todo o texto interno* — um leitor de tela leria o card inteiro
como nome do botão. Ganhou `aria-label` próprio.

### A IA escrevia alerta de risco que ninguém via

O backend devolve quatro blocos de IA; o adapter lia dois e **descartava
`contextual_insights` e `risk_warnings` em silêncio** desde que a camada de IA
existe — a chamada ao Gemini era paga, o modelo escrevia o alerta, e a tela
jogava fora. Achado ao responder "onde vejo o que a IA respondeu?" durante o
teste manual do usuário. Agora aparecem numa seção **"Observações da IA"** no
detalhe, com a janela estimada (48h, 1 semana) como etiqueta, em laranja
(risco preventivo ≠ erro consumado), renderizados como **texto puro**.

### Simulações contra o backend real (2 workers, como em produção)

- **100 gravações concorrentes**: todas 200, nenhuma perdida, nenhum
  "database is locked", zero 500 no log.
- **Toda entrada inválida** (payload string/número/nulo/ausente, corpo não-JSON,
  id não numérico no DELETE) → **422, nunca 500**.
- **Payload hostil** (script, aspas, emoji, quebras, `DROP TABLE`) volta
  idêntico; a tabela continua de pé (queries parametrizadas).
- **Tetos** de payload e de campanhas → 413 e 507, e o limite **nunca** vira
  descarte silencioso do dado antigo.
- **Banco em pasta sem permissão de escrita**: o app **sobe**, a persistência
  devolve 500 com mensagem limpa (sem traceback no corpo, sem chave no log) e a
  **análise continua respondendo 200** — o produto principal não cai junto com
  o acessório.

Os três últimos viraram teste automatizado.

### Teste manual do usuário (parcial)

O usuário carregou a extensão na própria máquina, criou uma campanha pelo modo
"Importar arquivo" e **apagou com sucesso** — confirmado no servidor, não só na
tela: `POST 200` → `DELETE 200` → base zerada.

**Ficou sem testar** (o usuário precisou sair): ver a seção "Observações da IA"
com o build novo, o teste de persistência por recarga da extensão, e o de
servidor fora do ar (a extensão deve manter o card e dizer "Não foi possível
apagar").

### Observação de produto, não corrigida

Ao montar dados de teste de **pequena escala**, uma campanha saudável saiu
**RED com score 100**: o Cenário I dispara porque o padrão do engine exige 50
conversões/semana (regra do Meta para sair do aprendizado), e o formulário
manual **não tem campo** para ajustar esse piso (só a importação por JSON tem,
via `min_weekly_conversions`). Para anunciante pequeno, quase toda campanha vai
parecer crítica. Decisão de produto, deixada para o usuário.

## Sessão de 2026-08-15 — repositório da empresa sincronizado, sem mudança de código

Sessão curta, administrativa. **Nenhum arquivo de aplicação foi tocado** — só
`CLAUDE.md`. Suite backend reconferida ao final: **1393 passed, 0 failed**.
Frontend não tocado, `tsc --noEmit` não rodado (nada para validar).

- **`empresa/main` estava 10 commits atrás de `origin/main`** (pendentes desde
  2026-07-28: sessões de 2026-07-28/29, 2026-08-10 e os 5 de 2026-08-14).
  Confirmado fast-forward limpo (`git merge-base --is-ancestor empresa/main
  main`) antes de empurrar — sem rebase, sem force. `git push empresa main`
  resolveu; os dois remotes ficaram no mesmo commit. Isso fecha o item 8 do
  roadmap, que estava marcado como pendente de sincronização.
- **Combinado com o outro dev**: ele avisou que foi ele quem subiu o código no
  VPS da primeira vez, e o usuário pediu a ele para atualizar com o código
  novo (que já tinha persistência/lixeira, commitado desde 2026-08-14).
  **Ainda não confirmado que ele rodou isso** — `GET
  /api/v1/campaigns` em produção não foi reconferido nesta sessão. É o
  primeiro passo a checar na próxima sessão (ver item 9 abaixo).
- Sem mudança de código, sem decisão de produto nova. O resto da sessão foi
  conversa sobre nível técnico do projeto e orientação de carreira do usuário
  (fora do escopo deste arquivo).

## Sessão de 2026-08-25 (parte 2) — varredura do backend: 13 defeitos de veracidade e coerência

Pedido do usuário depois do bug do card no dashboard (parte 1): varrer o
backend atrás de "erros como esse" — falsos positivos, texto que contradiz o
dado, conflitos entre cenários. Suítes ao final: **backend 1402 → 1450/1450**,
**dashboard 288/288**, `tsc --noEmit` limpo.

### Por que 1402 testes verdes não pegavam nada disso

Todos os testes existentes usavam metas próximas do default: `min_ctr_link`
nunca abaixo de 1.0, `min_roas` nunca acima de 3.0, `min_hold_rate` só 5 ou 15.
Os defeitos vivem **fora dessa faixa** — exatamente onde cai um gestor que
configura as próprias metas, que é o motivo de a classe `Targets` existir.

Método: 80.000 casos de fuzz checando **invariantes** (propriedades que nunca
podem ser violadas) em vez de valores esperados. **0 crashes** — a robustez das
sessões anteriores segurou; o que quebrava era a veracidade do texto e a
coerência das recomendações.

### Os três padrões de raiz

1. **Limiar hardcoded ignorando o `Target` configurável.** `ctr_link < 0.7`
   (Cenário C e nota de CTR Todos), `hold_rate < 10.0` (Cenário B),
   `roas > 10.0` (Cenário K). Como o semáforo da métrica JÁ usava o alvo, os
   dois discordavam sobre o mesmo número na mesma tela.
2. **Texto formatado sem validar sinal/precisão do número.** Déficit negativo,
   meta arredondada, desvio exibido como 0%.
3. **Ausência de regra de conflito entre cenários com ações opostas.**

### Achados (todos reproduzidos antes de corrigir, todos com teste de mutação)

**Afirmação factualmente falsa:**

- **"deficit de -30" — 10,2% de todas as análises.** `learning_phase=True` com
  volume ACIMA da meta: `deficit = meta - volume` ficava negativo e era exibido
  como déficit, enquanto o semáforo de Conversões/semana dizia "✓ Volume
  suficiente" na mesma resposta. Era o achado mais frequente da varredura.
- **CTR Link acima da meta declarado "crítico".** Com `min_ctr_link=0.5` e
  `ctr_link=0.65` (30% ACIMA da meta), o Cenário C disparava chamando de
  crítico o que o semáforo marcava GREEN → **status RED com score 100/100**.
- **K e O contradizendo-se sobre o mesmo ROAS.** Com meta 15x e ROAS 12x, K
  dizia "ilusão estatística, ROAS alto mascarando problema" e O dizia "ROAS
  12.0x abaixo da meta de 15.0x", lado a lado.
- **Meta arredondada gerando frase falsa.** `{meta:.0f}` com
  `min_hold_rate=3.4` produzia "Hold Rate 3.1% abaixo da meta de **3%**" — falso
  na própria linha — e o tile anunciava "Meta: >3%", que não é a meta que o
  gestor configurou. Atingia 69% das análises na forma mais branda (`:.1f`
  exibindo 2.45 como 2.5).
- **"⚠ CPA 0% acima da meta"** — `{delta:.0f}` transformava 0,4% de desvio num
  alerta que declara desvio zero.

**Recomendação contraditória (risco financeiro):**

- **"Aumentar orçamento agora" num criativo reprovado.** O Cenário G tem
  prioridade 1 e virava a ação principal mesmo com o Cenário A (prioridade 2)
  dizendo "Pausar o criativo atual" na mesma resposta.
- **Ação principal contradizendo cenário listado.** Com zero conversão sobre
  R$2.000, D virava a ação principal ("Manter campanhas ativas", e o card ainda
  afirmava "Pausar seria um erro") enquanto L dizia "Pausar a veiculação".
- **Pausar + expandir juntos.** L ("pausar") com H ("duplicar estrutura para
  novos públicos").
- **E e G no mesmo orçamento.** "Reduzir orçamento do conjunto saturado" com
  "aumentar orçamento agora". Com os defaults nunca coexistiam (teto de escala
  1.8 < fadiga 2.8), o que **escondia o conflito** — mas os dois limiares são
  configuráveis.

**Severidade invertida:**

- **Hold Rate.** O detector do Cenário B usava `< 10.0` fixo enquanto o semáforo
  usava `min(10, 70% da meta)` — corrigido em 26/07/2026 **só no semáforo**.
  Resultado: Hold 12 contra meta 30 (40% da meta) saía prioridade 2/YELLOW/score
  62, e Hold 9 contra meta 11 (82% da meta) saía prioridade 1/RED/score 88. A
  campanha pior recebia o veredito mais brando, contrariando o próprio score.

**Números inventados** (o mesmo pecado que o Princípio 0 do prompt proíbe à IA):

- Cenário J prometia "Com redução de 15% do orçamento, CPA estimado: R$X"
  dividindo 85% do gasto pelas MESMAS conversões — assume que cortar verba não
  custa conversão, e por construção **sempre** prometia um CPA 15% menor.
- Cenário H previa "N dia(s) antes do colapso" dividindo a distância até a
  fadiga por uma taxa de 0,3/dia que não existe no input (não há série
  histórica).

**Coerência e documentação:**

- **RED com score ≥90 em 7,85% das análises** ("Crítico" ao lado de "97/100").
  É legítimo — o score mede as métricas recebidas, o status inclui a causa raiz
  — mas sem explicação lê como erro do produto. **Nenhum número foi alterado**:
  o summary agora diz por que divergem.
- `_apply_minimal_fallback` sobrescrevia o summary e descartava a ressalva de
  cobertura parcial, justamente no caminho com menos dados.
- O catálogo de `GET /campaign/scenarios` (servido ao frontend como
  documentação) descrevia os limiares fixos já removidos e não mencionava nem o
  gate de evidência do Cenário G (2026-07-28) nem a condição de CPM.

### Como foi corrigido

Cada limiar hardcoded virou uma função nomeada e **compartilhada entre o
detector e o semáforo** (`_limiar_red_hold_rate`, `_limiar_red_ctr_link`,
`_limiar_roas_inflado`), então cenário e semáforo passam a significar a mesma
coisa por construção — não dá mais para discordarem. Formatação de meta e de
percentual centralizada em `_meta`/`_pct`. Quatro regras novas de supressão
(L→D/G/H, A→G, C→G, E→G) sob um princípio explícito: **nenhuma resposta pode
conter um card mandando ampliar investimento e outro mandando parar; quando as
duas leituras são verdadeiras, vence a que protege o dinheiro do gestor.**

**Comportamento com metas default preservado**: os 1402 testes anteriores
passaram sem alteração em nenhum deles.

### Validação

- **48 testes novos** (`test_regressao_20260825.py`), todos confirmados por
  **teste de mutação: 19/19 mutações detectadas, 0 testes vácuos**. Duas
  mutações passaram na primeira rodada e ambas eram problema do teste, não do
  código: uma usava `39.65`, que como float binário é ligeiramente menor que
  39,65 e portanto já formatava como "39.6" sem reproduzir o arredondamento
  (trocado por `39.66`); a outra mutava só a primeira linha de uma concatenação
  implícita e não chegava a reintroduzir o bug.
- **Fuzz reexecutado**: conflito de direção de orçamento, déficit negativo,
  CTR/ROAS acusados contra a própria meta, K×O juntos e meta exibida errada
  todos em **0 ocorrências**; 0 crashes em 60.000 casos.
- **Ponta a ponta contra o servidor real** (`uvicorn` + `POST /analyze`): o caso
  do déficit negativo volta 200 com o texto correto e com a explicação nova do
  score. Servidor desligado ao final.
- **Não validado pela UI do dashboard** — a verificação foi no nível da API. Os
  campos que mudaram são strings que o frontend só renderiza (`summary`,
  `root_cause`, `primary_action`), e nenhuma estrutura de resposta mudou.

### Ficam registrados como NÃO-defeito (analisados e descartados)

O fuzz com regex grosseiro acusava dois pares que não são contradição: "pausar
o **criativo** atual" (A) ao lado de "manter a **campanha** ativa" (D) age em
objetos diferentes, e "duplicar estrutura para novos públicos" (H) com "pausar o
criativo atual" (A) é complementar — troca-se o criativo E expande-se. Só foram
tratados como conflito os pares que mexem no **mesmo** botão de orçamento em
direções opostas.

## Sessão de 2026-08-26 — selo de estado da IA, PRD retroativo, e o achado de que produção roda sem IA

Suítes ao final: **backend 1450 → 1457** (+7), **dashboard 288 → 331** (+43),
`tsc` e `vite build` limpos. Todas rodadas de fato.

### Começou errado: sessão inteira feita sobre um checkout de 15/08

Esta pasta (`~/Downloads/NexGestor-main`) **nunca deu `pull`** desde 2026-08-15.
Trabalhei a sessão toda achando que a extensão era o produto — sem saber do pivô
para o dashboard web (24/08), do isolamento por dono, nem da varredura de
veracidade. Só descobri **no `git push`**, rejeitado por 11 commits de diferença.

Nada se perdeu: o commit foi preservado numa branch antes de qualquer coisa, o
rebase foi abortado em vez de forçado, e o trabalho foi **reconstruído sobre o
`origin`** — com o selo indo para `frontend/nexgestor-dashboard`, não para a
extensão congelada. **Lição: `git fetch` no começo da sessão, não no fim.**

> Nota: o usuário achou que o dashboard "não tinha sido commitado". Estava
> commitado sim (`d57f596`, 24/08, 67 arquivos, no `origin`) — o que faltava era
> o `pull` **nesta pasta**.

### 🔴 O achado: produção não tem IA nem persistência

Medido com 5 requisições reais contra `https://gestor.nexgold.com.br`:

| Verificação | Resultado |
|---|---|
| `GET /api/v1/campaign/scenarios` | 200, `total: 15` — engine de 07-28 no ar |
| `GET /api/v1/campaigns` | **404** — persistência nunca implantada |
| `POST /api/v1/campaign/analyze` | 200, **`ai_insights: null`** — chave vazia no servidor |
| `GET /docs` | 404 **do nginx** (roteamento, não hardening da app) |
| `GET /` | HTML do painel compilado |

**A equipe avalia o produto sem a camada de IA, sem saber.** O `README.md` e este
arquivo afirmavam "IA ligada com chave compartilhada" — **errado**; o
`deploy/.env.example` (que dizia chave vazia) estava certo. O limite de R$15
provavelmente nunca foi tocado. A chave do `.env` **local** é válida —
confirmada com chamada real ao Gemini, resposta coerente e ancorada nos números.

### Selo de estado da IA no dashboard

Pedido do usuário: *"a ferramenta tem que estar com a ia ligada, mas vamos criar
um botão, o botão mostra se a ia está ligada, ia on ou off"*.

- **Backend:** `GET /api/v1/status` (`app/routes/status.py`). `enabled` e
  `available` são campos separados de propósito: `enabled=true, available=false`
  é "toggle ligado, falta a chave" — o estado exato da produção. Rota pública,
  então reporta **só capacidade binária e o nome do modelo**; nunca a chave nem
  o `DB_PATH` (coberto por teste). Sem header de dono: capacidade do servidor
  não é dado de ninguém.
- **Dashboard:** selo no header com **quatro** estados —
  `IA on` / `IA off` / `IA falhando` / `IA ?`.

**Por que `falhando` precisou existir.** `/status` só prova que a IA está
*configurada* (toggle + chave não-vazia + SDK). **Nada disso prova que a chave
autentica.** Verificado subindo o backend com chave sintética inválida:
`/status` respondeu `available: true` enquanto a análise voltava
`ai_insights: null`. Sem esse estado, o selo mentiria exatamente no caso que
este projeto já viveu (chave revogada em julho, 401 no uso).

Detecção de **custo zero**: em vez de o servidor testar a chave a cada abertura
(uma chamada paga por vez), o frontend observa o desfecho de cada análise
(`src/lib/aiHealth.ts`). Regras: observação vence declaração; `off` vence
observação (quem não prometeu não descumpriu); a falha **não gruda** (a análise
seguinte com IA devolve o selo a "on"); nada é acusado antes de sabermos o que o
servidor oferece; estado **em memória**, não `localStorage` (persistir deixaria
aviso velho depois do problema resolvido).

**Validado ao vivo no dashboard real** (`vite preview` + backend real, passando
pelo `DonoGate`): selo "IA on" com contraste 11,39:1, header sem estouro,
popover dentro da janela. O ciclo completo `IA on → chave inválida → IA falhando
→ chave válida → IA on` foi validado **sem recarregar a página** (na versão
anterior do frontend, antes do porte).

### Três defeitos que a validação pegou (nenhum aparecia em teste)

1. **Promise sem tratamento** — o teste de falha na busca estourou "unhandled
   rejection". Corrigido com `.catch()`.
2. **Cabeçalho estourava 20px** na largura estreita, esmagando o botão de tema
   de 32px para **17px** — faltava `flex:none` nos controles. *(Correção aplicada
   na extensão; no dashboard o header é largo e tem sidebar, então só o
   `flex:none` do próprio selo foi portado.)*
3. **Contraste abaixo do WCAG AA.** Medidos os 6 casos (3 estados × 2 temas):
   `--txt-3` dá 3,51:1 e `--muted` 4,24:1 sobre `--panel` no tema escuro, contra
   o mínimo de 4,5:1 — e o texto tem 10px. Trocado por `--txt-2`.

> **Lição, nos dois sentidos.** A captura de tela sugeriu o título cortado
> ("NexGesto"); minha primeira medição disse que não — mas **a medição estava
> errada** (o clone ficou fora de `.brand` e não herdou a fonte: mediu 77px onde
> o real era 145px). Estava cortado mesmo. Screenshot não prova, e medição no
> contexto de estilo errado também não.

### `docs/PRD.md` criado (movido para `docs/` numa reorganização em 26/08/2026 — ver "Sessão de 2026-08-26" abaixo)

Documento de requisitos retroativo gerado lendo o **código**. Cobre produto, 12
decisões de arquitetura com o porquê, regras de negócio (15 cenários, pesos das
métricas, supressão de conflitos, `final_status` como pior de duas fontes),
stack, funcional vs. pendente, cobertura de testes, segurança e o passo a passo
do deploy pendente.

**⚠️ Escrito antes de eu descobrir o pivô, então descreve a extensão como se
fosse o frontend atual.** Ganhou um aviso no topo mapeando o que ler com
ressalva (side panel → dashboard; base compartilhada → isolada por dono; a
"decisão em aberto" sobre app web → já decidida). O corpo **não** foi reescrito:
o dashboard reaproveita a extensão por cópia, então a maior parte segue válida.
**Revisão completa do PRD contra o dashboard fica pendente.**

Registra duas lacunas conceituais nunca documentadas:
1. **Não existe histórico no produto.** `spark` é `Array(7).fill(score)` (linha
   reta) e `trend` é sempre 0 para campanha real — **só os 2 mocks têm série de
   verdade**. "Últimos 7 dias" no Resumo é texto fixo. Qualquer roadmap de
   evolução/tendência **começa do zero**.
2. **A regra do BLUE tem TRÊS condições**, não duas: além de `GREEN` + cenário
   G, exige `score_confidence !== "low"`. O `docs/CONTRATO_API_FRONTEND.md`
   documenta só as duas primeiras.

E uma seção de **divergências entre documentação e código** (10 itens, nenhum
corrigido). A pior: **`COMO-USAR.md` se contradiz sobre privacidade** dentro do
mesmo arquivo — a seção "O que esperar" diz *"seus dados ficam só no seu
navegador"* enquanto a anterior explica que a base é compartilhada.

### Pendente, guardado a pedido do usuário

Passo a passo para colocar produção em dia (precisa de SSH), no **`docs/PRD.md`
seção 5**: `git pull && docker compose up -d --build` em `deploy/`, depois
preencher `GEMINI_API_KEY` no `.env` **do servidor**. **Não puxar por iniciativa
própria.** Armadilha registrada: se subir por uvicorn/systemd em vez do compose,
o volume e o `DB_PATH` não se aplicam — e o sintoma é **501 em vez de 404**.

## Status atual / Roadmap

1. ✅ Backend: engine de diagnóstico + API validados. Suite **109 → 1450/1450** (1354 até 2026-07-29; +26 de persistência e +13 de robustez em 2026-08-14; +9 do isolamento por dono em 2026-08-24; **+48 da varredura de veracidade em 2026-08-25**), sem falhas ambientais e **sem nenhuma chamada de rede** (ver `conftest.py`). **2026-08-25 (parte 2): 13 defeitos de veracidade/coerência corrigidos** — limiares hardcoded que ignoravam o `Target` do gestor (o cenário chamava de "crítico" o que o semáforo marcava GREEN), texto que contradizia o dado ("deficit de -30" em 10,2% das análises), severidade invertida no Hold Rate, quatro pares de cenários recomendando gastar mais e parar na mesma resposta, e duas previsões fabricadas. Achados por fuzz de invariantes (80k casos, 0 crashes); todos com teste de mutação (19/19 detectadas). Ver "Sessão de 2026-08-25 (parte 2)". Três bugs do engine corrigidos em 2026-07-26 (achados por fuzz). **2026-07-28 (parte 2)**: auditoria externa (`teste.md`) confirmou 5 achados adicionais (3 subestimados no relatório original) + 4 achados próprios (NaN/Infinity derrubando o handler de 422, zeros fabricados, `if valor` tratando 0 como ausente, escala sem evidência vazando por 3 portas além do detector G). Todas corrigidas e validadas por teste de mutação. **4 cenários novos (L–O)** fecham lacunas reais de tráfego pago (zero conversão, amostra insuficiente, vazamento clique→LP, ROAS baixo com custo ok) — nenhum campo de schema novo. Confiança do score agora combina cobertura E volume de amostra. Ver "Sessão de 2026-07-28 (parte 2)" para o detalhamento completo. **2026-07-29**: `CampaignPlatform` estendido para TikTok Ads e LinkedIn Ads (além de Meta/Google); aviso de "não recomende recurso exclusivo do Meta" no prompt da IA generalizado para valer em qualquer plataforma não-Meta (antes só disparava pro Google).
2. ✅ **Integração Gemini validada ao vivo, de novo** — modelo `gemini-flash-lite-latest`. A key da sessão de 2026-07-14 foi revogada (2026-07-16); **key nova configurada e testada ponta a ponta em 2026-07-25** (`ai_insights` preenchido de verdade numa chamada real). Ver "Sessão de 2026-07-25 (parte 2)" — inclui o incidente de duas keys expostas no chat e a regra de segredos fixada a partir dele. **2026-07-28 (parte 2)**: prompt revisado (removida a pressão a inventar quando faltam dados; 7 de 16 targets do engine que nunca chegavam à IA agora vão; aviso de plataforma p/ Google Ads) e reconfirmado ao vivo com 2 chamadas reais (dentro do limite de R$15) — a IA recusa recomendar escala com cobertura baixa e volta ao normal com cobertura alta.
3. 🧊 **CONGELADA em 2026-08-24 — decisão do usuário de migrar extensão → dashboard web (ver item 10). `frontend/nexgestor-extension` não recebe mais commits**, marcada com a tag git local `extensao-estavel-2026-08` como cópia funcional de referência. O histórico abaixo (2026-07 a 2026-08-14) descreve trabalho real e válido — só não é mais o alvo de desenvolvimento ativo. ✅ Frontend: UI completa; modo manual já plugado no backend real (ver correção de estado acima). **Polimento de UX feito em 2026-07-24 parte 2** (copiloto responsivo, persistência de checkmarks, atalho de busca visível, estado vazio, acessibilidade de teclado). Mock reduzido a **2 campanhas de exemplo** (marcadas visualmente como "exemplo") ao lado das campanhas vivas. **Identidade visual e tema fechados em 2026-07-25**: logo integrada, tiles do Resumo com peso visual, **tema claro/escuro com toggle persistido**, contraste do claro conferido contra WCAG, `prefers-reduced-motion` respeitado. **Testes automatizados adicionados na parte 3** (Vitest + Testing Library, cobrindo adapter, sanitizador XSS, store, tema, roteamento do copiloto e parsing de importação de JSON). **Correções de 2026-07-26**: hover dos cards, quadrado azul no anel de score, `.collect-btn` no tema, CSS morto removido. **2026-07-28 (parte 2), suite 99 → 165/165**: zeros fabricados corrigidos na UI (Copiloto/Comparador/Resumo nunca mais inventam R$ 0,00 pra métrica ausente), bug de scroll do detalhe corrigido (2 causas: `scrollIntoView` na montagem do Copiloto + reaproveitamento de nó do DOM entre Home/Detail, achado só na validação ao vivo), rótulos "Diagnóstico IA"/"veredito da IA" agora só aparecem quando há IA de verdade, veredito do comparador não inverte mais o diagnóstico quando o vencedor tem cenário de oportunidade, formulário manual ganhou campos de aprendizado/conversões-semana, **números do detalhe (score + tiles) contam de 0 até o valor real ao abrir a campanha** — validado por type-check + build + suite + verificação visual ao vivo no navegador real (não só jsdom). **2026-08-14, suite 167 → 283/283** (persistência, lixeira, observações da IA, tratamento de erro de rede — ver a sessão de 2026-08-14). **2026-07-29, suite 165 → 167/167**: formulário de nova campanha (e a importação de JSON) ganharam TikTok Ads e LinkedIn Ads como opções de plataforma; corrigido de quebra um bug no adapter (`lib/adapt.ts`) que rotularia qualquer plataforma que não fosse Google Ads como "Meta Ads" — não testado ao vivo no navegador, só type-check + build + suite. Segue sem teste contra o Ads Manager real (única coisa que ainda depende de conta real).
4. 🧊 **Também congelada junto com a extensão (item 3) — sem equivalente no dashboard ainda.** O modo "Coletar automático" foi removido do formulário de nova campanha no dashboard (dependia de `chrome.tabs`); ficaram só manual e importação de arquivo. Migração para Meta Marketing API (OAuth) segue como o caminho real, agora do lado do dashboard. 🟡 **Coleta automática — provisória (scraping via content script), aceitável só para o período de testes atual.** Funciona mecanicamente (mensageria + manifest validados), mas não foi testada contra um Ads Manager real. **Migração para Meta Marketing API (OAuth) adiada de propósito** (ver "Decisão de escopo" acima) — não é bloqueante para o período de testes, só para o lançamento real. **(2026-07-28) Usuário decidiu explicitamente que a validação contra Ads Manager real também não entra nesta rodada de testes** — não puxar como prioridade sem sinal do usuário.
5. ✅ **Key exposta (2026-07-14) revogada e substituída** — confirmado 401 em 2026-07-16; key nova gerada, configurada e validada ao vivo em 2026-07-25 (ver item 2). **Duas keys adicionais foram expostas no chat durante essa própria configuração** (causa: orientação errada minha sobre o prefixo `!`) — tratadas como queimadas; regra de "segredo só por editor externo" fixada no CLAUDE.md.
6. ✅ Testes isolados do `.env` de dev (`_env_file=None` / fixture `autouse` mockando `is_ai_available`) — ver sessão de 2026-07-16 parte 3. PR #1 mergeado na `main`. **Completado em 2026-07-26**: aquele isolamento cobria só `TestIADesativada`; os testes de endpoint ainda faziam 6 chamadas reais ao Gemini por execução. O `conftest.py` agora desliga a IA em toda a suíte (provado com sockets bloqueados: 0 tentativas de rede).
7. ✅ **Persistência isolada por `dono` desde 2026-08-24 — passo 1+2 da migração, AINDA SEM LOGIN DE VERDADE.** A base compartilhada de 2026-08-14 (item obsoleto abaixo) foi substituída: toda rota de `/api/v1/campaigns*` exige o header `X-Nex-Dono` (string simples, sem senha — normalizada trim+lowercase, tanto no backend quanto no cliente), e `storage.py` filtra `listar`/`salvar`/`remover` por ele. **Dois tetos de campanhas** (não um): por dono (500) e global (5000) — o global existe porque, sem login, bastaria inventar identificadores novos para furar um teto só-por-dono; achei essa regressão eu mesmo revisando meu próprio código antes de reportar como pronto, e o teste que a cobre foi confirmado por mutação (desliguei o teto global, o teste quebrou, religuei, voltou a passar). Suite **1393 → 1402/1402**. Autenticação de verdade (senha/sessão) continua fora de escopo, é o passo 3 já esboçado no próprio `storage.py`. **Continua sem estar no ar** — o VPS (item 9) está numa versão ainda mais antiga que antes (nem a persistência compartilhada de 08-14 chegou lá; `GET /api/v1/campaigns` respondia 404 em produção quando checado em 2026-08-24).
8. ✅ **Publicado no repositório da empresa** (2026-07-26) — `NexGoldCompany/NexGestor` (privado), com README de onboarding na raiz. Histórico auditado antes: sem segredos reais. **Sincronizado em 2026-08-15**: `empresa/main` estava 10 commits atrás de `origin/main` (os pendentes de 2026-07-28/29, 2026-08-10 e 2026-08-14); `git push empresa main` resolveu com fast-forward simples (confirmado via `git merge-base --is-ancestor` antes de empurrar). `origin` e `empresa` estão no mesmo commit desde então (conferir com `git rev-list --count empresa/main..main` — deve ser 0). O `push` em si nunca precisou de admin — só a chave de deploy exige (ver item 9).
9. 🟡 **Distribuição para a equipe — o deploy JÁ FOI FEITO (por outra pessoa), mas está DESATUALIZADO.** *(Atualizado em 2026-08-14; o texto de 2026-08-10/12 abaixo ficou obsoleto — os "bloqueios irredutíveis" de IP e SSH não se aplicam mais ao deploy inicial, que aconteceu sem nós.)* `https://gestor.nexgold.com.br` responde, com HTTPS válido até 11/11/2026, atrás do **nginx do próprio VPS** (não do Caddy deste repo) e com **limite de requisições ativo** (60r/m + burst 10, devolvendo 429). **O que está no ar é o código de antes de 2026-08-14**: verificado, `GET /api/v1/campaigns` responde **404** lá. Ou seja, **sem persistência e sem lixeira para a equipe** até alguém com acesso rodar `git pull && docker compose up -d --build` na pasta `deploy/`. Só depois disso faz sentido gerar o pacote (`build-team.sh https://gestor.nexgold.com.br`) — antes, distribuiria uma extensão falando com um backend que não tem essas rotas. **Pendente no servidor, com correção pronta e testada em nginx 1.24 real:** o 429 sai sem cabeçalho CORS (bloco `error_page 429` + `location @limite` em `deploy/nginx-gestor.conf.exemplo`); deixou de ser bloqueante porque o `host_permissions` resolve pelo lado da extensão, mas conserta a causa na origem e cobre o preflight. **🔴 CORRIGIDO EM 2026-08-26: a IA está DESLIGADA em produção.** Medido com `POST /analyze` real — `ai_insights` volta `null`, ou seja `GEMINI_API_KEY` está vazia no VPS. O que este item dizia antes ("A IA está ligada com chave única compartilhada") era **falso**; o `deploy/.env.example` estava certo. A equipe avaliou o produto sem a camada de IA, e o limite de R$15 provavelmente nunca foi tocado. A chave do `.env` **local** é válida (confirmada com chamada real). Passo a passo para ligar: `docs/PRD.md` seção 5.

    *Histórico (2026-08-10):* infraestrutura preparada aqui — O modo "cada um roda Python na própria máquina" foi **aposentado**; o modelo agora é **um backend compartilhado num VPS Hostinger** (Docker + Caddy com HTTPS automático) e a extensão entregue como **zip pré-buildado**. Imagem, container, Caddyfile e CORS de extensão foram **validados de fato** com Podman (ver a sessão de 2026-08-10); o `docker compose` como conjunto e a emissão real do certificado **não** foram — sobem pela primeira vez no VPS. Bloqueado por coisas externas ao código. **Atualização de 2026-08-12:** o **nome** do subdomínio saiu — `gestor.nexgold.com.br` — mas o **registro A nunca foi criado** (NXDOMAIN confirmado no servidor autoritativo da Hostinger, não é propagação pendente). Os bloqueios que restam são **o IP do VPS** (sem ele não há o que cadastrar no DNS, e nem o atalho `nip.io` funciona) e **o acesso SSH** (o deploy roda lá, não aqui) — os dois irredutíveis. A **coordenação da porta 443** continua indefinida, mas é contornável (opção B, ~2 min). A IA fica **ligada com chave única compartilhada** — muda o modelo anterior de "AI-off por padrão" e faz o limite de R$15 ser dividido pela equipe.

10. 🆕 **Dashboard web criado em 2026-08-24 — `frontend/nexgestor-dashboard` (Vite+React+TS+Tailwind), NÃO DEPLOYADO EM LUGAR NENHUM ainda.** Substitui a extensão (item 3, congelada) como alvo de desenvolvimento — decisão do usuário, motivada por feedback externo (professor) de que side panel de extensão limita a experiência; referência visual trazida pelo usuário: `fuse-react-nextjs-demo.fusetheme.com/dashboards/project` (só inspiração de layout, não copiado). Construído por dois agentes em paralelo (frontend/backend), ambos revisados por mim antes de commitar — não só aceitos de olhos fechados. Reaproveita quase tudo da extensão **por cópia**, não por link/pacote compartilhado: `types.ts`, todo `lib/`, componentes e mock são idênticos byte-a-byte (conferido por `diff`), com três adições reais — `lib/dono.ts` + `DonoGate.tsx` (tela de identificação simples, sem senha, antes de entrar) e `DashboardShell.tsx` (sidebar + layout full-screen). `lib/api.ts` manda o header `X-Nex-Dono` em toda chamada de campanhas salvas (exigido pelo backend desde o item 7). Suite portada **283/283**, build limpo, **verificado ao vivo contra o backend real**: dois donos diferentes só veem as próprias campanhas dentro do dashboard (não só via curl — testado clicando de verdade no Chrome). **O que falta, sem maquiagem:** nenhuma hospedagem definida (só rodado localmente via `vite dev`); sidebar tem 1 item de navegação só; sem tela de erro dedicada para backend fora do ar; `.env` não commitado (correto, mas precisa ser configurado manualmente em cada máquina/deploy); autenticação de verdade continua pendente (mesmo caminho do item 7). **2026-08-25**: formulário "Criar campanha" (modo manual) ganhou tooltips de ajuda em linguagem simples nos ~20 campos com jargão de tráfego pago (CPM, CPA, ROAS, Hook rate...) — ver PRD `docs/prds/fase-1-ajuda-formulario-campanha.md` e a sessão de 2026-08-25 abaixo. **2026-08-25 (parte 2)**: marca deixou de aparecer duas vezes (o `Header` repetia logo + "NexGestor" que já estão na sidebar) e o card de campanha foi reorganizado em torno da decisão — status como elemento dominante (ícone + rótulo grande) e uma frase de ação em português simples ("Como escalar"/"Como resolver"), com CPA/ROAS crus saindo do card para a tela de detalhe. `primary_action` do backend passou a ser exposto na `CampaignVM` (o adapter descartava o campo, e por isso o card caía num texto genérico dizendo que não havia motivo identificado — contradizendo a etiqueta de status ao lado). Suite **283 → 288/288**. Referência de layout: Fuse React; identidade visual inalterada.

11. ✅ **`docs/PRD.md` criado (2026-08-26)** — documento de requisitos retroativo gerado lendo o código: produto, 12 decisões de arquitetura com o porquê, regras de negócio (15 cenários, pesos das métricas, supressão de conflitos, `final_status` como pior de duas fontes de evidência), stack, funcional vs. pendente, cobertura de testes, segurança, e o passo a passo do deploy pendente. Registra duas lacunas nunca documentadas: **não existe histórico/série temporal no produto** (`spark` é linha reta, "últimos 7 dias" é texto fixo — só os mocks têm série) e a **regra do BLUE tem 3 condições, não 2**. Mais uma seção de **divergências entre documentação e código** (10 itens, nenhum corrigido; a pior é o `COMO-USAR.md` se contradizendo sobre privacidade). **⚠️ Escrito sobre um checkout de 15/08, então descreve a extensão como frontend atual** — ganhou aviso no topo mapeando o que ler com ressalva; **revisão completa contra o dashboard fica pendente**.
12. ✅ **Selo de estado da IA no dashboard (2026-08-26)** — `GET /api/v1/status` no backend + selo de 4 estados no header do dashboard (`IA on` / `IA off` / `IA falhando` / `IA ?`). O estado `falhando` existe porque `/status` só prova que a IA está *configurada*, não que a chave *autentica* — comprovado subindo o backend com chave inválida (status dizia `available: true`, análise voltava sem IA). Detecção de custo zero, por observação do desfecho de cada análise (`src/lib/aiHealth.ts`), sem chamada paga extra. Validado ao vivo no dashboard real, passando pelo `DonoGate`. Suítes: backend **1450 → 1457**, dashboard **288 → 331**.

> **Ação pendente antes de qualquer outra coisa:** fechar o **alerta de secret scanning #1** no repo pessoal como falso positivo ("Used in tests"), e checar se existe alerta equivalente no repo da empresa (precisa de admin). Nenhuma chave real vazou — isso foi verificado comparando a chave do `.env` contra todos os blobs de todos os commits — mas alerta de segurança aberto e sem explicação assusta a equipe à toa. Ver "Alerta de secret scanning do GitHub" acima. **Ainda não resolvido em 2026-07-28.**
>
> **Decisão em aberto, não resolvida:** nomear ou não um "Cenário de leilão caro" explícito para quando CPM acima do teto bloqueia a escala vertical (hoje só aparece como métrica CPM vermelha, sem card de causa raiz próprio). Oferecido ao usuário em 2026-07-28 (parte 2); sem resposta ainda.
>
> **PRÓXIMO PASSO — retomar exatamente aqui (reescrito em 2026-08-24, o texto
> de 2026-08-14 acima ficou obsoleto pelo pivô extensão→dashboard e pelo
> isolamento por dono — histórico preservado, não é mais o plano):**
>
> O **código** (backend com isolamento por dono + dashboard novo) está **pronto,
> testado e commitado localmente** — mas **nada disso está no ar em lugar
> nenhum ainda**. O VPS nem sequer tem o backend de 2026-08-14; está mais
> atrasado que nunca em relação ao que existe aqui.
>
> 1. **Decidir e fazer o push destes commits** para `origin/main` (repo pessoal,
>    público) — combinado com o usuário ao final da sessão de 2026-08-24, mas o
>    push em si ficou pendente de confirmação explícita antes de executar.
>    Depois, avaliar se sincroniza com `empresa/main` também (ver pendência
>    de sincronização abaixo).
> 2. **Decidir hospedagem do dashboard.** Hoje só roda local (`npm run dev`).
>    Não há Vercel/Netlify/VPS configurado para ele. O backend (VPS Hostinger)
>    já existe e pode servir os dois — falta decidir se o dashboard vai para o
>    mesmo servidor (nginx servindo os arquivos estáticos do `vite build`) ou
>    outro lugar.
> 3. **Atualizar o backend no VPS** — continua sendo o bloqueio mais antigo em
>    aberto (arrastado desde 2026-08-14, agora com mais uma rodada de mudanças
>    em cima). Comando: `git pull && docker compose up -d --build` na pasta
>    `deploy/`. Primeira coisa a checar numa próxima sessão: `curl
>    https://gestor.nexgold.com.br/api/v1/campaigns -H "X-Nex-Dono: teste"` —
>    200 significa que já subiu (e com o header, não só a rota antiga); 404/501
>    significa que não.
> 4. **Extensão**: se alguém ainda depender dela durante a transição, ela vai
>    parar de sincronizar campanhas assim que o backend novo subir — `lib/api.ts`
>    da extensão não manda `X-Nex-Dono` (findado nesta sessão, não corrigido de
>    propósito, ela está congelada). Sem persistência ela cai no `localStorage`
>    local, sem erro visível, então não é catastrófico — mas vale avisar a
>    equipe antes de atualizar o servidor.
> 5. **Aplicar no nginx** o bloco `error_page 429` + `location @limite`
>    (`deploy/nginx-gestor.conf.exemplo`, testado em nginx 1.24 real) — ainda
>    pendente, ainda não bloqueante.
>
> **Antes de abrir para usuários reais (não é para o período de testes):**
> autenticação de verdade (senha/sessão) — hoje é só um identificador que
> qualquer um pode adivinhar ou forjar. Caminho descrito em `storage.py`.
>
> **Pendências de fundo que continuam valendo:** fechar o **alerta de secret
> scanning #1** (falso positivo, "Used in tests"); **sincronizar `empresa`**
> (verificar `git rev-list --count empresa/main..main` — estava 9 atrás em
> 2026-08-15, não reconferido em 2026-08-24). Testar a coleta automática contra
> um Ads Manager real segue **fora de escopo** por decisão do usuário — e agora
> é ainda mais remoto, com a extensão congelada. Lembrar do limite de **R$15**
> na key do Gemini, **compartilhada por toda a equipe**.
>
> **Decisões em aberto:** (a) nomear ou não um "Cenário de leilão caro" para
> quando o CPM acima do teto bloqueia a escala vertical (arrastada desde
> 2026-07-28); (b) o piso de **50 conversões/semana** do Cenário I faz quase toda
> campanha de anunciante pequeno sair como crítica, e o formulário manual não tem
> campo para ajustá-lo (só a importação por JSON tem).

## Sessão de 2026-08-15 — reunião de equipe (feedback de produto), sem mudança de código

Sessão só de conversa durante uma reunião do usuário com a equipe — nenhum arquivo do produto alterado. **Achado de ambiente:** este checkout (`~/Desktop/NexGestor-main/NexGestor-main`) não tem `.git` — é outro unzip sem histórico, mesmo padrão já visto e corrigido em 2026-07-24 numa cópia diferente. Esta atualização do `CLAUDE.md` fica só local aqui até alguém reconectar esta pasta ao remoto (`git init` + `git remote add origin` + comparar contra `origin/main`) ou copiar este trecho pra dentro da cópia que já é um repo de verdade.

**Ponto 1 — navegação pouco intuitiva (feedback da equipe).** A equipe relatou que, ao abrir a extensão, não fica claro como navegar — um cliente sem bagagem de marketing/métricas não tiraria bom proveito sozinho. Referência trazida pelo usuário: um dashboard da Reportei (`app.reportei.com`), citado como exemplo de clareza — cada métrica/seção comunicando bem o que é, sem exigir conhecimento prévio do usuário. **Ainda não é uma decisão de design, só o problema registrado** — nenhuma tela foi redesenhada nesta sessão. Vale revisitar junto do item 3 do roadmap (frontend) quando o usuário quiser priorizar isso.

**Ponto 2 — confirmação de que login + dado por conta é prioridade.** O usuário reafirmou a intenção de implementar autenticação e separar os dados por conta/tenant desde já. **Isto já era exatamente o item 7 do roadmap** ("persistência em base COMPARTILHADA, sem login e sem dono... antes de abrir para usuários reais isto PRECISA virar dado por pessoa"), com o caminho de migração já esboçado em `app/service/storage.py` (coluna `dono`, filtro no listar/remover). Não houve mudança de escopo, só confirmação de prioridade — nenhum código de auth foi escrito nesta sessão.

**Exploração de conectores/integrações do workspace (não é sobre o produto NexGestor, é sobre o ambiente de trabalho do Claude Code):**
- **GitHub**: tentado conector MCP remoto oficial (`claude mcp add --transport http github https://api.githubcopilot.com/mcp/`) — falhou no login (`Incompatible auth server: does not support dynamic client registration`), removido de novo. **Não é necessário de qualquer forma**: `gh` CLI já está instalado e autenticado nesta máquina (conta `GustavoECocchi`, escopos `gist`/`read:org`/`repo`), cobrindo tudo que o conector ofereceria (issues, PRs, repo). Confirmar isso primeiro da próxima vez, antes de tentar configurar o conector.
- **ClickUp** (gestão de tarefas da equipe), **notas pessoais** (só do usuário, ideia: pasta local de markdown editável direto pelo Claude Code, sem precisar de conector) — discutidos, **nada implementado ainda**. Comunicação da equipe é WhatsApp — sem caminho de integração viável (exigiria WhatsApp Business API com app aprovado; não é configuração simples, não vale perseguir sem prioridade clara do produto).

**Próximo passo sugerido para a próxima sessão:** confirmar se o outro dev já rodou o deploy novo no VPS (item 9 do roadmap, pendente desde 2026-08-14) antes de puxar qualquer coisa nova — isso segue sendo o bloqueio mais antigo em aberto.

## Sessão de 2026-08-24 — isolamento por dono, pivô extensão→dashboard

Sessão longa. **5 commits locais na `main`** (`dc572e3` reconectar git,
`a99eaf8` isolamento por dono, `ad9cf61` corrigir teto global, `5b58ca1`
backend pronto pro dashboard, `5ff89fd` criar dashboard) — **nenhum
push feito ainda**, fica como decisão em aberto pro usuário confirmar (ver
"PRÓXIMO PASSO" acima). Suite backend: **1393 → 1402/1402**. Suite dashboard
(portada da extensão): **283/283**.

### Achado de ambiente, de novo

Este checkout (`~/Documents/NexGestor-main/NexGestor-main`) também não tinha
`.git` — terceira vez que isso acontece neste projeto (2026-07-24, 2026-08-15,
agora). Reconectado ao `origin` (`GustavoECocchi/NexGestor`, branch `main`):
`git init` + `git remote add` + `git fetch` + comparação de conteúdo (não só
histórico) confirmou que o working tree já batia com `origin/main` quase 100%
(só diffs pequenos de `CLAUDE.md` e um arquivo com permissão de execução
diferente) — então o primeiro commit local reconstituiu esse estado como
ponto de partida, sem tentar rebasear ou forçar nada.

### Contexto trazido pelo usuário no início da sessão

A equipe **já começou a testar** sabendo que a persistência não estava no ar.
Três decisões tomadas nessa conversa, não implementadas ainda quando foram
ditas:

1. **Persistência por perfil** — identificador simples (sem senha), não login
   completo. Confirmado explicitamente quando perguntado: "identificador
   simples por enquanto", não "login real".
2. **Tornar a ferramenta mais intuitiva** — reforça o Ponto 1 da sessão de
   2026-08-15 (feedback da equipe sobre navegação, referência Reportei). Não
   endereçado nesta sessão além do layout novo do dashboard.
3. **Pivô extensão → dashboard**, motivado por feedback de um professor do
   usuário (fora da equipe): abandonar o modelo de side panel de extensão por
   um dashboard web full-screen. Confirmado como decisão tomada, não em
   avaliação — com a ressalva explícita do usuário de **manter uma cópia
   funcional da extensão** (resolvido com a tag git, não com pasta duplicada).

### Isolamento por dono (backend)

Implementado o passo 1+2 do caminho de migração que o próprio `storage.py` já
esboçava desde 14/08: coluna `dono`, header `X-Nex-Dono` obrigatório nas três
rotas de `/api/v1/campaigns*`, normalizado trim+lowercase. Sem senha — "separação
de visão, não segurança", documentado como tal em três lugares (`storage.py`,
`campanhas_salvas.py`, `config.py`).

**Autorrevisão pegou uma regressão real antes de reportar como pronto**: ao
tornar o teto de 500 campanhas "por dono", isso *removeu* a proteção original
(a API é pública e sem autenticação — sem teto global, bastaria inventar
identificadores novos para conseguir espaço infinito no disco do VPS). Corrigido
com dois tetos (por dono + global) e confirmado por teste de mutação (desliguei
o teto global, o teste que deveria pegar isso falhou como esperado, religuei,
voltou a passar). Também corrigido um `except sqlite3.OperationalError: pass`
largo demais no `ALTER TABLE` de migração, que engoliria "disco cheio" ou "base
somente leitura" junto com o "duplicate column" que era o alvo real.

Verificado ao vivo com servidor real (não só a suíte): Ana e Bruno com headers
diferentes só veem as próprias campanhas; Bruno tentando apagar campanha da Ana
recebe 404 e nada é apagado; sem o header, 422 em todas as rotas.

### Dashboard novo — construído por dois agentes em paralelo, revisado antes de commitar

A pedido explícito do usuário, dois subagentes tipo `fork` rodaram em
paralelo: um portando o frontend, outro preparando o backend. **Nenhum dos
dois commitou** — revisão e commit ficaram comigo, depois de conferir (não só
aceitar o relatório):

- `diff` arquivo-a-arquivo confirmou que `types.ts`, todo `lib/` (exceto
  `api.ts`, que precisava do header novo) e a maioria dos componentes foram
  portados **idênticos**, byte a byte — só `NewCampaignModal.tsx` tem diff real
  (remoção do modo "Coletar automático", que dependia de `chrome.tabs`).
- Rodei a suíte (283/283) e o build (`npm run build`) eu mesmo, não confiei só
  no relatório do agente.
- **Testei ao vivo no navegador de verdade** e **encontrei um bug na minha
  própria demonstração** (não no código): copiei `.env.example` sem ajustar a
  porta do backend, o dashboard chamava `localhost:8000` enquanto o backend
  rodava em `8123` — 503 silencioso. Corrigido ajustando o `.env` local (não
  commitado) e reiniciando o `vite dev`; depois disso, confirmei visualmente
  o isolamento por dono funcionando dentro do dashboard (não só via `curl`).

Peça nova relevante: `lib/dono.ts` + `DonoGate.tsx` — tela de identificação
antes de entrar no dashboard, guardando o valor em `localStorage` (`nex:dono`)
com a mesma normalização do backend (trim+lowercase), e `DashboardShell.tsx`
para o layout full-screen (sidebar) no lugar do side panel.

### O que fica pendente, sem maquiagem

Nada disso está deployado em lugar nenhum — nem o backend novo no VPS (que
está numa versão ainda mais antiga que antes), nem o dashboard (só roda local
via `vite dev`, sem hospedagem definida). A extensão congelada vai parar de
sincronizar campanhas assim que/se o backend novo subir pro VPS (ela não manda
`X-Nex-Dono`) — achado nesta sessão, não corrigido de propósito (extensão está
congelada). Ver "PRÓXIMO PASSO" no topo do roadmap para os passos concretos.

## Sessão de 2026-08-25 — ajuda em linguagem simples no formulário "Criar campanha"

Sessão curta, só frontend do dashboard. **1 commit na `main`**, com push pro
`origin` (único remote deste checkout — sem `empresa` aqui). Suítes ao final:
**backend 1402/1402** (reconferido, nenhuma mudança), **dashboard 283/283**,
`tsc --noEmit` e `npm run build` limpos.

### Contexto

Reforça o Ponto 1 já registrado em 2026-08-15 ("navegação pouco intuitiva",
referência Reportei) e o motivo do pivô de 2026-08-24 (feedback do professor,
referência Fuse React). Entrevista estruturada (skill `grillme`, instalada
nesta sessão como plugin pessoal — `~/.claude/skills`, fora do repo) isolou o
achado até um ponto concreto, verificado no dashboard rodando local
(`npm run dev`) e lendo `NewCampaignModal.tsx`: o formulário manual de "Criar
nova campanha" tem ~20 campos (`CPM, CPC, CPA, CPL, ROAS, Hook rate, Hold
rate, CTR link, CTR todos...`) **sem nenhuma explicação** — confirmado por
inspeção visual e do código, não achismo.

PRD escrito e commitado como registro (`docs/prds/fase-1-ajuda-formulario-campanha.md`
— movido de `PRD-ajuda-formulario-campanha.md`, na raiz, numa reorganização
posterior da documentação), com escopo deliberadamente pequeno: só ajuda textual nos campos do modo
**manual** — nada de mudar quais campos existem, validação, ou o contrato com
o backend. Aba "Importar arquivo" (pede JSON cru), o bug de `/` recarregar na
última campanha vista em vez da home, e onboarding geral ficam fora, registrados
para PRs futuros.

### Implementado

- `components/FieldHint.tsx` — ícone `?` (reaproveita `IconInfo`, já existia
  em `Icons.tsx` sem nenhum uso) com tooltip acessível: abre no hover **e** no
  foco por teclado (`onFocus`/`onBlur`, não só mouse), `aria-describedby`
  ligando o botão ao texto. Posicionado com `position:fixed` calculado via
  `getBoundingClientRect` (não `absolute`) porque o `.modal` tem
  `overflow-y:auto` — um tooltip `absolute` cortaria nas bordas para campos
  perto da borda do modal; confirmado ao vivo que o do campo "CTR todos"
  (coluna direita) não corta.
- CSS novo em `style.css` só com tokens de tema já existentes (`--panel-2`,
  `--line-2`, `--txt-2`, `--shadow`...) — nenhuma cor nova hardcoded, então
  herda a validação de contraste WCAG já feita em 2026-07-25 sem trabalho
  extra.
- `NewCampaignModal.tsx`: `Field` ganhou campo `hint`; os ~20 campos de
  Entrega & custo, Criativo & cliques e Metas (incluindo o select tri-estado
  "Aprendizado limitado") ganharam texto de ajuda em português simples, sem
  jargão. Identificação (Nome/Objetivo/Plataforma) ficou sem ícone de
  propósito — já são autoexplicativos.

### Validado

`tsc --noEmit`, `npm run build` e as duas suítes (backend sem mudança,
dashboard 283/283) rodaram limpos. **Testado ao vivo no navegador** (tema
escuro): tooltip do CPM, do CTR todos (coluna direita — confirma o
`position:fixed` funcionando) e do "Aprendizado limitado" (texto mais longo,
quebra linha corretamente). **Não confirmado nesta sessão**: aparência no
tema claro (tentativa de alternar o tema no navegador não foi verificada por
screenshot antes do fim da sessão) e navegação por Tab ao vivo (só a lógica
`onFocus`/`onBlur` foi lida no código, não clicada/tabulada de fato). Ambos
ficam como primeira coisa a olhar se algo parecer errado visualmente.

### Pendente

- Confirmar tema claro e navegação por teclado ao vivo (ver acima).
- Tudo do §5 do PRD (Importar arquivo, bug do reload, onboarding geral)
  continua sem dono definido — não é bloqueante, só não esquecer.

## Sessão de 2026-08-26 (parte 2) — documentação de PRD organizada em `docs/`, reconciliada com trabalho concorrente, e fase-2 auditada

Sessão só de documentação — **nenhum arquivo de aplicação foi alterado**.
3 commits na `main`, todos com push pro `origin`: `2c821ea` (reorganização),
`3b7754e` (merge), `05290ce` (reconciliação do PRD retroativo). Suite backend
reconferida ao final: **1457 passed, 0 failed** (sem mudança — só sanity
check, nenhum código tocado). Frontend não tocado, sem suíte rodada.

### Reorganização (pedida via `prompt-organizar-prds.md`, arquivo fora do
repo, uma pasta acima)

`PRD.md` (só "Índice de API", criado numa sessão anterior sem `git add`),
`PRD-ajuda-formulario-campanha.md` e `CONTRATO_API_FRONTEND.md` (esse último
estava em `backend/backend-nexgestor-main/`, não na raiz como o prompt
supunha) foram movidos para uma hierarquia nova, com `git mv` preservando
histórico onde havia histórico a preservar:

```
docs/
  PRD.md
  CONTRATO_API_FRONTEND.md
  prds/
    fase-1-ajuda-formulario-campanha.md
    fase-2-dashboard-intuitividade.md   (novo PRD desta sessão, ver abaixo)
```

`docs/PRD.md` ganhou uma seção **"Fases"** no topo (fase 1 implementada, fase
2 planejada, link relativo pra cada uma). Todas as referências cruzadas nos
três documentos, no `CLAUDE.md` e no `README.md` foram atualizadas para os
caminhos novos — **exceto comentários em código de aplicação**
(`NewCampaignModal.tsx` da extensão e do dashboard continuam citando
`CONTRATO_API_FRONTEND.md` sem caminho; fora de escopo por instrução
explícita do prompt).

**Novo PRD escrito nesta sessão**: `docs/prds/fase-2-dashboard-intuitividade.md`
— navegação/intuitividade do dashboard (Central de Ajuda, "Nova campanha" e
Copiloto mais visíveis na navegação, não só dentro de cada tela). Rascunho,
**nada implementado**. Inclui inventário de telas (MVP vs. Depois), critérios
de aceite, contrato de API (conclusão: nenhuma rota nova — todos os fluxos já
existem), escopo de arquivos por PR, e uma seção "Sobreposições a resolver"
comparando com a fase-1 (pedida explicitamente para registro, sem decidir
qual abordagem vence).

### Trabalho concorrente descoberto no push — merge real, sem force

O primeiro `git push` foi rejeitado: **outra sessão (Claude Opus 5) tinha
empurrado `d63ee20` em paralelo** — o selo de estado da IA no header
(`AIStatusBadge.tsx` + `GET /api/v1/status`, ver seção acima) **e** um
`PRD.md` retroativo de 501 linhas criado direto na raiz, sem saber da
reorganização em andamento aqui. Isso teria recriado o problema que a
reorganização existia pra resolver (dois `PRD.md` competindo).

Resolvido com `git fetch` + `git merge` normal (sem `--force`, sem reescrever
histórico) e, **com confirmação explícita do usuário** sobre como
reconciliar, movi o `PRD.md` retroativo deles para `docs/PRD.md`,
incorporando ali dentro a seção "Fases" e o índice de API (como coluna nova
"O que faz" na tabela "Contrato HTTP completo" que eles já tinham, que
inclui a rota `/status` nova) — uma fonte só, em vez de duas. Corrigidas as
referências a `PRD.md`/`CONTRATO_API_FRONTEND.md` que o commit deles deixou
apontando pra raiz, em `CLAUDE.md` (5 pontos) e no PRD irmão `fase-2`.

### Auditoria da fase-2 (pedida via `docs/rascunho_prompt.md`, que apareceu
no disco por conta própria — provavelmente outra sessão ou o usuário direto
no editor)

Revisão só de leitura (**nada implementado, arquivo não alterado**,
respeitando a instrução explícita do prompt) de `fase-2-dashboard-intuitividade.md`
contra o código real, incluindo o que `d63ee20` trouxe (que a fase-2 não
conhecia por ter sido escrita antes). Achados entregues como análise na
conversa, não commitados em lugar nenhum:

- **AC2 e AC3** (critérios de "checar análise" e "excluir") descrevem
  comportamento que já existe hoje em vez de definir o que muda, e usam
  termos subjetivos ("óbvio", "sem termo técnico") — reescritos na análise
  pra virarem testáveis.
- **AC4 ("como usar a IA") ficou ambíguo depois de `d63ee20`**: o
  `AIStatusBadge` no header já mostra "IA on/off/falhando" em toda tela, mas
  isso é sobre a **camada** (servidor tem IA ligada?), não sobre o
  **Copiloto** (`Copilot.tsx`, o assistente que responde perguntas sobre a
  campanha, ainda enterrado no fim do scroll do detalhe). A fase-2 não
  distingue os dois — risco de a equipe achar o AC4 "já resolvido" olhando
  só a badge nova.
- **"Vira tela" (a opção de "Nova campanha" deixar de ser modal, §4 da
  fase-2) provavelmente não cabe no orçamento de 2 PRs** que a hierarquia de
  fases exige: `NewCampaignModal.tsx` usa `onClick` de overlay pra fechar
  (padrão de modal), incompatível com layout de tela cheia — viraria reescrita
  de verdade, não troca de prop.
- Overlap adicional em `style.css` não coberto pela seção "Sobreposições a
  resolver" da própria fase-2 (que só compara com a fase-1): `d63ee20`
  também adicionou ~30 linhas na mesma região de "controles do header" que o
  PR B da fase-2 pretende tocar.

### Pendente desta sessão

- **`docs/rascunho_prompt.md` segue no repo, não commitado nem removido** —
  é um prompt de tarefa, não um artefato de produto; decisão do usuário se
  deve virar um registro permanente em `docs/` ou ser descartado depois de
  lido.
- A auditoria da fase-2 não alterou o PRD (por instrução) — se o time
  aceitar os achados, `fase-2-dashboard-intuitividade.md` ainda precisa ser
  editado à parte.
