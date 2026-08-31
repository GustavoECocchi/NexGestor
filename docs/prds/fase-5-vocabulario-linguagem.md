# Mini-PRD — Revisão de vocabulário e linguagem do NexGestor

Status: **rascunho para revisão do time antes de implementar.** Gerado a
partir de `docs/rascunho_prompt.md`, em cima da auditoria de vocabulário
rodada nesta mesma sessão (2026-08-31, ver "Sessão de 2026-08-31" no
`CLAUDE.md`). **Nada implementado — só especificação**, por instrução
explícita do prompt de origem.

Objetivo declarado pelo usuário: não é "simplificar os textos" — é reduzir
onde a interpretação falha, **sem perder precisão técnica**. O NexGestor
lida com métricas e diagnósticos de marketing; um gestor de tráfego real
precisa aprender "CPA"/"ROAS" de qualquer forma, porque é o vocabulário que
vai encontrar no Meta Ads Manager e no Google Ads. Traduzir esses termos
seria trocar uma barreira por outra.

## 1. Problema

A auditoria (fork rodado nesta sessão, varrendo `frontend/nexgestor-dashboard`
e os textos gerados por `service.py`) achou um padrão, não uma lista solta de
palavras difíceis: **o produto só cumpre a promessa de "linguagem simples" no
FORMULÁRIO de criação — no resto do produto (onde os números voltam a
aparecer depois), a explicação some.**

Achados concretos, já classificados por tipo (a distinção que o prompt de
origem pediu — ver §3 para o critério de cada categoria):

| # | Onde | Achado | Tipo |
|---|---|---|---|
| 1 | `MetricFeed.tsx` (Faixa de resultado, Painel do funil, Contexto) | Nenhum rótulo (CPA, ROAS, CPM, CPC, CPL, CTR Link, CTR Todos, Hook Rate, Hold Rate, Conversão LP, Frequência) tem tooltip ou explicação — `FieldHint` só é importado em `NewCampaignModal.tsx` (`grep` confirma). É a tela mais vista do produto (o veredito). | Problema real de compreensão |
| 2 | `CampaignDetail.tsx:88` | `"Diagnóstico com {confiança} · cobertura de dados {X}%"` aparece em toda campanha, sem explicação em lugar nenhum. | Texto que precisa só de contexto adicional (as palavras já são português comum; o conceito por trás — "quanto do quadro nós vimos" — não é óbvio) |
| 3 | `NewCampaignModal.tsx` vs `MetricFeed.tsx`/`mock.ts`/`adapt.ts` | O mesmo dado (`metrics.spend`) é rotulado **"Gasto (R$)"** no formulário e **"Investimento"** na Faixa de resultado e em todo o resto da tela de detalhe. | Inconsistência de nomenclatura |
| 4 | `service.py` (`_METRIC_EVAL_CONFIG`, notas dos detectores) | Todo texto gerado pelo engine usa sigla crua sem glosa: `"CTR Link {v}% abaixo do mínimo"`, `"CPC R${v} inflado"`, `"Hook Rate {v}% está criticamente abaixo"`. É o texto mais informativo do produto — e o que mais pressupõe vocabulário prévio. | Problema real de compreensão (mas o TERMO em si está certo — falta só contexto) |
| 5 | `Copilot.tsx` (`buildReply`) | Mesmo padrão do engine — `"O CPA atual desta campanha é R$ 0,00"`, `"O ROAS médio é 4.00x"` — sem glosa, no canal mais conversacional do produto. | Problema real de compreensão |
| 6 | Título curto do Cenário K (`service.py`) | Usa "Retargeting" — termo técnico real, mas menos universal que CPA/ROAS (não aparece em nenhum relatório nativo de plataforma, é jargão de agência). | Termo técnico com dúvida real — avaliar simplificação |
| 7 | Título curto do Cenário C | Usa "Click-Bait" — termo técnico, mas já popularizado fora do marketing (imprensa, redes sociais). | Termo técnico que deve permanecer |
| 8 | Central de Ajuda (`HelpCenter.tsx`) | Por decisão editorial da fase-2 (registrada no próprio código), ela cobre só FLUXO ("como crio uma campanha"), nunca CAMPO ("o que é CPA") — isso ficou 100% a cargo do `FieldHint`, que só existe no formulário. É a causa estrutural dos achados #1 e #4. | Preferência editorial que precisa ser revisitada (não estava errada quando decidida — decidiu evitar duplicar/discordar do `FieldHint` — mas o `FieldHint` nunca chegou ao resto do produto, então a lacuna ficou sem dono) |

**O que já está bem resolvido (não é problema, é o padrão a seguir):**
- `CampaignCard.tsx` (Home) já troca CPA/ROAS crus por `ACTION_LABEL`
  ("Como escalar"/"Para resolver") + frase em português — comentário no
  código confirma que foi intencional.
