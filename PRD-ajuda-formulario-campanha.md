# PRD — Ajuda em linguagem simples no formulário "Criar campanha"

Status: **implementado em 2026-08-25** (`components/FieldHint.tsx` + `NewCampaignModal.tsx` + `style.css`), ainda não commitado. Escopo fechado para caber num único PR pequeno.

## 1. Problema

Feedback do time (2026-08-15, reforçado em 2026-08-24 e nesta sessão, 2026-08-24):
testando o dashboard sob a ótica de um cliente, "não fica claro como navegar, não
sabe como fazer a campanha". Missão do produto: alguém **sem nenhuma base de
marketing** precisa conseguir rodar campanhas com ajuda do NexGestor.

Investigação nesta sessão (rodando o dashboard local e lendo
`src/components/NewCampaignModal.tsx`) isolou o ponto exato: o formulário
"Criar nova campanha" (aba **Inserir manual**) tem ~20 campos —
`Impressões, Gasto, CPM, CPC, CPA, CPL, ROAS, Hook rate, Hold rate, CTR link,
CTR todos, Frequência, Conversões, Cliques no link, Visitas à página,
Conversões/semana, Aprendizado limitado, CPA máx., CPL máx., CPM máx., ROAS mín.,
CTR link mín., Hook rate mín.` — e **nenhum tem explicação**. Confirmado por
inspeção visual e do código: são `<input>`/`<select>` com só `<label>{f.label}</label>`,
sem `title`, sem texto de apoio, sem ícone.

A aba **Importar arquivo** tem o mesmo problema em grau maior (exige JSON cru
com chaves de API), mas fica **fora deste PR** — ver §5.

## 2. Objetivo deste PR

Cada campo do modo manual passa a ter uma explicação curta, em português simples,
sem jargão de tráfego pago, acessível sem precisar já saber o que o campo significa.

**Não-objetivos** (explicitamente fora):
- Não muda quais campos existem, são obrigatórios, ou seus nomes/`key` — o
  contrato com o backend (`CONTRATO_API_FRONTEND.md`) não é tocado.
- Não muda validação, formatação numérica (`num()`, `normalizaCampo()`) nem o
  fluxo de análise (`runAnalyze`).
- Não mexe na aba "Importar arquivo", no bug de navegação da home (reload cair
  na campanha errada), nem em onboarding geral do dashboard.
- Não reordena nem agrupa campos de novo — grupos atuais (Identificação,
  Entrega & custo, Criativo & cliques, Metas) ficam como estão.

Isso é deliberado: é a fatia mínima que ataca a dor relatada sem tocar em lógica,
mantendo o PR pequeno e de baixo risco.

## 3. Formato da ajuda (decisão de design)

**Ícone `?` ao lado do label, com tooltip ao hover/focus/tap.**

- Reaproveita `IconInfo` (já existe em `components/Icons.tsx`, não é usado em
  lugar nenhum hoje — verificado por grep).
- Acessível: `aria-describedby` ligando o ícone ao texto, foco por teclado
  mostra o tooltip (não só hover), `role="tooltip"`.
- Por quê não texto sempre visível abaixo do campo: o formulário já é longo
  (~20 campos); dobrar a altura de cada campo pioraria exatamente o problema de
  "não sabe se navegar" ao forçar mais scroll. Um ícone compacto sinaliza "tem
  ajuda aqui" sem custar espaço permanente — troca válida porque o público-alvo
  já vai estar *procurando* ajuda ao chegar num campo que não entende.
- Componente novo, pequeno: `<FieldHint text="..." />`, usado dentro de cada
  `<label>`. Nenhuma dependência nova.

Se esse formato não performar bem no teste com o time (§6), a alternativa
(texto fixo abaixo do campo) fica registrada como plano B, não como parte deste PR.

## 4. Copy — texto de cada campo

Tom: frase curta, sem jargão, dizendo o que o número representa (e quando
possível, por que importa). Rascunho para revisão do time antes de implementar
— não é definitivo.

### Identificação
Sem ajuda — nome, objetivo e plataforma já são autoexplicativos.

