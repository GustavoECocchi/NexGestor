# PRD — Dashboard: telas dedicadas e navegação intuitiva

Status: **rascunho para revisão do time antes de implementar.** PRD pequeno,
gerado a partir de `prompt.md` desta sessão.

## 1. Contexto

O NexGestor era uma extensão Chrome (Plasmo/React, side panel) e migrou para
um dashboard web full-screen (`frontend/nexgestor-dashboard`, decisão de
2026-08-24 — professor do usuário sinalizou que o side panel limitava a
experiência). A migração recriou as telas da extensão (Home, detalhe de
campanha, modais) com mais espaço, mas **não redesenhou a navegação em torno
desse espaço novo** — a sidebar (`DashboardShell.tsx`) hoje tem um único item
("Campanhas"), e criar/comparar/excluir/usar a IA continuam encaixados do
mesmo jeito que cabiam num popup de extensão.

Isso reforça um problema já registrado duas vezes antes de este PRD existir:
- **2026-08-15** (reunião de equipe): "não fica claro como navegar" para quem
  não tem bagagem de marketing — referência trazida pelo usuário: o dashboard
  da Reportei (`app.reportei.com`), citado como exemplo de clareza.
- **2026-08-25**: a mesma dor, isolada até o formulário de criação de
  campanha (`fase-1-ajuda-formulario-campanha.md`) — ~20 campos sem explicação.
  Esse PR já foi implementado e resolve a intuitividade **dentro** do
  formulário; este PRD trata da intuitividade **entre** telas (como alguém
  chega até o formulário, até a análise, até a exclusão, até a IA).

## 2. Objetivo

Redesenhar a navegação do dashboard para que alguém **sem conhecimento de
marketing** saiba, sem explicação prévia, como:

1. criar uma campanha,
2. checar a análise de uma campanha,
3. excluir uma campanha,
4. usar a IA da ferramenta.

Aproveitando o espaço de tela cheia que a extensão não tinha.

## 3. Referência visual

`fuse-react-nextjs-demo.fusetheme.com/dashboards/project` — mesma referência
já usada na criação do dashboard em 2026-08-24 (sidebar + layout full-screen).
Usar como inspiração de organização/hierarquia visual, não copiar.

## 4. Escopo — inventário de telas

O que existe hoje no dashboard (todas herdadas 1:1 da extensão, só com mais
espaço) e o que passa a existir por já haver espaço para isso. "MVP" marca o
que este PR pequeno cobre; "Depois" fica registrado, não implementado agora.

| Tela / elemento | Hoje | Proposta | MVP? |
|---|---|---|---|
| **Central de Ajuda** | Não existe. | Tela nova, acessível pela sidebar, respondendo em português simples às 4 perguntas do §5 — texto estático, sem depender do engine. | ✅ Sim — ataca a raiz do problema relatado pelo time. |
| **Nova campanha** | `NewCampaignModal`, um modal sobre a Home. | Mesmo formulário (já com tooltips de ajuda, PRD anterior), promovido a item próprio e visível na sidebar, não só um botão dentro da Home. Continua modal ou vira tela — decisão de implementação, não muda o fluxo. | ✅ Sim — é a pergunta nº1 do time ("como criar campanha"). |
| **Presença da IA (Copiloto)** | `Copilot.tsx` embutido no fim do scroll do detalhe da campanha — só quem rola até lá encontra. | Mesma funcionalidade (heurística local, sem chamada de rede — ver §6), com um indicador visível mais cedo na tela de detalhe (ex.: aba ou atalho no topo) em vez de só no rodapé. | ✅ Sim — é a pergunta nº4 do time ("como usar a IA"). |
| **Excluir campanha** | Lixeira no hover do card, confirmação "Apagar para todo o time?" (já implementado, 2026-08-14). | Mantém como está — já é direto e a frase já evita jargão. Só ganha uma menção explícita na Central de Ajuda. | ✅ Sim (só documentação, zero código). |
| **Comparar campanhas** | `CompareModal`, botão na Home. | Permanece modal — não é um dos 4 fluxos citados pelo time, baixo risco de confundir quem já está na Home. | 🕗 Depois. |
| **Perfil / identificação (dono)** | Rodapé da sidebar ("Trocar identificação"). | Tela própria de configurações, se o produto crescer (ex.: preferências, tema). | 🕗 Depois — não bloqueia nenhum dos 4 critérios. |
| **Dashboard geral com gráficos** (tendência entre campanhas ao longo do tempo) | Não existe — `Summary.tsx` soma só o estado atual, o backend não guarda séries históricas por campanha. | Tela agregada com gráficos de evolução. | 🕗 Depois — **exige lógica de negócio nova no backend** (persistir snapshots ao longo do tempo), que este PRD explicitamente não cobre (ver §7). Registrar como próxima decisão de produto, não como código deste PR. |

