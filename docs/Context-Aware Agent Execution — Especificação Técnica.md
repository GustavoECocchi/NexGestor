# Context-Aware Agent Execution

> **Proposta original, superada em parte pela discussão de 2026-09-07.**
> Não executar este documento como política. MVP vigente: seção
> "Execução compartilhada e continuidade" em [CLAUDE.md](../CLAUDE.md).
> Checkpoints ficam nas sessões; não foram adotados CSR, percentuais, `.ai/`
> ou STATE/TASKS/HANDOFF separados. Contexto da discussão preservado abaixo.

## 1. Objetivo

Implementar no projeto uma camada de controle de contexto para agentes de IA, especialmente Codex e Claude Code.

O objetivo é evitar que um agente:

- inicie uma tarefa grande sem contexto suficiente;
- seja interrompido no meio de uma implementação importante;
- perca decisões tomadas durante a sessão;
- dependa excessivamente do histórico da conversa;
- deixe código parcialmente implementado sem documentação;
- precise reconstruir todo o raciocínio em uma nova sessão.

A proposta é tratar **contexto disponível como um recurso operacional**, assim como tempo, memória ou orçamento computacional.

O agente deve comparar:

- contexto restante;
- progresso real da tarefa;
- complexidade do próximo milestone;
- quantidade de trabalho ainda pendente;
- estado atual do repositório.

Com base nisso, ele decide entre:

1. continuar normalmente;
2. reduzir escopo;
3. finalizar apenas a unidade de trabalho atual;
4. gerar checkpoint;
5. entrar em handoff mode.

---

# 2. Problema atual

Hoje um fluxo típico pode acontecer assim:

```text
Prompt
  ↓
Agente começa investigação
  ↓
Agente modifica arquitetura
  ↓
Agente implementa
  ↓
Agente testa
  ↓
Contexto começa a acabar
  ↓
Compactação / interrupção
  ↓
Parte do estado mental é perdida
```

Esse comportamento é especialmente perigoso em tarefas que envolvem:

- múltiplos arquivos;
- refatorações;
- alterações arquiteturais;
- PRDs extensos;
- debugging complexo;
- migrations;
- backend + frontend;
- testes;
- múltiplos agentes.

O problema não é simplesmente "falta de tokens".

O problema é iniciar uma **unidade de trabalho maior do que o orçamento de contexto disponível**.

---

# 3. Princípio

Antes de iniciar trabalho significativo, o agente deve estimar:

```text
Context Remaining
Work Remaining
Next Milestone Complexity
Repository State
```

O agente não precisa conhecer exatamente quantos tokens serão consumidos.

O sistema funciona como uma heurística operacional.

Exemplo:

```text
Task progress:       70%
Context remaining:   40%
Next task:           small
Risk:                low
```

Resultado:

```text
CONTINUE
```

Outro exemplo:

```text
Task progress:       45%
Context remaining:   18%
Next task:           architecture refactor
Risk:                critical
```

Resultado:

```text
DO NOT START

Finish current atomic unit.
Run tests.
Persist state.
Generate handoff.
```

---

# 4. Arquitetura proposta

Criar uma camada compartilhada dentro do projeto:

```text
.ai/
├── TASKS.md
├── STATE.md
├── HANDOFF.md
└── CONTEXT_POLICY.md
```

Opcionalmente:

```text
.ai/
├── context/
│   ├── TASKS.md
│   ├── STATE.md
│   ├── HANDOFF.md
│   └── POLICY.md
```

A estrutura final deve ser escolhida de acordo com a organização já existente no projeto.

Não criar arquivos redundantes caso já exista mecanismo equivalente.

---

# 5. Responsabilidade de cada arquivo

## 5.1 TASKS.md

Representa o mapa atual da tarefa.

Deve conter milestones, pesos e progresso.

Exemplo:

```yaml
feature: vocabulary-refactor

status: in_progress

milestones:
  - id: audit
    weight: 1
    status: done

  - id: terminology-map
    weight: 2
    status: done

  - id: backend
    weight: 5
    status: in_progress

  - id: frontend
    weight: 3
    status: pending

  - id: tests
    weight: 3
    status: pending

  - id: review
    weight: 2
    status: pending

weighted_progress: 42
```