- `lib/status.ts` nunca deixa `RED`/`BLUE` cru vazar pra tela — sempre vira
  "Crítico"/"Escalável" etc.
- Erros de rede mapeados (429/503/502/504/timeout) já são 100% em português;
  só o caminho de erro NÃO mapeado mostra o código HTTP cru, e isso é
  decisão deliberada e documentada (`lib/api.ts`), não descuido.

## 2. Objetivo

- Tornar diagnósticos, métricas, recomendações, alertas e estados da
  campanha fáceis de entender **em qualquer tela onde apareçam**, não só na
  primeira vez que o gestor os viu (no formulário).
- Preservar os termos técnicos que são vocabulário de mercado real (CPA,
  ROAS, CPM, CPC, CPL, CTR) — o gestor vai precisar deles de qualquer jeito
  ao olhar o Ads Manager; escondê-los reduziria precisão sem reduzir
  confusão.
- Evitar jargão que **não** agrega precisão nenhuma (ex: abreviação "LP" em
  "Conversão LP" quando o produto não abrevia nada mais assim) e evitar que
  o mesmo dado tenha nomes diferentes em telas diferentes.

## 3. Princípios de linguagem

**Como decidir o que é o quê** (a distinção pedida no prompt de origem):

- **Problema real de compreensão** — o texto pressupõe que a pessoa já
  aprendeu o termo em outro lugar, e nesta tela não há como reaprender.
- **Preferência editorial** — uma escolha de tom/estilo que já foi decidida
  conscientemente antes (ex: "Central de Ajuda só cobre fluxo") e que hoje
  produz um efeito colateral não previsto — não é "estava errado", é
  "precisa de um ajuste porque o resto do produto mudou".
- **Termo técnico que deve permanecer** — a tradução perderia precisão ou
  quebraria a correspondência com o vocabulário que a pessoa vai encontrar
  fora do NexGestor (Ads Manager, agências, outros gestores).
- **Inconsistência de nomenclatura** — o mesmo dado/conceito tem nomes
  diferentes em lugares diferentes do produto; não é sobre dificuldade, é
  sobre a pessoa achar que são coisas diferentes quando não são.
- **Texto que precisa só de contexto adicional** — as palavras já são
  português comum, só falta uma frase curta explicando o conceito por trás
  (ex: "cobertura de dados" não é jargão de marketing, é um conceito do
  próprio produto).

**Regras concretas:**

1. **Termos que devem continuar técnicos, sempre:** CPA, ROAS, CPM, CPC,
   CPL, CTR (Link e Todos). São os mesmos rótulos que aparecem nos painéis
   nativos das plataformas de anúncio — mudar o nome aqui criaria uma
   segunda tradução pra decorar, não uma simplificação.
2. **Termos que podem ganhar uma glosa mais curta e direta:** "Hook Rate" e
   "Hold Rate" são nomenclatura interna do ecossistema Meta, menos
   universal que CPA/ROAS — o RÓTULO pode continuar em inglês (é como
   aparece no Ads Manager), mas todo lugar que o mostra deve ter a glosa a
   um clique de distância, nunca só na primeira vez. "Conversão LP" pode
   perder a abreviação "LP" (nada mais no produto abrevia "página" assim) a
   favor de algo como "Conversão na página".
3. **Quando usar termo técnico + explicação:** sempre que o termo aparecer
   fora do contexto onde a pessoa acabou de aprendê-lo. Não é preciso
   reescrever a frase toda — um `FieldHint` (ou equivalente) ao lado do
   rótulo já resolve, contanto que exista em TODA tela, não só na primeira.
4. **Como escrever alertas/recomendações/diagnósticos:** a sigla pode
   continuar a mesma, mas a frase ao redor tem que sustentar sentido sozinha
   para quem não sabe o termo — a mudança geralmente é de POSIÇÃO/PRESENÇA
   do apoio (ter um `?` por perto), não de reescrever o texto do engine
   inteiro.
5. **Consistência terminológica entre telas:** o mesmo campo de dado usa o
   mesmo rótulo em toda tela onde aparece pro usuário. Isso é checável
   objetivamente (§6).

## 4. Glossário