## 5. Critérios de intuitividade (aceite)

Feedback do time: quem não tem conhecimento de marketing não sabe navegar na
ferramenta. Critério de aceite = uma pessoa do time, simulando um cliente
leigo, consegue responder corretamente às 4 perguntas abaixo **sem
explicação prévia**, só olhando o dashboard (mesmo método de validação já
usado no PRD anterior, §6 dele).

- **AC1 — Como criar uma campanha?** Existe um item rotulado sem jargão
  ("Nova campanha") sempre visível — na sidebar e na Home — levando ao
  formulário em no máximo 1 clique, a partir de qualquer tela.
- **AC2 — Como checar a análise?** A lista "Campanhas ativas" da Home é o
  ponto único e óbvio: cada card já comunica o veredito (status colorido +
  frase de ação, reorganização de 2026-08-25 parte 2) sem exigir abrir o
  detalhe; abrir o card leva ao diagnóstico completo. Depois de criar uma
  campanha, o usuário já cai automaticamente no detalhe dela (comportamento
  atual de `App.tsx`, mantido).
- **AC3 — Como excluir?** A ação de apagar está sempre acessível a partir do
  card (hover, ícone de lixeira) e a confirmação usa linguagem direta
  ("Apagar para todo o time?"), sem termo técnico — comportamento atual,
  reforçado por uma linha na Central de Ajuda.
- **AC4 — Como usar a IA?** Existe um rótulo/indicador visível de "IA" antes
  de o usuário precisar rolar até o fim do detalhe da campanha — hoje o
  Copiloto só aparece depois de todas as outras seções.
- **AC5 — Central de Ajuda descobrível.** A partir da sidebar, em no máximo 1
  clique, existe uma tela que responde às 4 perguntas acima em texto simples,
  sem depender de já saber o vocabulário do produto (CPA, ROAS etc. — esses
  já têm ajuda própria no formulário, PRD anterior).

## 6. Contrato de API

**Nenhuma rota nova ou alterada.** Todos os 4 fluxos do §5 já são cobertos
pelas rotas existentes (índice completo em `../PRD.md`; contrato de payload
completo em `../CONTRATO_API_FRONTEND.md`) — a mudança aqui é só de
reorganização/apresentação no frontend, nada no backend muda.

| Critério | Rota reaproveitada | Autenticação | Parâmetros de entrada | Formato de resposta | Códigos de erro |
|---|---|---|---|---|---|
| AC1 — criar (analisar) | `POST /api/v1/campaign/analyze` | Nenhuma | JSON `AnalyzeInput` (campaign/metrics/targets) | JSON `CampaignAnalysisResponse` (cenários, score, `ai_insights`) | 400 dado inválido no domínio; 422 schema; 500 erro interno |
| AC1 — criar (salvar) | `POST /api/v1/campaigns` | Header `X-Nex-Dono` obrigatório | JSON `{payload, id?}` | JSON `{id}` | 413 payload grande demais; 422 dono ausente/inválido; 501 persistência desligada; 507 limite de campanhas atingido; 500 |
| AC2 — checar análise (listar) | `GET /api/v1/campaigns` | Header `X-Nex-Dono` obrigatório | — | JSON `{campanhas: [{id, payload, criado_em, atualizado_em}]}` | 422 dono ausente/inválido; 501 persistência desligada; 500 |
| AC3 — excluir | `DELETE /api/v1/campaigns/{campanha_id}` | Header `X-Nex-Dono` obrigatório | Path param `campanha_id` (int) | JSON `{removida: id}` | 404 já não existia (o cliente trata como sucesso — outra pessoa já apagou); 422 dono inválido; 501 persistência desligada; 500 |
| AC4 — IA (diagnóstico complementado) | `POST /api/v1/campaign/analyze` (mesma rota de AC1) | Nenhuma | (mesmo acima) | campo `ai_insights` dentro da mesma resposta | (mesmo acima) |
| AC4 — IA (Copiloto/chat) | **Nenhuma rota — 100% local no frontend.** `Copilot.tsx`/`buildReply` roteia por palavra-chave sobre os dados já carregados da campanha; não faz chamada de rede. | — | — | — | — |
| AC5 — Central de Ajuda | Nenhuma — texto estático no frontend. `GET /api/v1/campaign/scenarios` existe e poderia alimentar essa tela no futuro, mas não é necessário para o texto simples pedido aqui. | — | — | — | — |

## 7. Fora de escopo