### Entrega & custo
| Campo | Texto proposto |
|---|---|
| Impressões | Quantas vezes seu anúncio foi exibido, no total. |
| Gasto (R$) | Quanto você já investiu nessa campanha. |
| CPM | Quanto você paga a cada 1.000 exibições do anúncio. |
| CPC | Quanto você paga, em média, cada vez que alguém clica no anúncio. |
| CPA | Quanto custou, em média, cada conversão (venda, cadastro etc.) gerada. |
| CPL | Quanto custou, em média, cada lead (contato captado) gerado. |
| ROAS | Quanto voltou em receita para cada R$1 investido. 2x = dobrou o dinheiro investido. |

### Criativo & cliques
| Campo | Texto proposto |
|---|---|
| Hook rate (%) | De quem viu o anúncio, quantos assistiram pelo menos 3 segundos — mede se o começo prende atenção. |
| Hold rate (%) | De quem começou a assistir, quantos ficaram até a metade — mede se o anúncio segura o interesse. |
| CTR link (%) | De quem viu o anúncio, quantos clicaram para ir ao seu site/página. |
| CTR todos (%) | Como o CTR link, mas conta qualquer clique no anúncio (curtir, comentar, etc.), não só o link. |
| Frequência | Quantas vezes, em média, a mesma pessoa viu esse anúncio. Número alto pode cansar o público. |
| Conversões | Quantas vendas, cadastros ou outra ação que você definiu como meta já aconteceram. |
| Cliques no link | Quantas vezes clicaram para ir da sua página até seu site. |
| Visitas à página | Quantas dessas pessoas realmente abriram sua página de destino. |
| Conversões/semana | Quantas conversões essa campanha costuma gerar por semana. |
| Aprendizado limitado | As plataformas de anúncio (Meta, Google...) levam um tempo "aprendendo" o público ideal para sua campanha. Marque "Sim" se ela ainda está nessa fase inicial. Deixe "Não informado" se você não sabe. |

### Metas (targets)
| Campo | Texto proposto |
|---|---|
| CPA máx. | O quanto, no máximo, você aceita pagar por cada conversão antes de considerar caro. |
| CPL máx. | O quanto, no máximo, você aceita pagar por cada lead antes de considerar caro. |
| CPM máx. | O quanto, no máximo, você aceita pagar a cada 1.000 exibições antes de considerar caro. |
| ROAS mín. | O retorno mínimo que você espera para cada R$1 investido. |
| CTR link mín. (%) | A taxa mínima de cliques que você espera do anúncio. |
| Hook rate mín. (%) | A taxa mínima de "prendeu atenção nos 3s iniciais" que você espera. |

## 5. Fora de escopo — registrado para PRs futuros, não perder

- Aba "Importar arquivo" pedir JSON cru com chaves de API — inacessível para
  quem não é dev.
- Reload de `/` cair na última campanha vista em vez da home (bug de navegação
  achado nesta sessão).
- Onboarding geral / primeira visita ao dashboard.
- Reduzir a quantidade de campos obrigatórios, ou adicionar defaults/estimativas.

## 6. Como validar

- `tsc --noEmit` + `npm run build` limpos (mudança é só presentational).
- Teste manual: abrir "Criar campanha", conferir os ~20 tooltips por
  hover **e** por Tab (teclado), sem quebrar o layout do grid (`fld-grid`).
- Repetir o teste informal que gerou o feedback original: pedir para alguém do
  time (pensando como cliente leigo) preencher o formulário de novo e comparar
  a reação.

## 7. Riscos

- Risco: 20 tooltips no mesmo formulário pode virar ruído visual → Mitigação:
  ícone pequeno e discreto (mesmo padrão de "detalhe", não "alerta"); revisar
  visualmente antes de fechar o PR.
- Risco: copy imprecisa tecnicamente (ex: definição de Hook rate simplificada
  demais) → Mitigação: revisão do time antes de codar, já sinalizada como
  rascunho no §4.

## Referência

Entrevista estruturada (skill `grillme`) nesta sessão, 2026-08-24 — resumo e
achados de código documentados na conversa. Reforça o Ponto 1 já registrado em
`CLAUDE.md` (sessão de 2026-08-15, feedback do time + referência Reportei) e o
motivo do pivô extensão→dashboard (sessão de 2026-08-24, feedback do professor
+ referência Fuse React, `fuse-react-nextjs-demo.fusetheme.com`).