| Termo atual | Problema identificado | Termo recomendado | Explicação (pra usar em tooltip) | Onde usar | Exemplo de uso correto | Evitar |
|---|---|---|---|---|---|---|
| CPA | Sem explicação fora do formulário | Manter "CPA" | "Quanto custou, em média, cada conversão gerada." | Toda tela que mostra CPA | "CPA `[?]` R$ 40,00" | Traduzir pra "custo por venda" (perde correspondência com o Ads Manager) |
| ROAS | Idem | Manter "ROAS" | "Quanto voltou em receita para cada R$1 investido." | Toda tela que mostra ROAS | "ROAS `[?]` 4,0x" | — |
| CPM / CPC / CPL | Idem | Manter | (mesmo texto já usado no `FieldHint` do formulário) | Toda tela que mostra a métrica | — | — |
| CTR Link / CTR Todos | Idem | Manter | (mesmo texto já usado no `FieldHint`) | Idem | — | — |
| Hook Rate / Hold Rate | Sem explicação fora do formulário; nomenclatura menos universal que CPA/ROAS | Manter o termo, reforçar a glosa | "De quem viu o anúncio, quantos assistiram os 3s iniciais" / "quantos ficaram até a metade" | Toda tela | — | Traduzir pro português (o termo real no Ads Manager é em inglês) |
| Conversão LP | Abreviação "LP" inconsistente com o resto do produto | "Conversão na página" | "Das pessoas que abriram sua página, quantas converteram." | `MetricFeed.tsx`, `service.py` | — | Manter "LP" solto sem explicar que é "landing page" |
| "Investimento" (resultado) vs "Gasto" (formulário) | Mesmo dado (`spend`), dois rótulos | Escolher UM — sugestão: "Investimento" (já é o que a Faixa de resultado e o Resumo geral usam em mais lugares) | — | `NewCampaignModal.tsx` (trocar o label do campo) | — | Ter os dois nomes coexistindo |
| "Cobertura de dados X%" | Conceito do produto, não jargão de mercado, mas nunca explicado | Manter o texto, adicionar explicação | "Quanto das métricas possíveis a análise conseguiu usar — mais dado, mais confiança no veredito." | `CampaignDetail.tsx` | — | — |
| "Confiança alta/média/baixa" | Idem | Manter, adicionar explicação | "O quanto o diagnóstico pode ser levado ao pé da letra, dado o volume de dados recebido." | `CampaignDetail.tsx` | — | — |
| "Retargeting" (título curto Cenário K) | Termo técnico real, mas jargão de agência — não aparece nos painéis nativos | Considerar "Reimpacto de público" no título curto; manter "retargeting" no corpo do texto (já é usado por profissionais) | — | `service.py`, título do Cenário K | — | — |
| "Click-Bait" (título curto Cenário C) | Já popularizado fora do marketing | Manter | — | — | — | — |

## 5. Mapeamento de impacto

| Camada | Onde | O que muda |
|---|---|---|
| **Frontend** | `MetricFeed.tsx` | Cada rótulo de métrica ganha um `FieldHint` (ou variante) ao lado |
| | `CampaignDetail.tsx` | Linha de cobertura/confiança ganha explicação (tooltip ou texto de apoio) |
| | `NewCampaignModal.tsx` | Label do campo `spend` alinhado com o nome escolhido na Faixa de resultado |
| | `components/FieldHint.tsx` | ~~Precisa virar reaproveitável fora do contexto de formulário (hoje é acoplado ao layout do modal)~~ — **AFIRMAÇÃO ERRADA, corrigida ao executar o PR3**: `FieldHint` nunca teve acoplamento com o modal. O `position:fixed` é calculado a partir do rect do **próprio botão**, não do `.modal`; funciona em qualquer lugar do DOM. Nenhuma mudança foi necessária no componente. O que precisou de ajuste foi só o CSS do tooltip (`text-transform`/`letter-spacing` são herdados, e os rótulos fora do formulário são uppercase — ver PR3). |
| | `Copilot.tsx` (`buildReply`) | Templates de resposta passam a grudar uma glosa curta quando citam sigla pela primeira vez na frase |
| | `HelpCenter.tsx` | Avaliar uma 5ª entrada ou nota explicando que "o que cada número quer dizer" tem `?` ao lado dele na própria tela, em vez de duplicar aqui |
| **Backend** | `app/service/service.py` (`_METRIC_EVAL_CONFIG`, notas dos detectores) | Só texto dos templates — **nenhum threshold, cálculo ou condição muda** |
| | `app/service/service.py` (título curto do Cenário K) | Um `title` de string, sem tocar `_detect_*` |
| **Respostas da IA / prompts** | `app/service/prompts.py` | Instruir a IA a seguir o mesmo princípio (sigla + contexto) ao gerar `executive_summary`/`contextual_insights`/`risk_warnings` |
| **Tooltips** | `FieldHint.tsx` | Ver frontend acima |
| **Cards** | `CampaignCard.tsx` | Já resolvido — nenhuma mudança necessária, serve de referência de padrão |
| **Diagnósticos** | `DiagnosisCards` (`DetailSections.tsx`) | Renderiza texto que vem do backend — muda só se o texto do backend mudar |
| **Recomendações** | `PriorityActions`/`Suggestions` (`DetailSections.tsx`) | Idem |
| **Relatórios** | — | Não aplicável — o produto não tem função de exportar relatório hoje |
| **Documentação** | `docs/CONTRATO_API_FRONTEND.md`, `README.md` | Não muda — esses documentam nomes de CAMPO internos (`spend`, `cpa`...), que não mudam, só o RÓTULO exibido ao usuário |

