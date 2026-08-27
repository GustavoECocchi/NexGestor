# PRD — Dashboard: telas dedicadas e navegação intuitiva

Status: **implementado em 2026-08-27** (PR A + PR B). PRD pequeno, gerado a
partir de `prompt.md` da sessão de 2026-08-26.

> **O que falta para dar a fase por concluída:** o §8 exige um teste manual com
> alguém do time simulando cliente leigo — os critérios do §5 são sobre uma
> pessoa achar o caminho sozinha, e isso nenhum teste automatizado mede. O que
> está garantido em código é que o caminho existe, custa um clique de qualquer
> tela, e que as distinções exigidas (Copiloto × selo de IA; ajuda de fluxo ×
> ajuda de campo) não se perdem numa edição futura
> (`src/test/components/navegacao.test.tsx`).

> **Revisado em 2026-08-27** contra o código real, incorporando os 4 achados da
> auditoria de 2026-08-26 (parte 2). O que mudou: AC2/AC3 reescritos para
> declararem o que muda em vez de descreverem o que já existe; AC4 passou a
> distinguir **camada de IA** de **Copiloto** (a distinção não existia quando
> este PRD foi escrito, antes do commit `d63ee20`); "Nova campanha vira tela"
> saiu do MVP; e a seção "Sobreposições a resolver" ganhou o overlap com
> `d63ee20` em `style.css`. Nenhum escopo novo foi adicionado.

> **§11 adicionada em 2026-08-27**, pedido novo do time via
> `docs/rascunho_prompt.md` — **apenas especificação, nada implementado**. O
> achado principal: os "cards de status de métrica" pedidos **já existem** como
> os tiles de "Métricas" no detalhe; o gap é que o frontend descarta o
> veredito em português que o engine já escreve (`lib/adapt.ts:76`). Nenhuma
> rota nova é necessária. A seção também registra uma tensão não resolvida com
> a hierarquia de fases — este PRD já usou os 2 PRs do orçamento (ver nota ao
> fim do §11).

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
| **Nova campanha (atalho na sidebar)** | `NewCampaignModal`, aberto só por um botão dentro da Home. | Mesmo formulário (já com tooltips de ajuda, fase-1), **continuando modal**, mas alcançável por um item próprio na sidebar, de qualquer tela. | ✅ Sim — é a pergunta nº1 do time ("como criar campanha"). |
| **Nova campanha vira tela cheia** (em vez de modal) | — | Trocar o modal por uma rota/`Screen` própria, aproveitando a largura do dashboard. | 🕗 Depois — **não cabe no orçamento de 2 PRs** desta fase; ver §10, nota "Por que 'virar tela' saiu do MVP". |
| **Presença do Copiloto** | `Copilot.tsx` embutido no **fim** do scroll do detalhe (`CampaignDetail.tsx:107`, depois de Diagnóstico, Ações prioritárias, Sugestões e Observações da IA) — só quem rola até lá encontra. | Mesma funcionalidade (heurística local, sem chamada de rede — ver §6), com um indicador visível mais cedo na tela de detalhe (ex.: aba ou atalho no topo) em vez de só no rodapé. | ✅ Sim — é a pergunta nº4 do time ("como usar a IA"). |
| **Selo de estado da camada de IA** | `AIStatusBadge.tsx` no header (`Header.tsx:19`), 4 estados (`IA on`/`off`/`falhando`/`?`) — entregue por `d63ee20`, **depois** deste PRD ser escrito. | Mantém como está. **Não confundir com o item acima**: o selo diz se o servidor tem IA ligada; o Copiloto é o assistente que responde perguntas sobre a campanha. Nenhum dos dois substitui o outro. | ➖ Já existe — nada a fazer, listado só para evitar que o AC4 seja lido como resolvido. |
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
- **AC2 — Como checar a análise?** *(O caminho já existe — card na Home leva ao
  detalhe. O que muda é só a descoberta desse caminho por quem nunca usou.)*
  **Verificável:** o testador leigo, partindo de qualquer tela, chega ao
  diagnóstico completo de uma campanha específica **em até 2 cliques e sem
  perguntar nada**, e consegue dizer em voz alta o que a ferramenta concluiu
  sobre aquela campanha. Se ele hesitar sobre onde clicar, o AC falhou — mesmo
  que o caminho exista.