- **Nenhuma lógica de negócio nova.** Apenas reorganização e melhoria da
  apresentação das funcionalidades já existentes — nenhum cenário do engine,
  regra de score ou campo de schema muda.
- **Dashboard geral com gráficos agregados** (§4) — precisaria de persistência
  de séries históricas no backend, que não existe hoje; fica como decisão de
  produto futura, não deste PR.
- **Autenticação de verdade** (senha/sessão) — segue como item 7 do roadmap em
  `../../CLAUDE.md`, não faz parte de "intuitividade de navegação".
- **Comparar campanhas como tela própria** e **tela de perfil/configurações**
  — registrados em §4 como "Depois", não bloqueiam nenhum dos 4 critérios de
  aceite.
- Tudo que já está registrado como fora de escopo em
  `fase-1-ajuda-formulario-campanha.md` §5 (aba "Importar arquivo" com JSON
  cru, bug do reload caindo na última campanha vista).

## 8. Como validar

- `tsc --noEmit` + `npm run build` limpos — mudança é só presentational/rotas
  de navegação no frontend, nenhuma rota de backend é tocada.
- Suite do dashboard (hoje 288/288) sem regressão.
- Teste manual com alguém do time simulando cliente leigo, navegando sem
  explicação prévia, respondendo às 4 perguntas do §5 (mesmo método usado no
  PRD anterior) — comparar a reação antes/depois.

## 9. Riscos

- **Risco:** promover itens novos na sidebar (Ajuda, Nova campanha) pode
  competir visualmente com "Campanhas", o único item que existe hoje.
  **Mitigação:** manter a hierarquia visual da referência Fuse (item ativo
  destacado, ícone + rótulo curto), revisar antes de fechar o PR.
- **Risco:** Central de Ajuda ficar desatualizada se o engine ganhar cenários
  novos (como os L–O de 2026-07-28) sem que o texto de ajuda acompanhe.
  **Mitigação:** escrever o texto em termos de fluxo ("como eu crio",
  "como eu apago"), não de cenário do engine — evita acoplamento com o que já
  tem 15 cenários e cresce.
- **Risco:** escopo crescer além de "PRD pequeno" ao implementar.
  **Mitigação:** só os 3 itens marcados ✅ MVP em §4 entram neste PR; o resto
  fica registrado em §4/§7 para decisão futura do usuário.

## 10. Escopo de arquivos

Baseado no código atual (`frontend/nexgestor-dashboard/src`). Só os 3 itens
✅ MVP de §4 geram código; o resto de §4 fica fora deste PRD. Cabem em até 2
PRs (limite da hierarquia de fases):

**PR A — Central de Ajuda + navegação (AC1, AC5, parte do AC3)**
- `frontend/nexgestor-dashboard/src/components/DashboardShell.tsx` — sidebar
  ganha os itens "Nova campanha" e "Ajuda" (hoje só tem "Campanhas").
- `frontend/nexgestor-dashboard/src/components/App.tsx` — o tipo `Screen`
  (hoje `{name:"home"} | {name:"detail", id}`) precisa de uma variante nova
  para a tela de Ajuda; e/ou o tipo `Modal` (hoje
  `"none" | "new" | "compare"`) muda se "Nova campanha" deixar de ser modal.
- **Arquivo novo**: `frontend/nexgestor-dashboard/src/components/HelpCenter.tsx`
  (nome ilustrativo) — conteúdo estático respondendo às 4 perguntas de §5.
- `frontend/nexgestor-dashboard/src/components/Icons.tsx` — possível ícone
  novo para o item "Ajuda" da sidebar (nenhum ícone atual de
  pergunta/ajuda-geral no arquivo, só `IconInfo`, já usado pela fase-1 dentro
  do formulário).
- `frontend/nexgestor-dashboard/src/style.css` — estilos da sidebar com mais
  itens e da tela nova.