## 6. Critérios de aceitação

- [ ] Todo rótulo de métrica (CPA, ROAS, CPM, CPC, CPL, CTR Link, CTR Todos,
      Hook Rate, Hold Rate, Conversão na página, Frequência) tem uma
      explicação acessível em TODA tela onde aparece — não só no formulário.
- [ ] "Cobertura de dados" e "confiança" têm uma explicação de uma frase
      acessível em `CampaignDetail.tsx`.
- [ ] O campo de investimento/gasto usa o MESMO rótulo em toda tela visível
      ao usuário (formulário, Faixa de resultado, Resumo geral, mock).
- [ ] Nenhuma resposta do Copiloto usa sigla sem contexto que já apareça na
      mesma frase.
- [ ] Termos técnicos mantidos (CPA, ROAS, CPM, CPC, CPL, CTR) continuam
      idênticos aos usados pelas plataformas de anúncio reais — nenhum nome
      novo inventado pra eles.
- [ ] Suite de testes do backend (1457 testes) e do dashboard (369 testes,
      hoje) continuam passando sem alteração de comportamento — só de texto
      literal nos testes que hoje travam o texto exato de alguma nota.
- [ ] Nenhum threshold, fórmula, ordem de avaliação de cenário ou campo de
      schema muda como efeito desta revisão.

## 7. Fora de escopo

- Alterar lógica de negócio, cálculos, thresholds, regras de diagnóstico ou
  ordem de avaliação de cenário — **exceto** quando uma mudança textual
  exigir adaptação estritamente necessária (ex: um teste que trava o texto
  literal de uma nota precisa ser atualizado junto, mas isso é ajuste de
  teste, não de lógica).
- Renomear campos internos do schema/payload (`spend`, `cpa`, `roas`...) —
  só o RÓTULO de exibição muda, nunca o nome do campo que trafega entre
  frontend/backend/localStorage (mudar isso quebraria compatibilidade com
  dados já salvos).
- Criar uma função de "relatório exportável" — o produto não tem isso hoje,
  não é este PRD que introduz.
- Reescrita indiscriminada de texto — só os pontos listados no glossário
  (§4) e no mapeamento (§5) entram; texto que já está bom (ver "o que já
  está bem resolvido" em §1) não é tocado.

## 8. Plano de implementação — PRs pequenos e independentes

| PR | Escopo | Critério de conclusão | Risco |
|---|---|---|---|
| **1** | Unificar "Investimento"/"Gasto" — um nome só em toda tela | Rótulo idêntico em `NewCampaignModal.tsx`, `MetricFeed.tsx`, `mock.ts`; suite passa sem alteração de comportamento | Baixo — puramente textual |
| **2** | Explicar "cobertura de dados"/"confiança" em `CampaignDetail.tsx` | Tooltip ou texto de apoio visível ao lado da linha; validado ao vivo nos dois temas | Baixo |
| **3** | ~~Tornar `FieldHint` reaproveitável~~ (não foi preciso — ver acima) + aplicar no `MetricFeed.tsx` | Todo rótulo de métrica no feed tem `?` funcional (hover + foco, como já existe no formulário); teste de componente cobrindo | ~~Médio~~ **Baixo na prática** — o componente foi reaproveitado direto; só o CSS do tooltip precisou de reset de herança |
| **4** | Glosar sigla nas respostas do Copiloto (`buildReply`) | Templates de resposta revisados; testes de `Copilot.test.ts` atualizados com as novas frases | Baixo — muda só strings no frontend |
| **5** | Revisão dos templates de nota/diagnóstico do engine (`_METRIC_EVAL_CONFIG` e notas dos detectores em `service.py`) | Cada nota mantém o mesmo veredito/threshold, só ajusta o texto onde fizer sentido; suite backend (1457) passa; teste de mutação nos textos alterados | Médio-alto — mexe em backend, precisa de cuidado pra não tocar lógica por engano |
| **6** | Ajustar `prompts.py` pra pedir o mesmo padrão da IA | Prompt revisado; validado com 1-2 chamadas reais ao Gemini (dentro do limite de custo) mostrando texto com contexto | Baixo — só o prompt, não o parsing da resposta |
| **7** | Ajustes pontuais: título curto do Cenário K, renomear "Conversão LP" → "Conversão na página" | 2 strings trocadas; suite passa | Baixo |

Ordem sugerida: **1 → 2 → 3** (frontend puro, baixo risco, alto impacto per
§1 da auditoria) antes de **4 → 6** (Copiloto/IA) e **5 → 7** (backend,
maior cuidado). Cada PR é independente — não há dependência técnica entre
eles, só uma ordem de prioridade por impacto/risco.