O progresso não deve ser calculado simplesmente por quantidade de tarefas.

Exemplo incorreto:

```text
3 / 6 tasks = 50%
```

Isso não considera complexidade.

Utilizar progresso ponderado sempre que for possível.

---

# 6. Weighted Progress

Cada milestone recebe um peso aproximado.

Exemplo:

```text
Audit                  1
Data modeling          2
Backend implementation 5
Frontend               3
Tests                  3
Final review           2
```

Fórmula:

```text
completed_weight / total_weight
```

Exemplo:

```text
Completed:
Audit = 1
Data modeling = 2

Total = 16

Progress = 3 / 16
Progress ≈ 19%
```

Não é necessário que a estimativa seja matematicamente perfeita.

O objetivo é obter uma aproximação operacional superior a simplesmente contar tarefas.

---

# 7. STATE.md

`STATE.md` representa o estado atual recuperável da execução.

Exemplo:

```markdown
# Current State

## Active PRD

vocabulary-refactor

## Overall progress

62%

## Current milestone

Backend terminology mapping

## Completed

- terminology audit
- canonical vocabulary definition
- mapping schema
- parser adaptation

## In Progress

- campaign analysis translation layer

## Remaining

- API response adaptation
- frontend adaptation
- regression tests
- final review

## Files Modified

- app/services/vocabulary.py
- app/schema/campaign.py
- tests/test_vocabulary.py

## Tests

23 passing
2 pending

## Known Problems

- campaign serializer still returns legacy terminology
- frontend expects old metric names

## Last Safe Commit

82af31c

## Exact Next Action

Implement the campaign terminology serializer in:

app/services/vocabulary.py
```

Esse arquivo deve permitir que outro agente entenda rapidamente:

```text
onde estamos
+
o que foi feito
+
o que falta
+
qual é o próximo passo
```

sem precisar reconstruir toda a sessão anterior.

---

# 8. HANDOFF.md

`HANDOFF.md` deve ser produzido quando:

- o contexto estiver crítico;
- uma sessão estiver sendo encerrada;
- houver troca entre Codex e Claude;
- uma tarefa precisar continuar posteriormente;
- ocorrer compactação de contexto;
- o agente detectar risco de não concluir o próximo milestone.

Estrutura recomendada:

```markdown
# Agent Handoff

## Objective

Implement vocabulary refactor.

## Completed This Session

- canonical terminology mapping
- backend schema changes
- parser adaptation

## Current State

Backend implementation partially completed.

## Files Changed

- app/services/vocabulary.py
- app/schema/campaign.py

## Tests

23 passing
2 pending

## Unfinished Work

Campaign serializer still uses legacy naming.

## Important Decisions

- internal metric names remain unchanged
- translation happens only at presentation layer

## Do Not Change

- internal analytics engine
- database metric identifiers

## Next Exact Step

Update campaign serializer.

Then run:

pytest tests/test_vocabulary.py
```

Evitar textos genéricos como:

```text
Continue implementing the feature.
```

O próximo passo deve ser concreto.

---

# 9. CONTEXT_POLICY.md

Esse arquivo define como agentes devem reagir à pressão de contexto.

## Context > 50%

Estado:

```text
NORMAL
```

Comportamento:

- investigação permitida;
- implementação normal;
- refatorações permitidas;
- novas subtarefas podem ser iniciadas;
- exploração arquitetural permitida.

---

## Context entre 30% e 50%

Estado:

```text
CAUTION
```

Comportamento:

- reduzir exploração desnecessária;
- priorizar tarefa atual;
- evitar abrir múltiplas linhas de investigação;
- atualizar STATE.md após milestones importantes;
- considerar tamanho do próximo milestone.

---

## Context entre 15% e 30%

Estado:

```text
HANDOFF PREPARATION
```

Comportamento:

- não iniciar grandes refatorações;
- não iniciar novo milestone grande;
- terminar menor unidade segura de trabalho;
- executar testes relevantes;
- atualizar STATE.md;
- preparar HANDOFF.md;
- deixar repositório recuperável.

---

## Context < 15%

Estado:

```text
HANDOFF MODE
```

Comportamento obrigatório:

- não iniciar nova implementação significativa;
- não alterar arquitetura;
- não iniciar migration;
- não iniciar refatoração ampla;
- finalizar somente unidade atômica atual se seguro;
- executar testes possíveis;
- documentar estado;
- registrar problemas;
- registrar próximo passo;
- gerar handoff.

Objetivo:

```text
No unfinished invisible state.
```

---

# 10. Context Safety Ratio

Criar uma heurística opcional:

```text
CSR = Context Remaining / Work Remaining
```

Onde ambos são normalizados em porcentagem.

Exemplo:

```text
Context remaining = 60
Work remaining = 30

CSR = 60 / 30
CSR = 2.0
```

Estado confortável.

Outro caso:

```text
Context remaining = 25
Work remaining = 55

CSR = 25 / 55
CSR = 0.45
```

Estado de risco.

Referência inicial:

| CSR | Estado |
|---|---|
| > 1.5 | Comfortable |
| 1.0–1.5 | Normal |
| 0.6–1.0 | Attention |
| 0.3–0.6 | Prepare handoff |
| < 0.3 | Critical |

Esses valores são heurísticos e podem ser ajustados.

---

# 11. Next Milestone Complexity

O CSR sozinho não é suficiente.

Antes de iniciar uma tarefa, considerar também:

```text
Next Milestone Complexity
```

Classificação sugerida:

```text
XS
S
M
L
XL
```

Exemplo:

```text
XS
- alterar constante
- corrigir typo
- atualizar documentação

S
- corrigir função isolada
- adicionar teste
- alterar serializer

M
- novo endpoint
- novo service
- pequena feature

L
- refatoração envolvendo vários módulos
- nova integração
- migration

XL
- redesign arquitetural
- grande refatoração
- mudança transversal no sistema
```

Exemplo de decisão:

```text
Context remaining: 28%
Next task: S

→ pode executar.
```

```text
Context remaining: 28%
Next task: XL

→ não iniciar.
```

---

# 12. Atomic Work Units

Toda implementação significativa deve ser dividida em unidades recuperáveis.

Uma boa unidade atômica:

```text
implement
→ validate
→ test
→ persist state
```

Exemplo:

```text
Add serializer
↓
Run serializer tests
↓
Update state
↓
Next milestone
```

Evitar:

```text
Refactor whole backend
↓
Change schema
↓
Change database
↓
Change frontend
↓
Write tests later
```

Esse segundo modelo cria um estado intermediário muito perigoso.

---

# 13. Safe Checkpoints

Depois de milestones relevantes:

1. verificar diff;
2. rodar testes relacionados;
3. atualizar estado;
4. registrar decisões arquiteturais importantes;
5. garantir próximo passo explícito.

O checkpoint deve ser barato.

Não transformar documentação em development log.

Registrar apenas informações necessárias para continuidade.

---

# 14. Integração com CLAUDE.md

Adicionar uma regra global semelhante a:

```markdown
## Context-Aware Execution

Before starting substantial work:

1. identify the active task;
2. break it into atomic milestones;
3. estimate milestone complexity;
4. consider remaining context;
5. avoid starting work unlikely to fit safely.

When context pressure becomes high:

- finish the smallest safe unit;
- run relevant validation;
- update project state;
- create a handoff if necessary.

Never leave important implementation state only inside conversation context.
Persistent execution state must be recoverable from the repository.
```

---

# 15. Integração com AGENTS.md

O Codex deve seguir regra equivalente.

```markdown
## Execution Budget

Treat context as a finite execution resource.

Before starting a major milestone evaluate:

- current task progress;
- estimated remaining work;
- next milestone complexity;
- context remaining when available.

Prefer completing safe atomic units over starting work that may exceed
the current execution budget.

When context becomes constrained:

1. stop expanding scope;
2. finish the current safe unit;
3. validate changes;
4. persist execution state;
5. produce a precise handoff.
```