- **AC3 — Como excluir?** *(Idem: a lixeira no hover do card e a confirmação
  "Apagar para todo o time?" já existem desde 2026-08-14.)*
  **Verificável:** (a) a Central de Ajuda tem uma entrada dedicada a apagar
  campanha, alcançável em ≤2 cliques a partir de qualquer tela; e (b) o
  testador leigo localiza a lixeira **sem** recorrer à Ajuda. Se ele só
  encontrar depois de ler a Ajuda, registra-se como falha do card (o hover
  esconde a ação), não como sucesso da Ajuda.
- **AC4 — Como usar a IA?** **Este AC é sobre o Copiloto, não sobre o selo de
  estado da IA no header.** O `AIStatusBadge` (`d63ee20`, entregue depois de
  este PRD ser escrito) responde a "o servidor tem IA ligada?" — pergunta
  diferente de "como eu converso com a IA sobre esta campanha?", que é o que o
  time perguntou.
  **Verificável:** na tela de detalhe, sem rolar a página (Copiloto hoje fica
  no fim, após 4 seções), o testador identifica onde fazer uma pergunta sobre a
  campanha, faz uma, e recebe resposta. **Não conta como aprovado** se ele
  apontar para o selo do header — isso indica justamente a confusão que este AC
  precisa evitar.
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
- **"Nova campanha" virar tela cheia** — sai do MVP por não caber em 2 PRs
  (§10, nota). O AC1 é satisfeito pelo atalho na sidebar, com o formulário
  continuando modal.
- **Mudar o selo de estado da IA** (`AIStatusBadge`, `d63ee20`) — ele responde
  a outra pergunta que não a do AC4 e fica como está.
- **Comparar campanhas como tela própria** e **tela de perfil/configurações**
  — registrados em §4 como "Depois", não bloqueiam nenhum dos 4 critérios de
  aceite.
- Tudo que já está registrado como fora de escopo em
  `fase-1-ajuda-formulario-campanha.md` §5 (aba "Importar arquivo" com JSON
  cru, bug do reload caindo na última campanha vista).

## 8. Como validar

- `tsc --noEmit` + `npm run build` limpos — mudança é só presentational/rotas
  de navegação no frontend, nenhuma rota de backend é tocada.
- Suite do dashboard (**331/331**, conferido em 27/08/2026 — o número 288 que
  este PRD trazia era anterior a `d63ee20`) sem regressão.
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
  para a tela de Ajuda. O tipo `Modal` (`"none" | "new" | "compare"`) **não
  muda** — "Nova campanha" continua modal nesta fase (ver nota abaixo).
- **Arquivo novo**: `frontend/nexgestor-dashboard/src/components/HelpCenter.tsx`
  (nome ilustrativo) — conteúdo estático respondendo às 4 perguntas de §5.
- `frontend/nexgestor-dashboard/src/components/Icons.tsx` — possível ícone
  novo para o item "Ajuda" da sidebar (nenhum ícone atual de
  pergunta/ajuda-geral no arquivo, só `IconInfo`, já usado pela fase-1 dentro
  do formulário).
- `frontend/nexgestor-dashboard/src/style.css` — estilos da sidebar com mais
  itens e da tela nova. **Atenção ao conflito com `d63ee20`** — ver
  §"Sobreposições a resolver".

