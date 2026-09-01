## Status atual / Roadmap

Histórico detalhado de cada sessão: `docs/sessions/AAAA-MM-DD.md`. Os itens
abaixo descrevem só o estado atual de cada frente — não a sequência de como
se chegou lá.

1. ✅ **Backend: engine de diagnóstico + API validados.** Suite **1450/1450**, sem falhas ambientais e sem nenhuma chamada de rede (`conftest.py`). 15 cenários de diagnóstico (incluindo os 4 mais recentes — L a O — cobrindo zero conversão, amostra insuficiente, vazamento clique→LP e ROAS baixo com custo ok), confiança do score combinando cobertura de métricas e volume de amostra, plataformas suportadas: Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads. Histórico: `docs/sessions/2026-07-26.md`, `2026-07-28.md`, `2026-07-29.md`, `2026-08-25.md`.
2. ✅ **Integração Gemini validada ao vivo** — modelo `gemini-flash-lite-latest`, key ativa configurada e testada ponta a ponta (`ai_insights` preenchido de verdade numa chamada real). Prompt tem um Princípio 0 explícito (não inventar quando faltam dados), todos os targets do engine chegam à IA, e há aviso para não recomendar recurso exclusivo de uma plataforma quando ela não é Meta. Histórico: `docs/sessions/2026-07-25.md`, `2026-07-28.md`.
3. 🧊 **CONGELADA em 2026-08-24 — decisão do usuário de migrar extensão → dashboard web (ver item 10).** `frontend/nexgestor-extension` não recebe mais commits; tag git local `extensao-estavel-2026-08` marca a cópia funcional de referência. Estado em que ficou: UI completa (tema claro/escuro, acessibilidade de teclado, atalhos, persistência de campanhas em `localStorage`), suite 167/167, sem teste contra o Ads Manager real. Histórico completo: `docs/sessions/2026-07-24.md` a `2026-08-14.md`.
4. 🧊 **Também congelada junto com a extensão (item 3) — sem equivalente no dashboard ainda.** O dashboard só tem os modos manual e importação de arquivo (sem "coletar automático", que dependia de `chrome.tabs`). A coleta automática por scraping era provisória e nunca foi testada contra um Ads Manager real; migração para Meta Marketing API (OAuth) segue adiada por decisão explícita do usuário — não é prioridade enquanto durar o período de testes. Histórico: `docs/sessions/2026-07-16.md`, `2026-07-28.md`.
5. ✅ **Key exposta em 2026-07-14 foi revogada e substituída.** Confirmado 401 na key antiga; key nova validada ao vivo (ver item 2). Duas keys adicionais expostas no chat durante essa configuração foram tratadas como queimadas; regra de "segredo só por editor externo, nunca colado no chat" fixada. Histórico: `docs/sessions/2026-07-16.md`, `2026-07-25.md`.
6. ✅ **Suíte de testes isolada do `.env` real e da IA.** `conftest.py` desliga a IA por padrão em toda a suíte — confirmado com sockets bloqueados (0 tentativas de rede). Histórico: `docs/sessions/2026-07-16.md`, `2026-07-26.md`.
7. ✅ **Persistência isolada por `dono`, ainda sem login de verdade.** Toda rota de `/api/v1/campaigns*` exige o header `X-Nex-Dono` (string simples, sem senha, normalizada trim+lowercase). Dois tetos de campanhas: por dono (500) e global (5000). Autenticação de verdade (senha/sessão) é o passo 3, já esboçado em `storage.py`, ainda fora de escopo. Ainda não implantado em produção — o VPS está numa versão anterior (ver item 9). Histórico: `docs/sessions/2026-08-24.md`.
8. ✅ **Publicado no repositório da empresa** (`NexGoldCompany/NexGestor`, privado), com README de onboarding na raiz. `origin` (pessoal) e `empresa` estão sincronizados no mesmo commit desde 2026-08-15 (conferir com `git rev-list --count empresa/main..main` — deve ser 0). Histórico: `docs/sessions/2026-07-26.md`, `2026-08-15.md`.
9. 🟡 **Distribuição para a equipe — deploy no ar, mas DESATUALIZADO e com a IA desligada.** `https://gestor.nexgold.com.br` responde, atrás do nginx do próprio VPS, HTTPS válido até 11/11/2026, limite de requisições ativo (60r/m + burst 10). Roda código anterior a 2026-08-14 — **sem persistência nem lixeira** (`GET /api/v1/campaigns` → 404) — e a **IA está desligada** (`GEMINI_API_KEY` vazia no servidor; a chave local é válida). Passo a passo para atualizar e ligar a IA: `docs/PRD.md` seção 5. Correção pronta e testada para o 429 sair sem CORS (`deploy/nginx-gestor.conf.exemplo`) ainda não foi aplicada no servidor. Histórico: `docs/sessions/2026-08-10.md`, `2026-08-12.md`, `2026-08-14.md`, `2026-08-26.md`.
10. 🆕 **Dashboard web é o alvo de desenvolvimento ativo desde 2026-08-24** (`frontend/nexgestor-dashboard`, Vite+React+TS+Tailwind), substituindo a extensão (item 3). **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`. Reaproveita a lógica da extensão por cópia (`types.ts`, `lib/`, componentes) mais três peças novas: `lib/dono.ts` + `DonoGate.tsx` (identificação sem senha antes de entrar) e `DashboardShell.tsx` (sidebar + layout full-screen). Suite 380/380. Faltas conhecidas: sem hospedagem definida, sidebar com poucos itens de navegação, sem tela de erro dedicada para backend fora do ar, autenticação de verdade pendente (mesmo caminho do item 7). Histórico: `docs/sessions/2026-08-24.md`, `2026-08-25.md`, `2026-08-26.md`, `2026-08-27.md`, `2026-08-31.md`.
11. ✅ **`docs/PRD.md`** — documento de requisitos retroativo, gerado lendo o código real (produto, decisões de arquitetura com o porquê, regras de negócio, stack, cobertura de testes, segurança, passo a passo do deploy pendente). ⚠️ Foi escrito sobre um checkout anterior ao pivô para o dashboard, então descreve a extensão como o frontend atual em vários trechos — tem aviso no topo mapeando o que ler com ressalva; **revisão completa contra o dashboard segue pendente**. Histórico: `docs/sessions/2026-08-26.md`.
12. ✅ **Selo de estado da IA no dashboard** — `GET /api/v1/status` no backend + selo de 4 estados no header (`IA on` / `IA off` / `IA falhando` / `IA ?`). O estado `falhando` existe porque `/status` só prova que a IA está configurada, não que a chave autentica; detectado por observação do desfecho de cada análise, sem custo de chamada extra. Histórico: `docs/sessions/2026-08-26.md`.
13. ✅ **Fase-2 implementada** (`docs/prds/fase-2-dashboard-intuitividade.md`) — navegação da sidebar, Central de Ajuda e atalho "Perguntar ao Copiloto" no detalhe. Os 2 PRs do orçamento da fase foram consumidos. Pendente para fechar a fase: teste manual com alguém do time simulando cliente leigo (§8 do PRD) — nenhum teste automatizado mede isso. Histórico: `docs/sessions/2026-08-27.md`.
14. ✅ **§11 da fase-2 — cards de métrica mostram o veredito completo do engine.** `tileText()` (antes `tileNote()`) preserva o texto inteiro em português que o engine já escreve, não só o valor da meta. O achado extra do pedido original (meta em branco em 6 métricas) não foi implementado à parte — ficou parcialmente coberto pela reescrita do `MetricFeed` (item 16). Histórico: `docs/sessions/2026-08-31.md`.
15. 🟡 **`fase-2b-benchmark-mercado.md` — só especificação, nada implementado.** Benchmark de mercado via Gemini com grounding de busca, para métricas sem meta definida. Achados que já corrigem a premissa do documento: o campo `niche` já existe no schema (precisa virar enum fechado e obrigatório); benchmark público real só existe por CTR/CPA/CPL/CPM segmentado por nicho — não por ROAS nem Hook Rate; o uso atual de `response_schema` no Gemini é tipicamente incompatível com grounding na mesma chamada. Histórico: `docs/sessions/2026-08-27.md`.
16. 🟠 **Feed de métricas do detalhe reescrito (`MetricFeed.tsx`)** — implementado e testado (suite 380/380), com **2 bugs reais conhecidos, ainda não corrigidos** (decisão explícita do usuário: primeira coisa da próxima sessão — ver bloco de pendências abaixo): 🔴 o Copiloto lê `tile[3]` no formato antigo e agora fica redundante, perdendo o número real do limite de fadiga; 🟠 CPL sem meta perde a nota "você não definiu uma meta para isso" porque cai numa seção (`ContextGrid`) que nunca mostra essa nota. 🟡 menor: `package-lock.json` ficou com ruído (`"libc"`) de um `npm install` incidental, não revertido. Histórico: `docs/sessions/2026-08-31.md`.
17. 🟡 **Fase-5 (vocabulário/linguagem) em andamento** (`docs/prds/fase-5-vocabulario-linguagem.md`) — PR1 (rótulo "Investimento"), PR2 (selo de confiança/cobertura) e PR3 (tooltips no `MetricFeed`) implementados e testados. PR4 (glossário no Copiloto), PR6 (prompt da IA), PR7 (renomear "Retargeting"/"Conversão LP") e PR5 (templates de texto do backend, maior risco, por último) ainda não iniciados — ordem combinada: PR7 → PR4 → PR6 → PR5. Histórico: `docs/sessions/2026-08-31.md`.

> **Ação pendente antes de qualquer outra coisa:** fechar o **alerta de secret scanning #1** no repo pessoal como falso positivo ("Used in tests"), e checar se existe alerta equivalente no repo da empresa (precisa de admin). Nenhuma chave real vazou — verificado comparando a chave do `.env` contra todos os blobs de todos os commits — mas um alerta de segurança aberto sem explicação assusta a equipe à toa. Detalhe em `docs/sessions/2026-07-26.md`. **Ainda não resolvido.**
>
> **Decisão em aberto, não resolvida:** nomear ou não um "Cenário de leilão caro" explícito para quando CPM acima do teto bloqueia a escala vertical (hoje só aparece como métrica CPM vermelha, sem card de causa raiz próprio). Oferecido ao usuário em 2026-07-28; sem resposta ainda.
>
> **PRÓXIMO PASSO — retomar exatamente aqui (definido em 2026-08-31, a pedido
> explícito do usuário para encerrar a sessão sem corrigir nada naquele
> momento — os itens abaixo são o primeiro trabalho da próxima sessão, antes
> de qualquer outra coisa, inclusive antes do bloco de deploy/VPS mais
> abaixo):**
>
> 1. **Corrigir o bug 🔴 do item 16**: `Copilot.tsx` (resposta de
>    frequência/fadiga) lê `tile[3]` esperando o número do limite de fadiga
>    configurado; hoje `tile[3]` contém o veredito em texto (mudança do item
>    14/`tileText()`). Ou o Copiloto passa a ler outra coisa, ou o adapter
>    volta a expor o número cru em algum campo separado — decidir qual dos
>    dois antes de mexer. Os testes de `Copilot.test.ts` usam fixtures do
>    formato ANTIGO e não vão pegar a regressão sozinhos — atualizar os
>    fixtures pro formato novo faz parte da correção, não só o código.
> 2. **Corrigir o bug 🟠 do item 16**: CPL sem meta perde a explicação "Você
>    não definiu uma meta para isso." porque cai no `ContextGrid`
>    (`MetricFeed.tsx`), que nunca renderiza `t[3]` por desenho. Decidir: mover
>    CPL pra uma seção que mostra nota, ou dar ao `ContextGrid` uma forma de
>    mostrar especificamente o estado "ausente" sem virar uma seção de
>    diagnóstico completa.
> 3. **Limpar o 🟡 do item 16**: reverter as 96 linhas de `"libc"` em
>    `package-lock.json` (rodar `npm install` de novo limpo, ou reverter só
>    esse arquivo e conferir que `npm install`/`npm test` continuam ok).
> 4. **Continuar a fase-5** (item 17) na ordem já combinada: PR7 → PR4 → PR6 →
>    PR5.
>
> --- (pendências mais antigas, ainda válidas, mas de prioridade menor que as 4 acima) ---
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
>    da extensão não manda `X-Nex-Dono` (achado em 2026-08-24, não corrigido de
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
> (verificar `git rev-list --count empresa/main..main`). Testar a coleta
> automática contra um Ads Manager real segue **fora de escopo** por decisão
> do usuário — e agora é ainda mais remoto, com a extensão congelada. Lembrar
> do limite de **R$15** na key do Gemini, **compartilhada por toda a equipe**.
>
> **Decisões em aberto:** (a) nomear ou não um "Cenário de leilão caro" para
> quando o CPM acima do teto bloqueia a escala vertical (arrastada desde
> 2026-07-28); (b) o piso de **50 conversões/semana** do Cenário I faz quase toda
> campanha de anunciante pequeno sair como crítica, e o formulário manual não tem
> campo para ajustá-lo (só a importação por JSON tem).
