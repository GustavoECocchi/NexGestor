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

## Status atual / Roadmap

1. ✅ Backend: engine de diagnóstico + API validados. Suite **109/109** (105 + 4 testes de regressão de 2026-07-26), sem falhas ambientais e **sem nenhuma chamada de rede** (ver `conftest.py`). Três bugs do engine corrigidos em 2026-07-26 — todos alcançáveis por payload válido, achados por fuzz.
2. ✅ **Integração Gemini validada ao vivo, de novo** — modelo `gemini-flash-lite-latest`. A key da sessão de 2026-07-14 foi revogada (2026-07-16); **key nova configurada e testada ponta a ponta em 2026-07-25** (`ai_insights` preenchido de verdade numa chamada real). Ver "Sessão de 2026-07-25 (parte 2)" — inclui o incidente de duas keys expostas no chat e a regra de segredos fixada a partir dele.
3. ✅ Frontend: UI completa; modo manual já plugado no backend real (ver correção de estado acima). **Polimento de UX feito em 2026-07-24 parte 2** (copiloto responsivo, persistência de checkmarks, atalho de busca visível, estado vazio, acessibilidade de teclado). Mock reduzido a **2 campanhas de exemplo** (marcadas visualmente como "exemplo") ao lado das campanhas vivas. **Identidade visual e tema fechados em 2026-07-25**: logo integrada, tiles do Resumo com peso visual, **tema claro/escuro com toggle persistido**, contraste do claro conferido contra WCAG, `prefers-reduced-motion` respeitado. **Testes automatizados adicionados na parte 3** (Vitest + Testing Library, 99/99, cobrindo adapter, sanitizador XSS, store, tema, roteamento do copiloto e parsing de importação de JSON) — validado por type-check + build + suite de testes + verificação visual ao vivo nos dois temas; segue sem teste contra o Ads Manager real (só isso ainda depende de conta real). **Correções de 2026-07-26**: hover dos cards (que nunca havia funcionado — cascade de animação), quadrado azul no anel de score (colisão do nome de classe `ring` com o utilitário do Tailwind), `.collect-btn` no tema e acima do AA, e 30 linhas de CSS morto removidas.
4. 🟡 **Coleta automática — provisória (scraping via content script), aceitável só para o período de testes atual.** Funciona mecanicamente (mensageria + manifest validados), mas não foi testada contra um Ads Manager real. **Migração para Meta Marketing API (OAuth) adiada de propósito** (ver "Decisão de escopo" acima) — não é bloqueante para o período de testes, só para o lançamento real.
5. ✅ **Key exposta (2026-07-14) revogada e substituída** — confirmado 401 em 2026-07-16; key nova gerada, configurada e validada ao vivo em 2026-07-25 (ver item 2). **Duas keys adicionais foram expostas no chat durante essa própria configuração** (causa: orientação errada minha sobre o prefixo `!`) — tratadas como queimadas; regra de "segredo só por editor externo" fixada no CLAUDE.md.
6. ✅ Testes isolados do `.env` de dev (`_env_file=None` / fixture `autouse` mockando `is_ai_available`) — ver sessão de 2026-07-16 parte 3. PR #1 mergeado na `main`. **Completado em 2026-07-26**: aquele isolamento cobria só `TestIADesativada`; os testes de endpoint ainda faziam 6 chamadas reais ao Gemini por execução. O `conftest.py` agora desliga a IA em toda a suíte (provado com sockets bloqueados: 0 tentativas de rede).
7. ⬜ **Sem persistência server-side** — o backend é *stateless* (sem banco, sem contas); tudo que "sobrevive" mora no `localStorage` do navegador (`nex:live`, `nex:doneActions`, `nex:screen`, `nex:theme`). O usuário decidiu **não** tratar isso agora — coerente com o período de testes, mas vira bloqueante antes de lançar pra usuários reais (limpar o navegador = perder tudo, sem multi-dispositivo). **Sobe de prioridade agora que a equipe vai testar**: cada pessoa terá seus dados presos ao próprio navegador, sem nada compartilhado.
8. ✅ **Publicado no repositório da empresa** (2026-07-26) — `NexGoldCompany/NexGestor` (privado), 24 commits de histórico completo, com README de onboarding na raiz. Histórico auditado antes: sem segredos reais. `origin` (pessoal) e `empresa` sincronizados. O usuário tem `push` mas **não é admin** lá.

> **Ação pendente antes de qualquer outra coisa:** fechar o **alerta de secret scanning #1** no repo pessoal como falso positivo ("Used in tests"), e checar se existe alerta equivalente no repo da empresa (precisa de admin). Nenhuma chave real vazou — isso foi verificado comparando a chave do `.env` contra todos os blobs de todos os commits — mas alerta de segurança aberto e sem explicação assusta a equipe à toa. Ver "Alerta de secret scanning do GitHub" acima.
>
> **Próximo passo sugerido para a próxima sessão:** o projeto acabou de ser aberto para a equipe, então a próxima sessão provavelmente é **reativa ao feedback deles** — vale começar perguntando se alguém conseguiu rodar seguindo o README (é a primeira vez que ele existe e nunca foi testado por outra pessoa). Fora isso, a frente técnica prioritária continua sendo **testar a coleta automática contra um Ads Manager real** assim que houver conta: é a peça mais frágil e a única nunca validada de verdade. Persistência (item 7) subiu de prioridade agora que há múltiplos testadores. Dívida técnica registrada: **o padrão `if valor` tratando `0` como ausente** ainda existe em vários detectores do `service.py` — converter para `is not None`. Ao usar a IA, lembrar do limite de R$15 na key e ser econômico com chamadas reais.