`NewCampaignModal.tsx` **não é tocado por este PRD** — o formulário fica como
está (é o mesmo arquivo que a fase-1 modificou; ver §"Sobreposições a
resolver").

> **Por que "virar tela" saiu do MVP.** O modal fecha por `onClick` no overlay
> (`NewCampaignModal.tsx:367`), padrão que não sobrevive a um layout de tela
> cheia: sem overlay não há o que clicar, e o `onClose` que hoje é a única prop
> de saída (`:269`) precisaria virar navegação de `Screen`. Isso é reescrita da
> casca do componente, não troca de prop — trabalho que estoura o orçamento de
> 2 PRs que a hierarquia de fases impõe. Promover "Nova campanha" na sidebar
> **já satisfaz o AC1** (o critério é alcançar o formulário em 1 clique de
> qualquer tela, não que ele seja tela cheia). Se o time quiser a tela cheia,
> ela merece um PRD pequeno próprio numa fase seguinte.

**PR B — Presença da IA mais cedo no detalhe (AC4)**
- `frontend/nexgestor-dashboard/src/components/CampaignDetail.tsx` —
  reposicionar o indicador/atalho para a seção do Copiloto, hoje só no fim do
  scroll (linha 107, após Sugestões e Observações da IA).
- `frontend/nexgestor-dashboard/src/components/Copilot.tsx` — possível âncora
  (`id`) ou prop para o novo indicador rolar/focar até o widget.
- `frontend/nexgestor-dashboard/src/style.css` — estilo do novo indicador.

Nenhum arquivo de `backend/backend-nexgestor-main` é tocado (consistente com
§6 — nenhuma rota nova ou alterada).

## 11. Cards de status de métrica

Pedido novo do time (via `docs/rascunho_prompt.md`, chegado depois do PR A/PR B
já implementados): o usuário precisa enxergar rapidamente se a campanha está
indo bem ou mal em cada métrica, sem interpretar números crus. Restrição do
próprio pedido: comparação temporal (subiu/caiu desde a última medição) exige
histórico, que não existe (`POST /api/v1/campaigns` sobrescreve a campanha,
sem série temporal) — fica fora, os cards comparam a métrica atual contra a
**meta que o gestor já preenche no formulário**, nunca contra uma medição
anterior.

### Verificação obrigatória — o engine já faz isso

**Achado central: os cards já existem hoje**, como a seção "Métricas"
(`MetricTiles`, `CampaignDetail.tsx:98`) — e as seis métricas pedidas (CPA,
CPL, CPM, ROAS, CTR Link, Hook Rate) **já chegam prontas** em
`metric_evaluations` (`CONTRATO_API_FRONTEND.md` §"Response", campo
documentado com exemplo real). Cada entrada já traz `status` semafórico
(GREEN/YELLOW/RED), `value`, `score` e — o ponto que importa aqui — uma `note`
em português já comparando com a meta: `"Meta: >35%. ✗ Crítico — criativo
invisível no feed. Refazer abertura."` Não existe cálculo novo a propor; o
engine (`_evaluate_metrics`, `service.py:1101`) já avalia as seis métricas do
pedido uma a uma, cada uma contra o campo de `Targets` correspondente
(`max_cpa`, `max_cpl`, `max_cpm`, `min_roas`, `min_ctr_link`,
`min_hook_rate`).

**O gap real não é de dado, é de apresentação.** `lib/adapt.ts:76`
(`tileNote`) descarta a frase inteira que o engine escreveu, ficando só com o
prefixo "meta X":

```ts
function tileNote(note: string): string {
  return note
    .replace(/^Meta:\s*/i, "meta ")
    .split(/\.(?=\s|$)/)[0]   // corta ANTES do veredito em português
    .slice(0, 28)
}
```

Para a nota de exemplo acima, isso produz `"meta >35%"` — o "✗ Crítico —
criativo invisível no feed" (a parte que responde "está indo bem ou mal, em
português") nunca chega à tela. Confirmado ao vivo: os tiles hoje mostram só
`"meta 2,5x"` / `"meta R$ 70"`, nunca o veredito. A cor do tile (verde/
amarelo/vermelho) já comunica bem/mal — mas a pergunta "por quê" fica sem
resposta a não ser que a pessoa já saiba interpretar a meta sozinha, que é
exatamente o problema relatado.

**Conclusão da verificação:** nenhuma rota nova, nenhum campo de schema novo,
nenhum cálculo no frontend. O trabalho é parar de descartar o `note` que o
engine já escreve.

### 1. Métricas e meta correspondente

| Métrica | Campo de `Targets` | Já em `_METRIC_EVAL_CONFIG`? |
|---|---|---|
| CPA | `max_cpa` | Sim — nota customizada com delta % (`service.py:1118`) |
| CPL | `max_cpl` | Sim |
| CPM | `max_cpm` | Sim (bloco próprio, `service.py:1154`) |
| ROAS | `min_roas` | Sim |
| CTR Link | `min_ctr_link` | Sim |
| Hook Rate | `min_hook_rate` | Sim |

Todas as seis já têm campo próprio no formulário (`NewCampaignModal.tsx:132-140`).

### 2. Meta não preenchida (campo opcional) — as seis NÃO se comportam igual

Este é o ponto que o pedido supõe simétrico e não é. `num()`
(`NewCampaignModal.tsx:23`) devolve `undefined` para campo vazio, que some do
JSON — o backend recebe o campo ausente e aplica o default do `Targets`
(`schema.py:112`). Só que só **três das seis** têm default `None`:

- **CPA, CPL, ROAS** (`max_cpa`, `max_cpl`, `min_roas`): `Optional[float] =
  None`, **sem default numérico**. Meta em branco → `target is None` →
  `_evaluate_one` devolve `None` (`service.py:1083`) → a métrica **não entra em
  `metric_evaluations`** → **hoje o card simplesmente não aparece**, mesmo que
  o valor medido tenha sido enviado. Não existe hoje um estado visual "sem
  meta" — a métrica desaparece em silêncio.
- **CTR Link, Hook Rate, CPM** (`min_ctr_link`, `min_hook_rate`, `max_cpm`):
  têm default numérico (`1.5`, `35.0`, `50.0`). Meta em branco → o Pydantic
  preenche o default → a métrica **é avaliada mesmo assim**, contra um número
  que o gestor nunca confirmou. Hoje o card aparece colorido normalmente, sem
  nada dizendo que aquela meta não foi escolhida por ele.

Os dois problemas pedem tratamento diferente, e os dois são resolvíveis **sem
dado novo**, porque o frontend já tem `input.targets` no momento de montar os
tiles (`responseToVM(res, input)`, `adapt.ts:125`) — ele sabe, campo a campo,
o que o próprio formulário enviou:

- Para CPA/CPL/ROAS: se `input.metrics.{cpa,cpl,roas}` tem valor mas
  `input.targets.{max_cpa,max_cpl,min_roas}` é `null`/`undefined`, sintetizar
  um tile no estado **"sem meta"** (não vem de `metric_evaluations` — a
  métrica precisa ser montada à parte, com o valor cru e sem cor de
  julgamento).
- Para CTR Link/Hook Rate/CPM: mesma checagem em `input.targets`, mas a
  métrica **já vem avaliada** (o engine usou o default) — aqui o tile normal
  só ganha uma segunda linha/rótulo dizendo que a meta é do sistema, não do
  gestor. Consistente com o precedente já registrado no `CLAUDE.md` (revisão
  do prompt da IA, 2026-07-28 parte 2): "cada target é marcado como definido
  pelo gestor ou padrão do sistema" — lá foi feito para a IA não atribuir ao
  usuário uma meta que era default; aqui é o mesmo cuidado, para o card.

### 3. Estados visuais e texto

Tom: `fase-1-ajuda-formulario-campanha.md` (linguagem simples, sem jargão nos
textos de apoio — o nome da métrica em si continua com o termo técnico, que já
tem ajuda própria via `FieldHint`).

| Estado | Cor | Origem do texto | Exemplo |
|---|---|---|---|
| Dentro da meta | verde (`var(--green)`) | `note` do `MetricEvaluation`, sem o prefixo `Meta:`/símbolo | "Dentro da meta — criativo capta atenção no feed." |
| Abaixo/atenção | âmbar (`var(--amber)`) | idem | "Abaixo da meta — gancho fraco, público rola sem parar." |
| Crítico | vermelho (`var(--red)`) | idem | "Crítico — criativo invisível no feed." |
| Sem meta definida | neutro (`var(--txt-3)`) | sintetizado no frontend (§2) | "Você não definiu uma meta para isso." |
| Meta padrão do sistema | neutro/informativo (`var(--txt-2)`), não a cor de julgamento pura | `note` + rótulo extra | "Meta padrão do sistema (R$ 50,00) — você não personalizou este valor." |

Os símbolos `✓/⚠/✗` do `note` cru não precisam ir para a tela — a cor do card
já os substitui; manter os dois seria redundante. O texto exibido é o que vem
depois deles.

### 4. Onde ficam e relação com o diagnóstico

**Não é uma seção nova** — são os tiles que já existem em "Métricas"
(`CampaignDetail.tsx:97`, entre o card de Oportunidade e o "Diagnóstico"). A
mudança é só no conteúdo de cada tile, não na posição, no agrupamento nem em
criar um componente novo. `DiagnosisCards`, logo abaixo, continua sendo o
diagnóstico causal (cenários A–O); os cards de métrica continuam sendo o
resumo rápido por métrica — a relação entre os dois não muda, só o segundo
fica mais legível.

### 5. Critérios de aceite

- **AC-M1**: para as 6 métricas com meta definida e valor presente, o card
  mostra a mesma cor que `MetricEvaluation.status`, e um texto em português
  sem os símbolos crus e sem truncar antes do veredito (o oposto do que
  `tileNote` faz hoje).
- **AC-M2**: CPA/CPL/ROAS com valor presente e meta em branco mostram um card
  neutro "sem meta definida" — não desaparecem da grade.
- **AC-M3**: CTR Link/Hook Rate/CPM com meta em branco mostram o rótulo "meta
  padrão do sistema" em vez de aparentar que o valor foi escolhido pelo
  gestor.
- **AC-M4**: métrica sem `value` (nem enviada nem derivável) continua sem
  card — comportamento atual, não deve regredir.
- **AC-M5**: nenhuma chamada de rede nova; os 5 estados são deriváveis 100% do
  que `POST /api/v1/campaign/analyze` já devolve mais o que o próprio
  formulário já tem em memória.
- Suite cobrindo os 5 estados, com teste de mutação (convenção do projeto —
  ver `CLAUDE.md`, "Sessão de 2026-08-25 (parte 2)").

### 6. Escopo de arquivos (nenhum arquivo de `backend/` — consistente com a
verificação do §"Verificação obrigatória": nada precisa de dado novo)