---

# 16. Claude + Codex

No workflow multi-agent:

```text
Claude
→ reviewer / auditor

Codex
→ executor
```

Nenhum deles deve depender da memória interna do outro.

A fonte compartilhada de verdade deve ser o repositório.

```text
                     PRD
                      │
                      ▼
                 TASKS.md
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
         CLAUDE               CODEX
        reviewer              executor
            │                   │
            └─────────┬─────────┘
                      ▼
                   STATE.md
                      │
                      ▼
                  HANDOFF.md
```

---

# 17. Regra de autoridade

Separar claramente tipos de documentação.

Exemplo:

```text
PRD
= o que precisa existir.

Architecture docs
= como o sistema foi desenhado.

TASKS.md
= como o trabalho foi dividido.

STATE.md
= onde a implementação está agora.

HANDOFF.md
= informação necessária para outra sessão/agente continuar.
```

Não permitir que `STATE.md` substitua documentação permanente.

Não permitir que `HANDOFF.md` vire histórico infinito.

---

# 18. Ciclo completo

Fluxo desejado:

```text
PRD
 ↓
Task decomposition
 ↓
Weighted milestones
 ↓
Estimate next milestone
 ↓
Check context pressure
 ↓
Execute atomic unit
 ↓
Validate
 ↓
Update state
 ↓
Check context again
 ↓
Continue
```

Quando necessário:

```text
Context pressure
 ↓
Stop scope expansion
 ↓
Finish current atomic unit
 ↓
Tests
 ↓
STATE update
 ↓
HANDOFF
 ↓
New session / compaction
 ↓
Read project state
 ↓
Continue
```

---

# 19. Comportamento em nova sessão

Ao iniciar nova sessão em tarefa existente:

1. ler instruções globais;
2. identificar PRD ativo;
3. ler STATE;
4. ler HANDOFF caso exista;
5. verificar estado real do Git;
6. não confiar cegamente na documentação;
7. confirmar se código e documentação estão sincronizados;
8. continuar pelo próximo passo.

Exemplo:

```text
Read:

AGENTS.md
.ai/TASKS.md
.ai/STATE.md
.ai/HANDOFF.md

Then inspect git diff and current repository state before continuing.
```

---

# 20. Estado real tem prioridade

Nunca assumir que `STATE.md` está correto.

Ordem de confiança:

```text
Repository reality
    ↓
Tests
    ↓
Git diff/history
    ↓
Architecture / PRD
    ↓
STATE.md
    ↓
HANDOFF.md
    ↓
conversation memory
```

Se houver conflito entre documentação transitória e código real:

```text
inspect
→ determine current truth
→ repair documentation
→ continue
```

---

# 21. Failure Modes

Durante a implementação, verificar riscos como:

### Falso progresso

Agente marca:

```text
80% complete
```

mas os últimos 20% concentram testes, integrações e edge cases.

Mitigação:

- weighted progress;
- milestone complexity;
- não usar porcentagem isoladamente.

### Handoff excessivo

Atualizar arquivos a cada pequena ação pode gerar overhead.

Mitigação:

Atualizar estado apenas:

- após milestone;
- antes de grande mudança;
- quando contexto ficar pressionado;
- no encerramento.

### Documentação obsoleta

STATE pode divergir do código.

Mitigação:

Nova sessão sempre verifica Git + testes antes de continuar.

### Context percentage unavailable

Alguns agentes podem não expor contexto restante de maneira confiável.

Mitigação:

O sistema deve funcionar mesmo sem valor exato.

Usar sinais como:

- duração da sessão;
- compactações;
- quantidade de arquivos analisados;
- volume de conversa;
- complexidade restante.

Nunca bloquear execução por falta da métrica.

---

# 22. Não criar falsa precisão

Evitar:

```text
Task completion = 67.284%
```

Utilizar:

```text
~65%
```

ou estados:

```text
early
mid
advanced
near-complete
```

O sistema é um mecanismo de decisão, não uma ferramenta de project management precisa.

---

