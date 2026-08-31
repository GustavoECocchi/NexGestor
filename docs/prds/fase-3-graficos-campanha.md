# PRD — Gráficos no detalhe da campanha (inspirados no Fuse React)

Status: **Parte A foi implementada e testada em 2026-08-31, e DEPOIS
SUBSTITUÍDA no mesmo dia** — o usuário pediu (via `docs/rascunho_prompt.md`)
um feed reorganizado (Faixa de resultado / Painel do funil / Ações /
Métricas de contexto) que não tinha lugar para o gráfico polar "Áreas da
campanha"; ele foi removido (`AreaChart.tsx` apagado) e substituído por
`components/MetricFeed.tsx` — ver seção A6 abaixo. **A Parte A desta seção
(A1–A5) descreve uma implementação que não existe mais no código** — mantida
aqui só como registro histórico da decisão e do porquê (a skill de dataviz
consultada, o motivo de não ser radar, etc. continuam válidos como
raciocínio, só não como estado atual da tela). Parte B (histórico/tendência)
segue só especificação, inalterada por isto.

## 1. Contexto

Pedido do usuário, olhando a mesma referência visual já usada na criação do
dashboard (2026-08-24): `fuse-react-nextjs-demo.fusetheme.com/dashboards/project`.
Dois widgets dessa tela foram citados como inspiração:

- **"Github Issues Summary"** — combo linha+coluna "New vs. Closed" ao longo
  dos dias da semana, mais um painel de números-resumo ao lado.
- **"Task Distribution"** — um gráfico polar/radar de 4 categorias (API,
  Backend, Frontend, Issues) comparando volume de tarefas entre elas.

O pedido original tratava os dois como paralelos. A investigação mostrou que
não são — um depende de dado que o produto não tem, o outro não.

## 2. Por que os dois pedidos têm destinos diferentes

**"Task Distribution" → dá para fazer com o dado que já existe.** O backend já
devolve `metric_evaluations` (cada métrica avaliada, com `score` 0–100) em
toda resposta de `POST /campaign/analyze` — é o mesmo campo que alimenta os
tiles do §11 (`fase-2-dashboard-intuitividade.md`). Nenhuma persistência nova,
nenhuma rota nova.

**"Github Issues Summary" → precisa de histórico que não existe.** A linha
"New vs. Closed" é uma série temporal (uma medição por dia). O NexGestor não
guarda snapshots — `POST /api/v1/campaigns` **sobrescreve** o payload a cada
save (`storage.py`, `UPDATE campanhas SET payload = ...`). Isso já estava
registrado como lacuna conhecida em `docs/PRD.md` ("não existe histórico/série
temporal no produto — `spark` é `Array(7).fill(score)`, linha reta"). Desenhar
esse gráfico com o dado atual seria inventar uma série que não existe — o
mesmo tipo de erro que a varredura de veracidade de 2026-08-25 corrigiu em
outro lugar do produto (números fabricados apresentados como fato).

## 3. Decisão de sequenciamento (usuário, 2026-08-31)

Fazer os dois, em ordem: **Parte A agora** (não depende de mudança de
backend), **Parte B como PRD separado** (depende de trabalho de backend real,
entra quando o usuário priorizar).

---

## Parte A — "Áreas da campanha" (IMPLEMENTADA)

### A1. Forma escolhida — e por que não é um radar

Consultada a skill de dataviz do projeto antes de desenhar: o job aqui é
**magnitude** (qual área está melhor ou pior), não identidade — a tabela
"job → forma" da skill recomenda **barra/coluna** para esse job, não radar
(que nem consta no vocabulário de formas da skill: distorce percepção de área
e dificulta comparar eixos não-adjacentes). Escolhido: **meter horizontal**
(`references/marks-and-anatomy.md` — "Meter: ratio contra um limite"), um
por área, cor num hue só (magnitude), não por severidade.

**Por que não colorir por severidade (verde/amarelo/vermelho)**: o engine
nunca definiu um corte "score agregado X = crítico" — só por métrica
individual (é o que os tiles do §11 já mostram). Inventar um corte novo aqui
repetiria exatamente o erro que a varredura de 2026-08-25 corrigiu (dois
julgamentos independentes discordando na mesma tela, ex.: card dizendo
"crítico" o que o semáforo da métrica marcava GREEN). A cor é só magnitude —
o veredito "bem/mal" continua vindo dos tiles e do diagnóstico, como já era.

### A2. Agrupamento por estágio do funil

Sem rota nova ou campo de schema novo — reaproveita `metric_evaluations` e
espelha os pesos que o próprio engine já usa no score geral
(`_METRIC_WEIGHTS`, `service.py:222`):

| Área | Métricas (peso no engine) |
|---|---|
| Criativo | Hook Rate (.10), Hold Rate (.08), Frequência (.07) |
| Cliques | CTR Link (.12), CPC (.03) |
| Leilão | CPM (.05) |
| Conversão | CPA (.25), ROAS (.20), Conversão LP (.08), CPL (.02) |

Métricas informativas do engine (peso 0 — CTR Todos, Conversões/semana) ficam
de fora de propósito: têm score fixo/arbitrário (50) que não representa
eficiência real e distorceria a média.

Score da área = média dos scores das métricas presentes, ponderada pelo peso
de cada uma. Área sem **nenhuma** métrica avaliada não aparece — "nada a
mostrar" não é "score 0" (mesmo cuidado já aplicado aos tiles "sem meta" do
§11).

