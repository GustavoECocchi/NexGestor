# PRD — Benchmark de mercado para metas não definidas

Status: **rascunho para revisão do time antes de implementar.** PRD pequeno,
gerado a partir de `docs/rascunho_prompt.md`. Nada implementado — só
especificação, por instrução explícita do prompt de origem.

## 1. Problema

`docs/prds/fase-2-dashboard-intuitividade.md` §11 (implementada em
2026-08-27, PR A + PR B já consumidos) documentou que as métricas com meta
opcional (CPA, CPL, ROAS) somem em silêncio do tile quando o gestor não
preenche a meta, e as métricas com default no schema (CTR Link, Hook Rate,
CPM) são avaliadas contra um número que o gestor nunca escolheu, sem a tela
indicar isso.

Causa raiz: o público-alvo do NexGestor não tem base em marketing e não sabe
qual seria a meta adequada para o próprio nicho. Deixar em branco não é
desinteresse — é falta de referência.

## 2. Solução decidida

Buscar benchmark de mercado automaticamente, via Gemini com grounding de
busca, para as métricas sem meta definida pelo gestor. Decisões já tomadas
(não reabertas aqui):

1. **Nicho por lista fixa**, campo obrigatório no formulário, tipo select.
   Nunca texto livre.
2. **Cache de 14 dias**, por combinação (nicho + plataforma + objetivo).
3. **Transparência de origem** — o tile sempre indica se o número comparado é
   meta do gestor ou benchmark de mercado, como informação neutra.
4. **Fallback sem forçar número**: sem fonte citável, o tile diz que não foi
   encontrada referência de mercado e que a análise usa só os dados da
   própria campanha.

## 3. Verificação obrigatória — o que existe de fato

### 3.1 O campo `niche` já existe — não é novo, é free-text e não tem UI

**Achado que muda o §6 (impacto no schema):** `niche` **já é um campo do
schema** (`Campaign.niche`, `schema.py:63`) —
`Optional[str] = Field(default=None, max_length=100, description="Ex: SaaS,
ecommerce, infoproduto")`. Não existe hoje como campo do formulário manual
(`NewCampaignModal.tsx`, lista de campos verificada em §11 da fase-2 — niche
não está lá); só é alcançável pelo modo **Importar arquivo** (JSON), sem
validação de valor (`nicheFromFile = typeof rawCampaign.niche === "string" ?
rawCampaign.niche : null`, `NewCampaignModal.tsx:251`), e é consumido hoje só
pelo prompt da IA como texto cru: `f"Nicho: {campaign.niche or 'não
informado'}"` (`prompts.py:138`).

Isso muda a tarefa de "adicionar campo novo" para "restringir e expor um
campo que já existe, e que hoje aceita qualquer string". Duas consequências
diretas:

- **Padrão a reaproveitar, não copiar 1:1.** `platform` já passou por
  exatamente esta transição — de aceitar qualquer coisa para um `Literal`
  fechado (`CampaignPlatform = Literal["meta_ads", "google_ads",
  "tiktok_ads", "linkedin_ads"]`, `schema.py:26`), motivada pelo mesmo tipo de
  achado (NG-T03, 2026-07-28, "enum aberto" — registrado em `CLAUDE.md`). O
  parser do modo Importar arquivo já valida `platform` contra lista fechada
  via `pickEnum(rawCampaign.platform, PLATFORM_VALUES, "meta_ads",
  "campaign.platform", invalidValueKeys)` (`NewCampaignModal.tsx:250`) — o
  princípio (whitelist fechada, valor fora dela vira aviso, nunca aceito
  silenciosamente) serve para `niche`, mas o helper em si precisa de ajuste
  antes de servir literalmente — ver a ressalva no §6.
- **Tornar obrigatório é mudança que quebra contrato.** Hoje `niche` é
  `Optional` com default `None` — qualquer chamador atual de
  `POST /api/v1/campaign/analyze` que não manda o campo continua funcionando.
  Tornar obrigatório faz esses chamadores começarem a receber 422. Não há
  outro consumidor conhecido da rota além do próprio dashboard (`lib/api.ts`),
  mas fica registrado como decisão a confirmar antes de implementar, não
  presumida aqui.

### 3.2 Nichos candidatos — benchmark público confirmado por pesquisa real

