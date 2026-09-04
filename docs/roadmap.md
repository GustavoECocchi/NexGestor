## Status atual / Roadmap

Histórico detalhado de cada sessão: `docs/sessions/AAAA-MM-DD.md`. Os itens
abaixo descrevem só o estado atual de cada frente — não a sequência de como
se chegou lá.

1. ✅ **Backend: engine de diagnóstico + API validados.** Suite **1496/1496**, sem falhas ambientais e sem nenhuma chamada de rede (`conftest.py`). Auditoria determinística de 36.000 casos em 2026-09-01: 30.000 campanhas válidas e 1.000 operações de persistência passaram; entre 5.000 entradas inválidas, 500 booleanos em campos inteiros foram aceitos indevidamente (`true` vira `1`) — **correção e teste permanente ainda pendentes** (reconfirmado em 2026-09-04, reproduzido de novo: `Metrics(impressions=True).impressions == 1`). 15 cenários de diagnóstico (incluindo L a O), confiança por cobertura + amostra e suporte a Meta, Google, TikTok e LinkedIn. Histórico: `docs/sessions/2026-07-26.md`, `2026-07-28.md`, `2026-07-29.md`, `2026-08-25.md`, `2026-09-01.md`, `2026-09-03.md`.
2. ✅ **Integração Gemini validada ao vivo** — modelo `gemini-flash-lite-latest`, key ativa configurada e testada ponta a ponta (`ai_insights` preenchido de verdade numa chamada real). Prompt tem um Princípio 0 explícito (não inventar quando faltam dados), todos os targets do engine chegam à IA, e há aviso para não recomendar recurso exclusivo de uma plataforma quando ela não é Meta. Histórico: `docs/sessions/2026-07-25.md`, `2026-07-28.md`.
3. ✅ **CONGELADA em 2026-08-24, REMOVIDA do repositório em 2026-09-01 — decisão do usuário de migrar extensão → dashboard web (ver item 10).** `frontend/nexgestor-extension` não existe mais neste checkout; zero dependência funcional confirmada antes da remoção (nada em backend, dashboard, scripts ou deploy importava ou buildava a partir dela). Recuperável pela tag git local `extensao-estavel-2026-08` (última cópia funcional, suite 167/167). Documentação consolidada: `docs/historico/nexgestor-extensao.md`. Histórico de sessões: `docs/sessions/2026-07-24.md` a `2026-08-14.md`, `2026-09-01.md`.
4. 🧊 **Adiada junto com o congelamento da extensão (item 3) — sem equivalente no dashboard ainda.** O dashboard só tem os modos manual e importação de arquivo (sem "coletar automático", que dependia de `chrome.tabs`). A coleta automática por scraping era provisória e nunca foi testada contra um Ads Manager real; migração para Meta Marketing API (OAuth) segue adiada por decisão explícita do usuário — não é prioridade enquanto durar o período de testes. Histórico: `docs/sessions/2026-07-16.md`, `2026-07-28.md`.
5. ✅ **Key exposta em 2026-07-14 foi revogada e substituída.** Confirmado 401 na key antiga; key nova validada ao vivo (ver item 2). Duas keys adicionais expostas no chat durante essa configuração foram tratadas como queimadas; regra de "segredo só por editor externo, nunca colado no chat" fixada. Histórico: `docs/sessions/2026-07-16.md`, `2026-07-25.md`.
6. ✅ **Suíte de testes isolada do `.env` real e da IA.** `conftest.py` desliga a IA por padrão em toda a suíte — confirmado com sockets bloqueados (0 tentativas de rede). Histórico: `docs/sessions/2026-07-16.md`, `2026-07-26.md`.
7. ✅ **Persistência isolada por `dono`, ainda sem login de verdade.** Toda rota de `/api/v1/campaigns*` exige o header `X-Nex-Dono` (string simples, sem senha, normalizada trim+lowercase). Dois tetos de campanhas: por dono (500) e global (5000). Autenticação de verdade (senha/sessão) é o passo 3, já esboçado em `storage.py`, ainda fora de escopo. Ainda não implantado em produção — o VPS está numa versão anterior (ver item 9). Histórico: `docs/sessions/2026-08-24.md`.
8. 🟡 **Publicado no repositório da empresa** (`NexGoldCompany/NexGestor`, privado), com README de onboarding na raiz. `origin` (pessoal) e `empresa` estavam sincronizados no mesmo commit em 2026-08-15. **Não reverificável neste checkout** (2026-09-04): só o remote `origin` está configurado aqui, sem `empresa` — quem tiver o remote configurado precisa rodar `git rev-list --count empresa/main..main` (esperado 0) antes de considerar isto validado de novo, especialmente depois do push de 2026-09-04 (commits `9aee39f`, `63f9645`) para `origin/main`. Histórico: `docs/sessions/2026-07-26.md`, `2026-08-15.md`.
9. 🟡 **Distribuição para a equipe — deploy no ar, mas DESATUALIZADO e com a IA desligada.** `https://gestor.nexgold.com.br` responde, atrás do nginx do próprio VPS, HTTPS válido até 11/11/2026, limite de requisições ativo (60r/m + burst 10). Roda código anterior a 2026-08-14 — **sem persistência nem lixeira** (`GET /api/v1/campaigns` → 404) — e a **IA está desligada** (`GEMINI_API_KEY` vazia no servidor; a chave local é válida). Passo a passo para atualizar e ligar a IA: `docs/PRD.md` seção 5. Correção pronta e testada para o 429 sair sem CORS (`deploy/nginx-gestor.conf.exemplo`) ainda não foi aplicada no servidor. Histórico: `docs/sessions/2026-08-10.md`, `2026-08-12.md`, `2026-08-14.md`, `2026-08-26.md`.
10. 🆕 **Dashboard web é o único frontend ativo, desde 2026-08-24** (`frontend/nexgestor-dashboard`, Vite+React+TS+Tailwind), substituindo a extensão (item 3, removida do repo em 2026-09-01). **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`. Reaproveita a lógica original da extensão por cópia (`types.ts`, `lib/`, componentes) mais três peças novas: `lib/dono.ts` + `DonoGate.tsx` (identificação sem senha antes de entrar) e `DashboardShell.tsx` (sidebar + layout full-screen). Suite permanente **445/445**; auditoria adicional em 2026-09-01 passou 7.100/7.100 variações do dashboard e 2.000/2.000 contratos com respostas reais do engine. Faltas conhecidas: sem hospedagem definida, sidebar com poucos itens de navegação, sem tela de erro dedicada para backend fora do ar, autenticação de verdade pendente (mesmo caminho do item 7). Histórico: `docs/sessions/2026-08-24.md`, `2026-08-25.md`, `2026-08-26.md`, `2026-08-27.md`, `2026-08-31.md`, `2026-09-01.md`, `2026-09-03.md`, `2026-09-04.md`.
11. ✅ **`docs/PRD.md`** — documento de requisitos retroativo, gerado lendo o código real (produto, decisões de arquitetura com o porquê, regras de negócio, stack, cobertura de testes, segurança, passo a passo do deploy pendente). ⚠️ Foi escrito sobre um checkout anterior ao pivô para o dashboard, então descreve a extensão como o frontend atual em vários trechos — tem aviso no topo mapeando o que ler com ressalva; **revisão completa contra o dashboard segue pendente**. Histórico: `docs/sessions/2026-08-26.md`.
12. ✅ **Selo de estado da IA no dashboard** — `GET /api/v1/status` no backend + selo de 4 estados no header (`IA on` / `IA off` / `IA falhando` / `IA ?`). O estado `falhando` existe porque `/status` só prova que a IA está configurada, não que a chave autentica; detectado por observação do desfecho de cada análise, sem custo de chamada extra. Histórico: `docs/sessions/2026-08-26.md`.
13. ✅ **Fase-2 implementada** (`docs/prds/fase-2-dashboard-intuitividade.md`) — navegação da sidebar, Central de Ajuda e atalho "Perguntar ao Copiloto" no detalhe. Os 2 PRs do orçamento da fase foram consumidos. Pendente para fechar a fase: teste manual com alguém do time simulando cliente leigo (§8 do PRD) — nenhum teste automatizado mede isso. Histórico: `docs/sessions/2026-08-27.md`.
14. ✅ **§11 da fase-2 — cards de métrica mostram o veredito completo do engine.** `tileText()` (antes `tileNote()`) preserva o texto inteiro em português que o engine já escreve, não só o valor da meta. O achado extra do pedido original (meta em branco em 6 métricas) não foi implementado à parte — ficou parcialmente coberto pela reescrita do `MetricFeed` (item 16). Histórico: `docs/sessions/2026-08-31.md`.
15. 🟡 **`fase-2b-benchmark-mercado.md` — só especificação, nada implementado.** Benchmark de mercado via Gemini com grounding de busca, para métricas sem meta definida. Achados que já corrigem a premissa do documento: o campo `niche` já existe no schema (precisa virar enum fechado e obrigatório); benchmark público real só existe por CTR/CPA/CPL/CPM segmentado por nicho — não por ROAS nem Hook Rate; o uso atual de `response_schema` no Gemini é tipicamente incompatível com grounding na mesma chamada. Histórico: `docs/sessions/2026-08-27.md`.
16. ✅ **Feed de métricas do detalhe reescrito (`MetricFeed.tsx`)** — implementado e testado. Dos 3 achados da autorrevisão de 31/08, todos resolvidos: **🔴 corrigido em 2026-09-01** (Copiloto lia `tile[3]` esperando o número do limite de fadiga — formato antigo — e ficava redundante consigo mesmo, perdendo o número real; corrigido com campo próprio `CampaignVM.maxFrequencyFatigue`, confirmado por teste de mutação); **🟠 CPL sem meta corrigido em 2026-09-04** (a nota "você não definiu uma meta para isso" some no `ContextGrid`; `t[4] === "ausente"` agora dispara a nota também ali, sem virar seção de diagnóstico completa); **🟡 `package-lock.json`** — investigado em 2026-09-04 e confirmado já resolvido desde o próprio commit que fechou a sessão de 31/08 (`16d9514`, 96 deleções) — este item do roadmap ficou desatualizado por mais de uma semana citando um problema que já não existia; corrigido agora. Histórico: `docs/sessions/2026-08-31.md`, `2026-09-04.md`.
17. 🟠 **Fase-5 (vocabulário/linguagem) — PR1-PR4 e PR7 concluídos, PR5 e a validação viva do PR6 pendentes** (`docs/prds/fase-5-vocabulario-linguagem.md`). PR1/PR2/PR3 (31/08). **PR7 (2026-09-04)**: renomeou "Conversão LP"→"Conversão na página" e o título do Cenário K ("Otimização de Retargeting Ineficiente"→"Reimpacto de Público Ineficiente") em todo o produto — motor de scoring, catálogo público, prompt da IA, dashboard; achou de quebra e corrigiu a mesma divergência catálogo/análise no Cenário D. **PR4 (2026-09-04)**: Copiloto passou a explicar a sigla (CPA/ROAS/CTR Link/frequência) na mesma frase em que aparece. **PR6**: o vocabulário do prompt da IA já ficou sincronizado com o motor como efeito colateral do PR7 (testado: `_METRIC_LABELS` == `_METRIC_EVAL_CONFIG` por métrica) — falta só a validação com chamada real ao Gemini que o critério de aceite do PRD pede; não feita por não gastar da chave paga compartilhada sem autorização explícita. **PR5 (templates de nota do motor em `service.py`, maior risco) não iniciado.** Histórico: `docs/sessions/2026-08-31.md`, `2026-09-04.md`.
18. 🟠 **Auditoria de rede frontend↔backend↔nginx↔Gemini (2026-09-04)** — 13 achados (A1-A13). **Corrigidos e testados os 7 de maior severidade** (A1: build de produção falha sem `VITE_API_BASE` em vez de embutir `localhost:8000`; A2: headers CORS do rate-limit do nginx incluem `X-Nex-Dono`/`DELETE`; A3: `salvarCampanha` distingue falha permanente de transitória; A4: `client_id` torna o salvamento idempotente via UPSERT atômico no SQLite; A5: client do Gemini configura `http_options.timeout` — sem isso o SDK mandava `timeout=None` ao httpx, sem limite nenhum, e a chamada seguia consumindo a cota paga depois do `asyncio.wait_for` desistir; A6: `/docs`/`/redoc`/`/openapi.json` só existem com `DEBUG=True`; A7: CORS aceita qualquer porta de `localhost` em dev — bug reproduzido ao vivo na própria sessão). Revisão adicional achou e corrigiu 1 bug real na correção do A3 (507/base cheia tratado como permanente, travando a campanha mesmo depois de alguém liberar espaço — agora `syncAviso`, que informa sem bloquear a retentativa) e 3 lacunas menores. Cada achado tem teste de regressão confirmado por mutação. **A8-A13 (P3) deliberadamente não corrigidos** — são decisão de produto, não bugs. **Pendências residuais**: a correção do nginx (A2) não foi validada contra um nginx real (ambiente sem o binário — o bloco original, de 14/08, tinha sido); `deploy/README.md` não documenta que o build de produção do dashboard exige `VITE_API_BASE` (achado durante a auditoria, não corrigido). Commitado e enviado a `origin/main` em 2026-09-04 (`9aee39f`, `63f9645`). Histórico: `docs/sessions/2026-09-04.md`.

> **Ação pendente antes de qualquer outra coisa:** fechar o **alerta de secret scanning #1** no repo pessoal como falso positivo ("Used in tests"), e checar se existe alerta equivalente no repo da empresa (precisa de admin). Nenhuma chave real vazou — verificado comparando a chave do `.env` contra todos os blobs de todos os commits — mas um alerta de segurança aberto sem explicação assusta a equipe à toa. Detalhe em `docs/sessions/2026-07-26.md`. **Ainda não resolvido** (reconfirmado em 2026-09-04).
>
> **PRÓXIMO PASSO — retomar exatamente aqui (atualizado 2026-09-04):**
>
> 1. ~~Item 16 (bugs do `MetricFeed`)~~ — **os 3 achados fechados** (🔴 em
>    2026-09-01, 🟠 CPL e 🟡 `package-lock.json` em 2026-09-04). Ver item 16.
> 2. ~~PR7 e PR4 da fase-5~~ — **feitos em 2026-09-04.** Ver item 17.
> 3. **Continuar a fase-5 (item 17)**: falta a validação viva do PR6 (1-2
>    chamadas reais ao Gemini, dentro do limite de custo — quem tiver
>    autorizado a gastar da chave compartilhada) e o PR5 completo (templates
>    de nota do motor em `service.py`, maior risco, por último).
> 4. ~~Auditoria de rede~~ — **feita e corrigida em 2026-09-04** (item 18).
>    Duas pendências residuais saíram dela: validar a correção do nginx (A2)
>    contra um servidor real (só foi validada por inspeção — sem `nginx`
>    disponível no ambiente que corrigiu) e documentar em
>    `deploy/README.md` que o build de produção do dashboard exige
>    `VITE_API_BASE` definido (`npm run build` falha sem isso desde o A1,
>    mas ninguém escreveu isso no guia de deploy).
> 5. **Corrigir o defeito de validação booleana** (item 1): Pydantic aceita
>    `true`/`false` em campo numérico e converte pra `1`/`0` em silêncio.
>    Reconfirmado em 2026-09-04, ainda sem correção nem teste permanente.
>
> --- (pendências mais antigas, ainda válidas, mas de prioridade menor que as 5 acima) ---
>
> O **código** (backend com isolamento por dono + dashboard novo + fase-5 +
> auditoria de rede) está **pronto, testado e no `origin/main`** desde
> 2026-09-04 (`git push` feito, commits `9aee39f` e `63f9645`) — mas **nada
> disso está implantado em lugar nenhum ainda**. O VPS continua rodando o
> backend de antes de 2026-08-14; está mais atrasado do que nunca em relação
> ao que existe no repositório.
>
> 1. **Decidir hospedagem do dashboard.** Hoje só roda local (`npm run dev`).
>    Não há Vercel/Netlify/VPS configurado para ele. O backend (VPS Hostinger)
>    já existe e pode servir os dois — falta decidir se o dashboard vai para o
>    mesmo servidor (nginx servindo os arquivos estáticos do `vite build`) ou
>    outro lugar. **A opção "mesmo servidor" já tem o slot pronto**: a raiz do
>    domínio (`gestor.nexgold.com.br/`) hoje serve o último build da extensão
>    (confirmado ao vivo em 2026-09-01, mesmos arquivos de `extensao-pronta/`,
>    que já não existe mais no repo) — não é mistério nem acidente a
>    investigar, é só o slot que o dashboard vai ocupar quando for implantado,
>    ainda com o inquilino anterior. Trocar os arquivos estáticos servidos ali
>    por um `npm run build` do dashboard resolve as duas coisas de uma vez —
>    **lembrando que esse build precisa de `VITE_API_BASE` definido** (item 4
>    acima), senão falha de propósito.
> 2. **Atualizar o backend no VPS** — continua sendo o bloqueio mais antigo em
>    aberto (arrastado desde 2026-08-14, agora com mais duas rodadas de
>    mudanças em cima: fase-5 e auditoria de rede). Comando: `git pull &&
>    docker compose up -d --build` na pasta `deploy/`. Primeira coisa a checar
>    numa próxima sessão: `curl https://gestor.nexgold.com.br/api/v1/campaigns
>    -H "X-Nex-Dono: teste"` — 200 significa que já subiu (e com o header, não
>    só a rota antiga); 404/501 significa que não.
> 3. **Aplicar no nginx** o bloco `error_page 429` + `location @limite`
>    corrigido (`deploy/nginx-gestor.conf.exemplo`, achado A2 da auditoria de
>    rede — agora inclui `X-Nex-Dono` e `DELETE`, mas **não foi revalidado
>    contra nginx real**, diferente do bloco original de 14/08) — ainda
>    pendente, ainda não bloqueante.
>
> **Antes de abrir para usuários reais (não é para o período de testes):**
> autenticação de verdade (senha/sessão) — hoje é só um identificador que
> qualquer um pode adivinhar ou forjar. Caminho descrito em `storage.py`.
>
> **Pendências de fundo que continuam valendo:** fechar o **alerta de secret
> scanning #1** (falso positivo, "Used in tests"); **sincronizar `empresa`**
> — verificar `git rev-list --count empresa/main..main` a partir de um
> checkout que tenha esse remote configurado (ver item 8, não verificável
> daqui). Testar a coleta automática contra um Ads Manager real segue **fora
> de escopo** por decisão do usuário. Lembrar do limite de **R$15** na key do
> Gemini, **compartilhada por toda a equipe**.
>
> **Decisões em aberto, ainda sem resposta:** (a) nomear ou não um "Cenário de
> leilão caro" para quando o CPM acima do teto bloqueia a escala vertical
> (oferecido ao usuário em 2026-07-28); (b) o piso de **50 conversões/semana**
> do Cenário I faz quase toda campanha de anunciante pequeno sair como
> crítica, e o formulário manual não tem campo para ajustá-lo (só a
> importação por JSON tem).