### A3. O que foi implementado

- `frontend/nexgestor-dashboard/src/types.ts` — `AreaScore` (`label`, `score`,
  `metrics`) e `CampaignVM.areas?: AreaScore[]` (**opcional** — ver A4).
- `frontend/nexgestor-dashboard/src/lib/adapt.ts` — `AREA_METRIC_WEIGHTS`,
  `buildAreas()`.
- `frontend/nexgestor-dashboard/src/components/AreaMeters.tsx` (novo) — meter
  por área, tooltip acessível (hover E foco, `position:fixed` pelo mesmo
  motivo do `FieldHint` — o `.scroll` do detalhe tem `overflow-x:hidden`),
  focável por teclado (`tabIndex`, `role="group"`, `aria-label`).
- `frontend/nexgestor-dashboard/src/components/CampaignDetail.tsx` — seção
  "Áreas da campanha" entre a Oportunidade e as Métricas (visão macro antes da
  micro), condicionada a `areas.length > 0` (sem cabeçalho órfão).
- `frontend/nexgestor-dashboard/src/style.css` — `.areas`/`.area-row`/
  `.area-track`/`.area-fill`/`.area-tip`, reaproveitando os tokens de tema já
  validados (WCAG desde 2026-07-25).
- `frontend/nexgestor-dashboard/src/data/mock.ts` — as 2 campanhas de exemplo
  ganharam `areas` coerentes com os tiles que já tinham.

### A4. Achado durante a implementação — compatibilidade com dado antigo

`areas` foi feito **opcional** no tipo, não obrigatório. Campanhas vivas
salvas no `localStorage` **antes** desta mudança não têm o campo — a primeira
versão (obrigatório) quebrou 4 testes existentes com
`Cannot read properties of undefined (reading 'length')` ao abrir o detalhe.
Corrigido seguindo o padrão já usado no projeto para este exato cenário
(`hasAI`/`coverage`/`confidence`, que também foram adicionados depois do tipo
existir): campo opcional, tratado com `?? []`/`?.length` no ponto de uso, sem
normalizar nada em `lib/store.ts`. Coberto por teste de regressão explícito em
`navegacao.test.tsx`.

### A5. Validação

- `tsc -b` (não `tsc --noEmit` sozinho — ver nota abaixo) e `npm run build`
  limpos.
- Suite: 352 → **364/364** (12 testes novos: 6 em `adapt.test.ts` para
  `buildAreas`, 5 em `AreaMeters.test.tsx`, 1 de regressão em
  `navegacao.test.tsx`). **3 mutações confirmadas** (média simples em vez de
  ponderada; filtro de área-sem-métrica removido — ambas pegas pelos testes
  novos).
- **Validado ao vivo no navegador** (Chromium via automação), contra o
  backend real: formulário manual preenchido com métricas espalhadas pelas 4
  áreas, action → 4 meters renderizados corretamente, tooltip funcionando no
  hover. Confirmado nos dois temas (claro e escuro).