- **Só se a decisão de implementação for "virar tela"** (§4, linha "Nova
  campanha" — "continua modal ou vira tela"):
  `frontend/nexgestor-dashboard/src/components/NewCampaignModal.tsx` — mesmo
  arquivo que a fase-1 já modificou (ver §"Sobreposições a resolver").

**PR B — Presença da IA mais cedo no detalhe (AC4)**
- `frontend/nexgestor-dashboard/src/components/CampaignDetail.tsx` —
  reposicionar o indicador/atalho para a seção do Copiloto, hoje só no fim do
  scroll (linha 107, após Sugestões e Observações da IA).
- `frontend/nexgestor-dashboard/src/components/Copilot.tsx` — possível âncora
  (`id`) ou prop para o novo indicador rolar/focar até o widget.
- `frontend/nexgestor-dashboard/src/style.css` — estilo do novo indicador.

Nenhum arquivo de `backend/backend-nexgestor-main` é tocado (consistente com
§6 — nenhuma rota nova ou alterada).

## Referência

Gerado a partir de `prompt.md` desta sessão. Contexto:
`../../CLAUDE.md` — Ponto 1 da sessão de 2026-08-15 (feedback do time,
referência Reportei) e sessão de 2026-08-24 (pivô extensão→dashboard,
referência Fuse React). Índice de rotas em `../PRD.md` (§4 "Contrato HTTP
completo (Índice de API)"). PRD irmão: `fase-1-ajuda-formulario-campanha.md`
(intuitividade dentro do formulário de criação, já implementado).

## Sobreposições a resolver

Comparação entre `fase-1-ajuda-formulario-campanha.md` (implementada,
2026-08-25) e este PRD (fase-2, planejado) — pedida explicitamente para
registro, **sem decidir qual abordagem vence, sem alterar o escopo de
nenhum dos dois PRDs**.

Ambas respondem ao mesmo feedback do time ("quem não tem base de marketing
não sabe navegar na ferramenta"), mas em camadas diferentes: fase-1 atua no
nível de **campo** (tooltip explicando o que cada métrica significa, dentro
do formulário de criação); fase-2 atua no nível de **navegação** (como
alguém encontra o caminho para criar, checar, excluir, usar a IA).

**Onde as soluções se sobrepõem:**
- Ambas nasceram do mesmo ponto de dor ("não fica claro como navegar") e
  ambas usam o mesmo padrão de solução — texto de apoio contextual, sem
  jargão, revelado sob demanda (tooltip no campo vs. tela de Ajuda) — em vez
  de redesenhar o fluxo em si.
- AC5 deste PRD ("Central de Ajuda descobrível") planeja responder "como eu
  crio uma campanha" em texto simples. Sem cuidado editorial, essa resposta
  pode acabar re-explicando o significado de campos individuais (CPA, ROAS,
  Hook rate...) que a fase-1 já explica via `FieldHint` — duas fontes da
  mesma explicação, com risco real de divergirem com o tempo (uma sendo
  atualizada, a outra não). Este PRD já tenta evitar isso em §5 AC5 e §9
  ("escrever em termos de fluxo, não de campo"), mas a fronteira exata do
  que cada um cobre não foi validada com o time.

**Onde a fase-2 tocaria arquivos que a fase-1 já modificou:**
- `frontend/nexgestor-dashboard/src/components/NewCampaignModal.tsx` — a
  fase-1 adicionou o campo `hint` em `Field` e o texto de ajuda dos ~20
  campos (commit `f4914be`). Se a fase-2 decidir "virar tela" em vez de
  "continuar modal" (§4/§10 PR A), a casca do componente (como ele é aberto,
  o que recebe como props — hoje `onClose`) muda; o conteúdo que a fase-1
  escreveu (campos, `hint`, agrupamento) não precisa mudar.
- `frontend/nexgestor-dashboard/src/style.css` — as duas fases adicionam CSS
  no mesmo arquivo (fase-1: estilos do tooltip `FieldHint`; fase-2: sidebar
  com mais itens, tela de Ajuda, indicador de IA). Não é conflito funcional
  — é aditivo — mas é o mesmo arquivo, então há chance real de conflito de
  merge se os PRs andarem em paralelo.
- `frontend/nexgestor-dashboard/src/components/Icons.tsx` — a fase-1 só
  **consumiu** `IconInfo` (já existia, sem uso antes dela); não editou o
  arquivo. A fase-2 (PR A) pode ser a primeira a de fato adicionar um ícone
  novo ali. Não é sobreposição de conteúdo, só o mesmo arquivo compartilhado
  por ambas as features.

**O que precisaria ser removido ou reescrito se as duas forem implementadas:**
- Nada do conteúdo da fase-1 (os 20 textos de campo, o componente
  `FieldHint`) precisaria ser removido — são complementares, não
  concorrentes, enquanto a Central de Ajuda ficar no nível de fluxo.
- Se a Central de Ajuda (fase-2) acabar duplicando explicação de campo por
  campo (o risco descrito acima se materializar), o texto duplicado teria
  que ser removido de um dos dois lugares para não haver duas respostas
  diferentes para "o que é CPA" — decisão de conteúdo, não de código, fica
  para quem revisar as duas fases juntas.
- Se "Nova campanha" virar tela (não modal) na fase-2, a integração atual em
  `App.tsx` (`modal === "new"` renderizando `<NewCampaignModal onClose=... />`
  por cima da Home) precisaria ser reescrita para um roteamento por `Screen`
  — isso é código da fase-2, mas o componente que ela reescreve por dentro é
  o mesmo que a fase-1 entregou.