Pesquisa feita nesta sessão (não lida de memória), com fonte nomeada por
item. **WordStream** é a fonte primária citada por praticamente todo agregador
do setor para CTR por indústria, em Google Ads e Meta Ads — a página oficial
devolveu 403 para fetch direto, então os números abaixo vêm de sites que
citam a WordStream explicitamente como origem (confirmado texto: *"Numbers
reflect... Source: WordStream 2025 Facebook Ads Benchmarks"*), com uma
ressalva de confiança marcada onde a atribuição não foi tão direta.

| Nicho (lista do prompt) | CTR — Google Ads | CTR — Meta Ads | Nota |
|---|---|---|---|
| E-commerce / Varejo | "E-commerce" 2,69% | — | Mantém — Google confirmado |
| Educação e Cursos | "Education" 3,78% | "Education and Instruction" 1,86% | Mantém — os dois |
| Saúde e Bem-estar | "Health & Medical" 3,27% | "Health and Fitness" 1,72% / "Physicians and Surgeons" 3,02% | Mantém — os dois |
| Beleza e Estética | — | "Beauty and Personal Care" 2,55% | Mantém — só Meta confirmado |
| Imobiliário | "Real Estate" 3,71% | "Real Estate" 3,75% | Mantém — os dois |
| Serviços Financeiros e Seguros | "Finance & Insurance" | — | Mantém — categoria confirmada; **fontes discordam do valor exato** (2,91% vs. 8,5% em dois agregadores) — ver §3.4 |
| Serviços Jurídicos | "Legal" | "Attorneys and Legal Services" 2,11% | Mantém — os dois |
| Automotivo | "Auto" 4,00% | "Automotive—Repair, Services and Parts" 0,80% / "Hardware and Automotive" 2,58% | Mantém — categorias bem distintas por sub-nicho, ver nota |
| Viagens e Turismo | "Travel & Hospitality" 4,68% | "Travel" 2,76% | Mantém — os dois |
| Alimentação e Restaurantes | — | "Restaurants and Food" 2,97% | Mantém — só Meta confirmado |
| Software e Tecnologia (B2B) | "B2B" 2,41% / "Technology" 2,09% | — | Mantém — só Google confirmado (B2B/SaaS é fraco em relatórios de Meta) |
| Fitness e Academias | — | "Health and Fitness" 1,72% | **Mesma categoria que "Saúde e Bem-estar"** — ver §3.3 |
| Serviços Locais (reformas, manutenção) | — | "Home and Home Improvement" 1,94% | Mantém, com ressalva — categoria mais ampla que só "serviço" |
| Pet | — | "Dogs, Cats, and Pets" ~1,94% | Mantém, **confiança menor** — só via agregador, não confirmado na página da WordStream (ver §3.4) |
| Moda e Vestuário | — | "Clothing and Fashion" ~2,84% | Mantém, **confiança menor** — mesma ressalva do Pet |

**Nenhum nicho foi removido** — todos os 14 originais têm ao menos uma
categoria de CTR publicamente atribuída à WordStream, direta ou via
agregador. O que muda o desenho da feature são os dois achados abaixo, mais
graves que "um nicho sem benchmark".

### 3.3 Sobreposição não resolvida: Fitness e Academias × Saúde e Bem-estar

As duas apontam para a **mesma** categoria de origem ("Health and Fitness",
Meta) — não há uma fonte distinta para "academia" separada de "saúde". Manter
os dois como nichos separados na lista fixa do formulário criaria duas
opções que, no momento de buscar benchmark, colapsam no mesmo número — sem
nada de errado tecnicamente, mas confuso para quem estiver escolhendo entre
os dois no select. Registrado para decisão do time (mesmo padrão da fase-2,
"Sobreposições a resolver" — não decidido aqui): manter como sinônimos
visíveis, ou fundir num nicho só.

### 3.4 Achado mais importante: benchmark **por métrica**, não só por nicho

O prompt pediu verificação de "CTR e/ou métricas de vídeo" por nicho — a
pesquisa mostrou que a divisão real não é por nicho, é por **métrica**:

- **CTR**: benchmark público, nomeado, segmentado por indústria — existe e é
  utilizável, com a ressalva de precisão do §3.2 para 2 nichos.
- **Hook Rate / Hold Rate (métricas de vídeo)**: **não existe benchmark
  público segmentado por indústria, para nicho nenhum.** Múltiplas fontes
  pesquisadas confirmam isso explicitamente — *"There is no official Meta
  benchmark for hook rate because hook rate is usually a custom metric"* — o
  que existe são faixas genéricas (ex.: 20–25% aceitável, 30–35% forte) que
  **não variam por indústria** em nenhuma fonte encontrada. Buscar "hook rate
  benchmark para nicho Beleza e Estética" via Gemini grounding **vai cair no
  estado de fallback do item 4 quase sempre** — não por falha de busca, mas
  porque a informação não existe publicada.
- **ROAS**: só encontrada como **média global** (2,19–2,79x, dependendo da
  fonte), nunca segmentada por indústria numa fonte nomeada e confiável. Mesmo
  destino do Hook Rate — fallback na prática, para qualquer nicho.
- **CPA / CPL / CPM** (não pedidos pelo item 1 do prompt, mas parte das 6
  métricas que motivaram o problema em `fase-2-dashboard-intuitividade.md`
  §11): a mesma WordStream que publica CTR também publica CPC e CPL por
  indústria (confirmado: intervalo de US$0,34 a US$1,22 de CPC, ~US$23,10 de
  CPL para geração de leads) — **estas têm caminho tão viável quanto o CTR**,
  não verificadas nicho a nicho aqui por não terem sido pedidas no item 1,
  mas relevantes para o time decidir o escopo real de métricas do PR B (§8).

**Consequência para o desenho:** das 6 métricas que motivam a feature, só
**CTR Link, CPA, CPL e CPM** têm um caminho de benchmark real e nomeável por
nicho. **ROAS e Hook Rate praticamente sempre cairão no fallback do item 4**
— o que é o comportamento correto e já decidido (nunca forçar número sem
fonte), mas precisa estar claro para quem for avaliar se a feature "funciona"
depois de pronta: para essas duas métricas, o resultado esperado na maioria
das buscas é "não encontrada referência de mercado", não um número.

### 3.5 Risco técnico: grounding de busca e saída estruturada não combinam hoje

A integração Gemini existente (`ai_service.py:137`, `_execute_call`) usa
`response_schema` para forçar JSON estruturado — é assim que
`analyze_with_ai` funciona hoje. **Busca com grounding e `response_schema`
JSON no mesmo request são tipicamente incompatíveis na API do Gemini** (a
ferramenta de busca e o modo de saída estruturada disputam o mesmo mecanismo
de "tool calling"). Isso significa que `_execute_call` **não pode ser
reaproveitado como está** para esta feature — o caminho realista é uma
chamada COM grounding pedindo texto livre + citação, seguida de extração do
número e da fonte a partir de `groundingMetadata`
(`groundingChunks`/`groundingSupports`, quando o SDK expõe isso) em vez de
`response.parsed`. Risco técnico registrado para quem for implementar
validar contra a versão exata do SDK em uso — não confirmado aqui por não
fazer parte do que "não implementar" permite testar.

## 4. Contrato da nova rota

Seguindo o padrão de `docs/CONTRATO_API_FRONTEND.md`.

**`POST /api/v1/benchmark/mercado`**

| Campo | Detalhe |
|---|---|
| Autenticação | Nenhuma (consistente com o resto da API — pública, sem sessão) |
| Parâmetros de entrada | JSON: `{ "niche": CampaignNiche, "platform": CampaignPlatform, "objective": CampaignObjective, "metrics": ["ctr_link", "cpa", ...] }` — lista fechada de métricas pedidas, mesmos nomes de campo do `Metrics`/`Targets` já usados no restante da API |
| Formato de resposta | `{ "resultados": [ { "metric": "ctr_link", "encontrado": true, "value": 1.51, "fonte": "WordStream Facebook Ads Benchmarks 2025", "fonte_url": "...", "capturado_em": "2026-08-27T..." } , { "metric": "hook_rate", "encontrado": false, "motivo": "sem benchmark segmentado por indústria disponível" } ] }` — cada métrica pedida sempre aparece na resposta, `encontrado: false` é uma resposta válida e completa (decisão #4), nunca omitida |
| Códigos de erro | 422 `niche`/`platform`/`objective` fora da lista fechada ou métrica desconhecida na lista pedida; 501 se `BENCHMARK_ENABLED` estiver desligado (mesmo padrão do `enabled`/`available` de `/status`); 500 erro interno; **nunca 4xx/5xx por "não encontrado"** — isso é `encontrado: false` com 200, não uma falha de request |
| Rota de status | `GET /api/v1/status` ganha um bloco `"benchmark": { "enabled": ..., "available": ... }`, mesmo desenho de `ai.enabled`/`ai.available` (`status.py:44`) — reaproveita a distinção já existente entre "toggle ligado" e "de fato funcionando", não inventa uma terceira forma |

## 5. Schema da tabela de cache

Mesma casa da tabela `campanhas` (`storage.py`) — arquivo único SQLite,
gated pelo mesmo `DB_PATH`. **Implicação a registrar, não resolvida aqui**:
se `DB_PATH` estiver vazio (`persistencia_ativa() == False`, o padrão em dev
local), o cache também fica indisponível — cada busca de benchmark vira uma
chamada Gemini paga, sem cache nenhum. Precisa de decisão: a rota funciona
sem cache (mais cara, mais lenta) ou fica condicionada à persistência estar
ligada, como as rotas de `campanhas_salvas`?

```sql
CREATE TABLE IF NOT EXISTS benchmarks_mercado (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nicho         TEXT NOT NULL,
    plataforma    TEXT NOT NULL,
    objetivo      TEXT NOT NULL,
    metrica       TEXT NOT NULL,
    valor         REAL,              -- NULL quando encontrado=0
    encontrado    INTEGER NOT NULL,  -- 0/1 — SQLite não tem BOOLEAN nativo
    fonte         TEXT,              -- nome da fonte citada (NULL se não encontrado)
    fonte_url     TEXT,
    capturado_em  TEXT NOT NULL,
    expira_em     TEXT NOT NULL,     -- capturado_em + 14 dias, calculado na escrita
    UNIQUE (nicho, plataforma, objetivo, metrica)
);
CREATE INDEX IF NOT EXISTS idx_benchmarks_expiracao ON benchmarks_mercado(expira_em);
```

Notas de desenho, no mesmo espírito de `storage.py`:

- **`encontrado=0` também é cacheado, com o mesmo prazo de 14 dias.** Sem
  isso, toda métrica sem fonte (ROAS e Hook Rate, na prática — §3.4) geraria
  uma chamada Gemini nova a cada análise, o oposto do que o cache existe para
  evitar.
- **Chave única por (nicho, plataforma, objetivo, métrica)** — não por
  campanha. Duas campanhas do mesmo gestor no mesmo nicho/plataforma
  reaproveitam a mesma linha, o que já é a lógica que a decisão #2 do prompt
  pede.
- **Sem coluna `dono`** — benchmark de mercado não é dado privado de ninguém;
  é o mesmo padrão de `campanhas` antes do isolamento por dono (2026-08-24),
  só que aqui é intencional, não uma dívida a resolver depois.
- `ALTER TABLE`/migração idempotente segue o padrão já estabelecido em
  `storage.py:124` (tentar, ignorar só `"duplicate column"`, deixar qualquer
  outro erro subir) caso esta tabela precise ganhar coluna depois.

## 6. Impacto no formulário e no schema de campanha

Decorre direto do achado do §3.1 — não é "campo novo", é "campo existente
restrito e exposto":

- **Backend**: `niche: Optional[str]` (`schema.py:63`) vira
  `niche: CampaignNiche` (sem `Optional`, sem default), com
  `CampaignNiche = Literal[...]` (lista final do §3.2, pendente da decisão do
  §3.3) — mesmo padrão de `CampaignPlatform`/`CampaignObjective`
  (`schema.py:25-26`). **Quebra de contrato**: chamadas hoje válidas sem
  `niche` passam a receber 422.
- **Frontend, modo manual**: `NewCampaignModal.tsx` ganha um `<select>` de
  nicho no grupo "Identificação" (ao lado de Nome/Objetivo/Plataforma) — hoje
  não existe nenhum campo de nicho visível no formulário manual.
- **Frontend, modo Importar arquivo**: `nicheFromFile` (`:251`) troca de
  aceitar qualquer string para validação contra a lista fixa. **Atenção ao
  reaproveitar `pickEnum`** (`NewCampaignModal.tsx:181`): sua assinatura hoje
  é `pickEnum<T>(v, permitidos, padrao: T, campo, invalidos)` — `padrao` é
  obrigatório e do tipo `T`, não aceita `undefined`. Para `platform` isso é
  correto (`"meta_ads"` é um default seguro). Para `niche` **não há default
  neutro razoável** — inventar um (ex.: sempre cair em "E-commerce / Varejo")
  atribuiria ao gestor um nicho que ele nunca informou, o mesmo erro de "zero
  fabricado" já corrigido em 2026-07-28 (parte 2) para métricas. A função
  precisa de uma variante que aceite "sem default" e devolva `undefined`
  quando o valor faltar ou for inválido (reportando em `invalidos` do mesmo
  jeito) — não é reaproveitável 1:1 como está. Sem nicho reconhecido, o
  preview bloqueia "Analisar campanha" com o mesmo padrão de aviso que chaves
  desconhecidas já usam (`:452`).
- **Campanhas já salvas** (`campanhas_salvas`, `storage.py`): o `payload` é
  opaco (`storage.py:24`) — **nenhuma migração de banco é necessária**, a
  tabela não sabe nem precisa saber o formato interno. O impacto é só em
  runtime: uma campanha salva com `niche: null` (a maioria — o campo nunca
  teve UI) ou com um valor livre antigo do modo Importar arquivo que não bate
  com a lista fixa nova **não tem como buscar benchmark** — cai direto no
  estado "sem meta e sem nicho reconhecido", que é uma variação do fallback
  do item 4, não um erro. Reanalisar essa campanha pelo formulário manual
  (que agora exige nicho) resolve; nada força isso a acontecer.

## 7. Critérios de aceite

- **AC-B1**: `POST /api/v1/benchmark/mercado` sem `niche` na lista fixa (ou
  fora dela) devolve 422, nunca aceita silenciosamente.
- **AC-B2**: pedir a mesma combinação (nicho, plataforma, objetivo, métrica)
  duas vezes dentro de 14 dias faz só uma chamada real ao Gemini — a segunda
  vem do cache (verificável por contagem de chamadas mockadas em teste).
- **AC-B3**: métrica sem fonte encontrada devolve `encontrado: false` com
  `motivo`, HTTP 200 — nunca um número sem `fonte`, nunca erro HTTP.
- **AC-B4**: o tile no frontend mostra a origem do número comparado (meta do
  gestor / benchmark de mercado / sem meta e sem referência) sempre que pelo
  menos um dos três estados se aplica — nenhuma métrica fica ambígua sobre a
  origem do número que ela compara.
- **AC-B5**: campanha salva antes desta mudança, sem `niche` reconhecido, não
  quebra ao abrir — mostra o estado "sem meta e sem nicho reconhecido" em vez
  de erro.
- **AC-B6**: o cache expira exatamente aos 14 dias (teste de mutação sobre o
  cálculo de `expira_em`, convenção já estabelecida no projeto — ver
  `CLAUDE.md`, "Sessão de 2026-08-25 (parte 2)").

## 8. Escopo de arquivos — 2 PRs, PR B depende de PR A

**PR A — Backend: rota, cache, schema**
- `backend/backend-nexgestor-main/app/schema/schema.py` — `CampaignNiche =
  Literal[...]` (§3.2/§3.3); `Campaign.niche` perde `Optional`/default.
- `backend/backend-nexgestor-main/app/service/storage.py` — tabela
  `benchmarks_mercado` (§5); funções `buscar_cache`/`salvar_cache` no mesmo
  padrão de `listar`/`salvar`.
- **Arquivo novo**: `backend/backend-nexgestor-main/app/service/benchmark_service.py`
  — chamada Gemini com grounding (§3.5, caminho sem `response_schema`),
  orquestra cache → Gemini → cache.
- **Arquivo novo**: `backend/backend-nexgestor-main/app/routes/benchmark.py` —
  `POST /api/v1/benchmark/mercado` (§4).
- `backend/backend-nexgestor-main/app/routes/status.py` — bloco
  `"benchmark"` no `GET /status` (§4).
- `backend/backend-nexgestor-main/app/core/config.py` — `BENCHMARK_ENABLED`,
  mesmo padrão de `GEMINI_ENABLED` (`config.py:77`).
- `backend/backend-nexgestor-main/app/service/prompts.py:138` — reavaliar a
  linha `f"Nicho: {campaign.niche or 'não informado'}"`: com `niche` deixando
  de ser opcional, `or 'não informado'` vira código morto (nunca mais `None`
  chega ali) — não é bug, mas seria uma limpeza natural do PR.

**PR B — Frontend: formulário, whitelist do import, tiles**
- `frontend/nexgestor-dashboard/src/components/NewCampaignModal.tsx` —
  `<select>` de nicho no modo manual (§6); `NICHE_VALUES` +
  `pickEnum(rawCampaign.niche, ...)` no modo Importar arquivo.
- `frontend/nexgestor-dashboard/src/types.ts` — `niche` deixa de ser
  `string | null` opcional (`:22`) e vira o union fechado espelhando
  `CampaignNiche`; `Tile` ganha o campo de origem já especificado em
  `fase-2-dashboard-intuitividade.md` §11 (`origem: "gestor" | "sistema" |
  "mercado" | "ausente"` — "mercado" é o estado novo que este PRD adiciona
  ao que o §11 já desenhou).
- `frontend/nexgestor-dashboard/src/lib/adapt.ts` — chama
  `POST /benchmark/mercado` quando uma das métricas do §3.4 (CTR Link, CPA,
  CPL, CPM — não ROAS/Hook Rate, que raramente têm fonte) está sem meta do
  gestor.
- `frontend/nexgestor-dashboard/src/components/DetailSections.tsx`
  (`MetricTiles`) — renderiza o rótulo de origem "mercado" com a fonte citada
  (tooltip ou texto curto), reaproveitando o trabalho de `fase-2-dashboard-intuitividade.md`
  §11.
- `frontend/nexgestor-dashboard/src/style.css` — cor/estilo do estado
  "mercado", distinto de "gestor"/"sistema"/"ausente".
- Testes: `test/lib/adapt.test.ts`, `test/components/NewCampaignModal.test.ts`
  (whitelist de nicho, mesmo padrão dos testes de `platform` já existentes).

## Fora de escopo

- **Ampliar benchmark para plataformas além de Google e Meta** — TikTok Ads e
  LinkedIn Ads já são opções válidas de `platform` (2026-07-29), mas a
  pesquisa desta sessão não cobriu benchmark público para elas; ficam sem
  busca de mercado até uma sessão futura confirmar fonte.
- **Meta em linguagem de negócio** (o gestor dizer "quero lucrar X" e o
  sistema derivar CPA/CPL/CPM/ROAS) — fase futura, não tocada aqui.
- **Persistência histórica / comparação entre períodos** — mesma restrição já
  registrada em `fase-2-dashboard-intuitividade.md` §11; benchmark de
  mercado compara contra uma referência externa, não contra medição anterior
  da própria campanha.
- **Migração de campanhas já salvas para a lista fixa de nicho** — não é
  implementada; o comportamento é degradar para o fallback (§6), não
  reescrever dados antigos.
- **Resolver a sobreposição Fitness × Saúde e Bem-estar (§3.3)** — registrado
  para decisão do time, não decidido neste documento.
- **Confirmar a incompatibilidade grounding + `response_schema` (§3.5) contra
  a versão exata do SDK** — é um risco registrado, não um teste executado
  (este PRD não implementa nada).

## Restrições desta sessão

- Nada foi implementado — só este documento, e nenhum outro PRD foi alterado.
- Toda afirmação sobre código foi verificada contra os arquivos reais citados
  (linha a linha, com `grep`/leitura direta) antes de entrar aqui — inclusive
  as duas vezes em que a verificação contradisse a premissa do prompt de
  origem (`niche` já existir; benchmark de vídeo/ROAS não existir por nicho).
- Toda afirmação sobre benchmark de mercado veio de busca real nesta sessão
  (WebSearch/WebFetch), com fonte nomeada por item — não de conhecimento
  memorizado do modelo. Onde a confiança da fonte é menor (Pet, Moda,
  Serviços Financeiros — valor numérico), isso está marcado explicitamente
  no §3.2/§3.4, não apresentado com a mesma certeza dos demais.

## Referência

Gerado a partir de `docs/rascunho_prompt.md`. Depende de
`fase-2-dashboard-intuitividade.md` §11 (o problema que motiva esta feature)
e reaproveita padrões já estabelecidos: `CampaignPlatform`/`pickEnum` para
listas fechadas (`schema.py`, `NewCampaignModal.tsx`), `enabled`/`available`
para capacidades opcionais (`status.py`), e o desenho de cache/persistência
de `storage.py`. Índice geral de rotas em `../PRD.md`.