- **Achado de processo, registrado para não se repeter**: `npx tsc --noEmit`
  sozinho, neste projeto, **não pega nada** — o `tsconfig.json` da raiz é só
  `{"files": [], "references": [...]}` (projeto composto); rodar `--noEmit`
  direto nele verifica um conjunto vazio de arquivos e sai limpo mesmo com
  erros reais no código. O comando que corresponde ao que `npm run build`
  roda de fato é **`npx tsc -b`** (build mode, resolve as references). Foi
  assim que 3 arquivos de teste com `CampaignVM` faltando o campo `areas`
  passaram batido na primeira checagem desta sessão.

### A6. Substituída no mesmo dia — o que aconteceu

Depois de A1–A5 implementadas, testadas e ajustadas ao vivo (título dentro
do card, gradiente de cor por severidade, bordas escuras, escala 2x → -30%),
o usuário trouxe `docs/rascunho_prompt.md` pedindo um feed de métricas
inteiramente reorganizado — Faixa de resultado, Painel do funil (barras
verticais) + Ações, Métricas de contexto, banner único de "meta padrão do
sistema". Esse rascunho não tinha lugar para um gráfico de 4 áreas do funil;
confirmado explicitamente com o usuário que ele **substituía**, não
coexistia, o gráfico polar.

Removido nesta troca: `components/AreaChart.tsx` e seu teste,
`CampaignVM.areas`/`AreaScore` (types.ts), `buildAreas`/`METRIC_WEIGHT`/
`METRIC_AREA` (adapt.ts), `tileSize`/`MetricTiles` (DetailSections.tsx — a
grade de tiles por peso/relevância, que também foi descartada, já que o
rascunho define posição FIXA pra cada métrica, não por peso), CSS `.rose*`/
`.mgrid`/`.mtile-lg/md/sm`. Entrou: `components/MetricFeed.tsx` — ver
`docs/prds/fase-5-vocabulario-linguagem.md` §5 e o registro completo da troca
no `CLAUDE.md`, "Sessão de 2026-08-31".

O 6º campo do tipo `Tile` mudou de significado nessa troca: era `weight`
(peso da métrica no score, usado pelo `tileSize` removido) e virou `score` (a
nota 0–100 que o `MetricFeed` usa pra altura das barras do painel do funil)
— mesmo slot da tupla, propósito diferente; não confundir ao ler commits
antigos.

---

## Parte B — Histórico de campanhas (ESPECIFICAÇÃO, NADA IMPLEMENTADO)

### B1. O que falta para o "Github Issues Summary" fazer sentido aqui

Uma série temporal real por campanha: pelo menos score ao longo do tempo,
idealmente também `coverage`/`confidence` e 2-3 métricas-chave (CPA, ROAS).
Isso não existe hoje — `salvar()` (`storage.py:167`) faz `UPDATE`/`INSERT` na
mesma linha, sem histórico.

### B2. Decisões já tomadas (usuário, 2026-08-31)

1. **Snapshot só quando a campanha é SALVA** (`POST /api/v1/campanhas`, tanto
   insert quanto update), nunca a cada `POST /campaign/analyze`. Motivo: a
   rota de análise é chamada livremente durante exploração/teste no
   formulário (o gestor mexendo em números antes de decidir) — capturar isso
   poluiria o histórico com tentativas, não decisões reais.
2. **Particionamento por `campanha_id` (o id que o SERVIDOR atribui no save) +
   `dono` — NUNCA por nome.** O usuário pediu inicialmente "dividir por nome
   de campanha, pra não ter risco de misturar" — investigado e **corrigido**:
   a tabela `campanhas` não tem (e nunca teve) qualquer restrição de nome
   único, e o `payload` é JSON opaco que o backend nem olha por dentro (ver
   cabeçalho de `storage.py`). Nada impede duas campanhas com o mesmo nome —
   do mesmo dono ou de donos diferentes ("Black Friday" é nome provável de
   colidir). Particionar por nome **causaria** exatamente a mistura que o
   pedido queria evitar. `campanha_id` é `INTEGER PRIMARY KEY AUTOINCREMENT`
   — único de verdade e nunca reciclado pelo SQLite — e é o mesmo
   identificador que a lixeira (`DELETE /campaigns/{id}`) já usa. `dono` entra
   também, denormalizado (mesmo padrão já usado em `campanhas.dono`), para
   filtrar sem precisar de `JOIN`.

### B3. Schema proposto

```sql
CREATE TABLE IF NOT EXISTS campanha_snapshots (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campanha_id  INTEGER NOT NULL,
    dono         TEXT NOT NULL,
    score        INTEGER,
    coverage     INTEGER,
    confidence   TEXT,
    criado_em    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_campanha
    ON campanha_snapshots(campanha_id, dono);
```