- `frontend/nexgestor-dashboard/src/lib/adapt.ts` — `tileNote()` para de
  truncar antes do veredito; nova lógica sintetiza os tiles "sem meta" para
  CPA/CPL/ROAS (§2) usando `input.metrics`/`input.targets`; tiles de CTR
  Link/Hook Rate/CPM ganham a checagem de "meta padrão do sistema".
- `frontend/nexgestor-dashboard/src/types.ts` — `Tile` (hoje a tupla `[label,
  value, color, note]`) precisa acomodar o estado "sem meta"/"padrão do
  sistema" — decisão de implementação: um 5º campo tipado (ex.: `origem:
  "gestor" | "sistema" | "ausente"`) em vez de forçar isso dentro da string de
  `note`, para o componente decidir o rótulo sem fazer parsing de texto.
- `frontend/nexgestor-dashboard/src/components/DetailSections.tsx`
  (`MetricTiles`) — renderiza o rótulo extra quando `origem !== "gestor"`;
  ajuste de altura/quebra de linha do `.md`, já que o texto deixa de ser uma
  linha curta de 28 caracteres.
- `frontend/nexgestor-dashboard/src/style.css` — `.mtile`/`.md` (tokens
  `--txt-3`/`--txt-2` já existem e já têm contraste WCAG verificado desde
  2026-07-25 — não precisa de medição nova).
- Testes: `src/test/lib/adapt.test.ts` (a suíte de tiles já existe,
  `describe("responseToVM — tiles", ...)`, `adapt.test.ts:126`) e um teste de
  componente para `MetricTiles` cobrindo os 5 estados.

### Fora de escopo (confirmado contra as rotas reais)

- **Comparação temporal (subiu/caiu)** — exige persistência histórica que não
  existe (`POST /api/v1/campaigns` sobrescreve, sem série por campanha; mesmo
  gap já registrado em `docs/PRD.md`, "não existe histórico/série temporal no
  produto"). Nenhum card proposto aqui depende disso — todos os 5 estados
  usam só o que a análise atual já devolve. Fica como candidato ao futuro PRD
  de histórico, não decidido aqui.
- Nenhuma outra métrica além das 6 pedidas — as demais avaliadas pelo engine
  (Hold Rate, CTR Todos, Frequência, Conversão LP, Conversões/semana, CPC)
  continuam nos tiles como já estão hoje; não fazem parte deste pedido.
- Alteração de rota, schema ou lógica de negócio no backend — confirmado que
  não é necessária (§"Verificação obrigatória").

### Nota sobre a hierarquia de fases — não decidida aqui

`docs/PRD.md` fixa que cada PRD pequeno gera **no máximo 2 PRs**. Este PRD já
usou os dois (PR A e PR B, ambos implementados em 2026-08-27). O trabalho
desta seção seria um terceiro PR dentro do mesmo PRD, o que estoura esse
orçamento. Registrado para decisão do usuário — não escolhida aqui, seguindo
o mesmo padrão da seção "Sobreposições a resolver": ou esta seção sai daqui e
vira `fase-3-cards-de-metrica.md` (mais aderente à hierarquia), ou o
orçamento de "2 PRs por fase" é tratado como orientação e não regra rígida
para este caso, já que o trabalho é pequeno (um arquivo de lógica + um de
apresentação, nenhuma rota nova).

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
  campos (commit `f4914be`). **Deixou de ser sobreposição** desde que "virar
  tela" saiu do MVP (§4/§10): a fase-2 não abre mais este arquivo. Se a tela
  cheia voltar numa fase futura, a casca do componente (como é aberto, o
  `onClose`) muda e o conflito reaparece — o conteúdo da fase-1 (campos,
  `hint`, agrupamento) continua não precisando mudar em nenhum cenário.
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

**Sobreposição com `d63ee20` (selo de estado da IA), fora do par fase-1/fase-2:**

Este PRD foi escrito antes de `d63ee20` existir, então a comparação acima não
o cobria. Dois pontos:

- `frontend/nexgestor-dashboard/src/style.css` — `d63ee20` adicionou ~30 linhas
  (`.ai-status`, `.ai-badge-btn`, `.ai-dot`, `.ai-on`, `.ai-falhando`,
  `.ai-off`, `.ai-desconhecido`, `.ai-pop`) **na mesma região de "controles do
  header"** que o PR B pretende tocar para o indicador do Copiloto. É aditivo,
  não funcionalmente conflitante, mas é a terceira feature escrevendo no mesmo
  trecho do mesmo arquivo. Um detalhe a herdar em vez de reinventar: o selo
  documenta no próprio CSS por que usa `--txt-2` e não `--txt-3`/`--muted`
  (3,51:1 e 4,24:1 reprovam no WCAG AA em texto de 10px) — o indicador novo do
  Copiloto deve seguir a mesma regra.
- **Colisão de nome já resolvida uma vez, não repetir.** `d63ee20` escolheu
  `ai-badge-btn` porque `.ai-badge` já era a pílula "complementado por IA" do
  detalhe. Um indicador de Copiloto chamado `.ai-algo` seria a terceira classe
  com prefixo `ai-` significando coisa diferente. Preferir um prefixo próprio
  (`copilot-`), que também reforça a distinção camada × Copiloto do AC4.

**O que precisaria ser removido ou reescrito se as duas forem implementadas:**
- Nada do conteúdo da fase-1 (os 20 textos de campo, o componente
  `FieldHint`) precisaria ser removido — são complementares, não
  concorrentes, enquanto a Central de Ajuda ficar no nível de fluxo.
- Se a Central de Ajuda (fase-2) acabar duplicando explicação de campo por
  campo (o risco descrito acima se materializar), o texto duplicado teria
  que ser removido de um dos dois lugares para não haver duas respostas
  diferentes para "o que é CPA" — decisão de conteúdo, não de código, fica
  para quem revisar as duas fases juntas.
- **Não se aplica mais nesta fase**, mas fica registrado para quem retomar
  "Nova campanha vira tela cheia" (§4, agora 🕗 Depois): a integração atual em
  `App.tsx` (`modal === "new"` renderizando `<NewCampaignModal onClose=... />`
  por cima da Home) precisaria ser reescrita para um roteamento por `Screen`
  — seria código da fase que retomar isso, mas o componente reescrito por
  dentro é o mesmo que a fase-1 entregou.