# 23. Possível evolução futura

A implementação inicial pode ser apenas documental.

Posteriormente, estudar automação.

Possíveis evoluções:

```text
Context Governor
```

responsável por:

- interpretar contexto restante;
- ler milestones;
- calcular progresso;
- estimar pressão de execução;
- decidir se novo milestone pode começar;
- atualizar STATE automaticamente;
- gerar HANDOFF;
- mostrar informações na CLI.

Possível visualização:

```text
Agent: Codex
Model: GPT-5.6
Task: vocabulary-refactor

TASK
██████████████░░░░░░  70%

CONTEXT
████████░░░░░░░░░░░░  40%

NEXT
Serializer refactor [S]

CSR
0.40 / 0.30 = 1.33

STATUS
NORMAL
```

---

# 24. Context Governor

Nome provisório para a camada:

```text
Context Governor
```

Responsabilidades:

```text
Context Governor
│
├── Progress Tracking
├── Context Pressure
├── Milestone Complexity
├── Safe Checkpoints
├── State Persistence
└── Agent Handoff
```

O Governor não deve decidir arquitetura de produto.

Ele apenas governa **como o trabalho é executado com segurança**.

---

# 25. MVP recomendado

Não começar criando uma ferramenta complexa.

Primeira versão:

```text
1. política em AGENTS.md
2. política equivalente em CLAUDE.md
3. TASKS.md
4. STATE.md
5. HANDOFF.md
```

Validar esse workflow manualmente.

Somente depois avaliar automação.

Isso evita construir infraestrutura antes de saber se o modelo operacional funciona.

---

# 26. Critérios de sucesso

A solução será considerada bem-sucedida se:

- uma nova sessão conseguir continuar a implementação sem reconstruir toda a conversa;
- Claude e Codex conseguirem trocar tarefas através do estado persistido;
- agentes evitarem iniciar mudanças grandes quando o contexto estiver pressionado;
- nenhuma decisão importante existir apenas no histórico do chat;
- milestones puderem ser retomados de forma objetiva;
- testes e estado atual estiverem claros durante handoff;
- arquivos temporários não se transformarem em documentação permanente desorganizada.

---

# 27. Solicitação ao Codex

Antes de implementar qualquer coisa, realizar uma auditoria desta proposta dentro do projeto atual.

## Investigar

1. estrutura atual do repositório;
2. AGENTS.md existente;
3. CLAUDE.md existente;
4. documentação já existente;
5. PRDs;
6. mecanismos atuais de tarefas;
7. possíveis arquivos redundantes;
8. regras de documentação existentes;
9. workflow atual Claude ↔ Codex;
10. possibilidade real de obter métricas de contexto no ambiente atual.

## Responder

Produzir análise contendo:

```text
1. O que já existe no projeto que atende esta proposta.
2. O que falta.
3. O que seria redundante.
4. Onde cada responsabilidade deveria morar.
5. Estrutura de diretórios recomendada.
6. Mudanças necessárias em AGENTS.md.
7. Mudanças necessárias em CLAUDE.md.
8. Quais partes podem ser automatizadas.
9. Quais partes devem continuar heurísticas.
10. Riscos e edge cases.
11. MVP recomendado.
12. Evoluções futuras possíveis.
```

## Restrição

Não implementar imediatamente.

Primeiro analisar o projeto real e confrontar esta especificação com a arquitetura existente.

Evitar criar:

- documentação duplicada;
- abstrações desnecessárias;
- novos sistemas quando mecanismo equivalente já existir.

Ao final da análise, propor o menor conjunto de mudanças capaz de atingir o objetivo.

---

# 28. Pergunta principal da auditoria

A auditoria deve responder:

> Como podemos fazer Codex e Claude Code administrarem o próprio orçamento de contexto em relação ao trabalho restante, preservando estado suficiente para que tarefas longas possam atravessar múltiplas sessões sem perda significativa de continuidade, segurança ou eficiência?

O foco principal não é maximizar uso de tokens.

O foco é:

```text
safe execution
+
recoverable state
+
controlled scope
+
efficient handoff
```