`score`/`coverage`/`confidence` lidos direto de 3 chaves conhecidas do
`payload` que o cliente já manda (`CampaignVM.score`/`.coverage`/
`.confidence`) — sem re-tipar o VM inteiro no backend, mesmo espírito de
"payload opaco" que a tabela `campanhas` já segue (só que aqui é opaco por
padrão, com 3 furos conhecidos). Ausência de qualquer uma das três não
impede o snapshot (colunas `NULL`-áveis) — campanha antiga sem esses campos
não quebra a gravação.

### B4. Teto de retenção — obrigatório, mesmo padrão já usado

Sem teto, uma pessoa reanalisando/resalvando com frequência gera linhas sem
limite. Dois tetos, espelhando `DB_MAX_CAMPANHAS`/`DB_MAX_CAMPANHAS_GLOBAL`:

- **Por campanha**: mantém só os N mais recentes (sugestão: 90 — cobre ~3
  meses de uso diário sem crescer sem limite); ao inserir o snapshot N+1,
  apaga o mais antigo na mesma transação.
- **Global**: teto duro (`DB_MAX_SNAPSHOTS_GLOBAL`, mesmo raciocínio do teto
  global de campanhas — sem ele, muitas campanhas pequenas juntas furam o
  limite por campanha).
- **Cascade ao apagar a campanha**: `remover()` (`storage.py:229`) apaga
  também os snapshots daquele `campanha_id` — histórico de uma campanha que
  não existe mais não tem onde aparecer na UI, e ficaria órfão do mesmo jeito
  que as linhas sem `dono` da base compartilhada (2026-08-24) — problema já
  visto neste projeto, não repetir.

### B5. Contrato de API (novo)

| Rota | Autenticação | Resposta | Erros |
|---|---|---|---|
| `GET /api/v1/campaigns/{campanha_id}/historico` | `X-Nex-Dono` obrigatório | `{snapshots: [{score, coverage, confidence, criado_em}, ...]}`, mais recentes por último (ordem cronológica, para o gráfico não precisar inverter) | 404 campanha não é do dono ou não existe; 422 dono ausente/inválido; 501 persistência desligada |

Rota separada (não embutida em `GET /campaigns`) — carrega sob demanda, só
quando o detalhe de UMA campanha é aberto, sem inflar a listagem da Home.

### B6. Frontend — o que muda quando isso existir (não implementado agora)

- `lib/api.ts` ganha a chamada nova.
- `lib/adapt.ts`: os comentários já deixados de propósito (`spark`/`trend`,
  "quando o histórico existir na API, só este arquivo muda") deixam de ser
  flat/0 — passam a vir de `campanha_snapshots`, não mais calculados no
  adapter.
- Novo componente no detalhe, forma escolhida pela skill de dataviz quando
  chegar a hora: **linha** (job = tendência ao longo do tempo), série única
  (1 hue, sem legenda — a própria seção já diz o que é), com hover/tooltip por
  ponto. Não decidir agora os detalhes finos (eixo, marcadores) — a skill
  deve ser consultada de novo na hora, com o dado real em mãos.

### B7. Fora de escopo (Parte B)

- Qualquer coisa além de score/coverage/confidence no snapshot inicial —
  métricas específicas (CPA, ROAS) podem entrar depois, mas aumentam o
  tamanho da linha por save; começar pequeno.
- Dashboard agregado entre campanhas (já registrado como "Depois" em
  `fase-2-dashboard-intuitividade.md` §4) — Parte B é histórico de UMA
  campanha, não comparação entre várias ao longo do tempo.
- Migração de dados antigos — campanhas já salvas sem snapshot simplesmente
  começam o histórico vazio a partir do primeiro save depois desta feature
  existir; não há como reconstruir o passado.

### B8. Pendente antes de implementar

- **Confirmar N (teto por campanha) e `DB_MAX_SNAPSHOTS_GLOBAL`** com o
  usuário — os números acima (90 / a definir) são sugestão, não decisão.
- Nenhum código foi escrito para a Parte B. Quando o usuário priorizar,
  seguir a ordem: schema + teto + rota (backend, testado com fuzz/mutação
  como o resto do engine) → chamada no `lib/api.ts` → componente de gráfico
  (consultando a skill de dataviz de novo, com dado real).
