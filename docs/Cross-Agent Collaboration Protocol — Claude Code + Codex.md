# Cross-Agent Collaboration Protocol

> **Proposta original, superada em parte pela discussão de 2026-09-07.**
> Política vigente em [CLAUDE.md](../CLAUDE.md): usuário coordena, Claude é
> executor principal e Codex revisor/auditor/gerador de planos por padrão.
> Não foram criados arquivos operacionais adicionais. Hierarquias e diretórios
> sugeridos abaixo não substituem as decisões consolidadas.

## 1. Objetivo

Estabelecer um modelo de colaboração entre Claude Code e Codex no qual ambos trabalhem sobre o mesmo estado do projeto sem comportamento territorial em relação a:

- commits;
- arquivos;
- alterações;
- bugs;
- decisões;
- tarefas;
- implementações feitas pelo outro agente.

Claude Code e Codex devem ser tratados como agentes diferentes operando sobre **um único workspace compartilhado**.

O projeto pertence ao sistema de desenvolvimento, não a um agente específico.

---

# 2. Princípio fundamental

Adotar:

```text
Shared Repository Ownership
```

Regra:

> Any committed or uncommitted state present in the repository is part of the current project state regardless of which agent produced it.

Portanto:

```text
"Eu não fiz essa alteração."
```

pode ser relevante como informação histórica.

Mas não pode ser usado como justificativa para:

```text
"Então não vou analisar."
"Não é minha responsabilidade."
"Essa parte pertence ao outro agente."
```

O comportamento esperado é:

```text
"I did not create this change, but it is part of the current repository state.
I will evaluate it according to the project's requirements."
```

---

# 3. Separar autoria de responsabilidade

Existem duas coisas diferentes:

```text
AUTHORSHIP
Quem produziu a alteração.

RESPONSIBILITY
Quem precisa lidar com o estado atual.
```

Autoria pode ser útil para:

- auditoria;
- rastreamento;
- investigação de regressões;
- entender intenção histórica.

Mas responsabilidade é compartilhada.

Exemplo:

```text
Codex implementou endpoint.
Claude encontrou bug.

Claude não deve dizer:
"Não foi minha implementação."

Claude deve:
1. verificar o comportamento;
2. identificar o problema;
3. documentar evidência;
4. corrigir caso esteja autorizado;
   ou
5. encaminhar para o executor.
```

---

# 4. Regra de realidade compartilhada

A fonte de verdade é:

```text
Current Repository State
```

e não:

```text
Claude's previous context
Codex's previous context
conversation history
agent memory
```

Hierarquia:

```text
Repository State
      ↓
Tests
      ↓
Git Diff
      ↓
Git History
      ↓
Architecture / Decisions
      ↓
Active PRD
      ↓
STATE / HANDOFF
      ↓
Agent Memory
```

---

# 5. Regra para alterações desconhecidas

Quando um agente encontrar uma alteração que não reconhece, ele não deve automaticamente:

- desfazer;
- sobrescrever;
- ignorar;
- classificar como erro;
- declarar que "não é sua tarefa".

Ele deve primeiro investigar.

Fluxo:

```text
Unknown Change
      ↓
Inspect diff
      ↓
Inspect surrounding code
      ↓
Check tests
      ↓
Check PRD / architecture
      ↓
Check git history if necessary
      ↓
Determine intent
```

Somente depois decidir:

```text
KEEP
FIX
REFACTOR
REVERT
ASK FOR REVIEW
```

---

# 6. Non-Territorial Agent Policy

Claude Code e Codex não possuem arquivos exclusivos.

Evitar mentalidade:

```text
Claude files
Codex files
```

Preferir:

```text
Project files
```

Da mesma forma, evitar:

```text
Claude implementation
Codex implementation
```

quando autoria não for material.

Preferir:

```text
current implementation
current branch
current behavior
current architecture
```

---

# 7. Linguagem recomendada

Evitar respostas como:

```text
This was not implemented by me.

This commit was made by another agent.

I wasn't responsible for this task.

Codex changed this.

Claude introduced this.
```

quando essas informações não forem necessárias.

Preferir:

```text
The current implementation does X.

The repository currently contains Y.

This change appears inconsistent with the active PRD.

The latest commit introduced behavior Z.

The current diff affects these components.
```

A análise deve ser centrada no **estado do sistema**, não na identidade do agente.

---

# 8. Quando mencionar autoria

Autoria pode ser mencionada quando for tecnicamente relevante.

Exemplos:

### Investigação de regressão

```text
Commit A introduced behavior X.
Commit B changed it to Y.
```

### Handoff

```text
Codex completed backend implementation.
Claude review is pending.
```

### Auditoria

```text
Implementation completed by executor.
Review completed by reviewer.
```

Nesse caso autoria representa função, não território.

---

# 9. Papéis dos agentes

O sistema pode manter especialização.

Exemplo:

```text
Claude Code
├── review
├── architecture
├── auditing
├── requirements
├── edge cases
└── validation

Codex
├── implementation
├── refactoring
├── tests
├── debugging
└── execution
```

Mas papéis representam:

```text
default responsibility
```

e não:

```text
exclusive ownership
```

Claude pode corrigir código.

Codex pode revisar arquitetura.

A especialização serve para aumentar eficiência, não criar barreiras.

---

# 10. Shared Task Model

Todas as tarefas devem pertencer ao projeto.

Evitar:

```yaml
task:
  owner: codex
```

como propriedade rígida.

Preferir:

```yaml
task:
  role: executor
  primary_agent: codex
  reviewer: claude
  status: in_progress
```

Ou:

```yaml
task:
  execution_role: implementation
  review_role: architecture
```

Assim a tarefa pertence ao workflow.

---

# 11. Lifecycle de uma tarefa

Modelo recomendado:

```text
PRD
 ↓
Planning
 ↓
Executor
 ↓
Implementation
 ↓
Tests
 ↓
Reviewer
 ↓
Findings
 ↓
Executor / Reviewer fixes
 ↓
Validation
 ↓
Done
```

O agente que recebe a tarefa seguinte deve assumir o estado atual.

Não deve reconstruir territorialidade.

---

# 12. Shared State

Adicionar ao estado compartilhado:

```yaml
active_task:
  id: vocabulary-refactor
  status: implementation

workflow:
  executor: codex
  reviewer: claude

last_action:
  type: implementation
  result: completed

next_action:
  type: review
```

Isso é superior a:

```yaml
codex_task:
claude_task:
```

porque o objeto principal continua sendo a tarefa.

---

# 13. Agent Handoff

O handoff não deve parecer uma conversa entre duas pessoas.

Evitar:

```text
Codex, eu fiz isso.
Agora faça aquilo.
```

Preferir estrutura neutra:

```text
CURRENT STATE

Completed:
...

Remaining:
...

Known risks:
...

Next action:
...

Validation:
...
```

Assim qualquer agente pode assumir.

---

# 14. Commits

Commits representam checkpoints do projeto.

Não representam posse.

Regra:

> A commit is a repository checkpoint, not an agent ownership boundary.

Ao encontrar commit produzido por outro agente:

```text
inspect
understand
validate
continue
```

e não:

```text
not mine
ignore
```

---

# 15. Uncommitted Changes

Mudanças não commitadas devem receber atenção especial.

Nunca presumir:

```text
unknown diff = unwanted diff
```

Antes de alterar:

```text
git status
git diff
```

Determinar:

- se faz parte da tarefa atual;
- se está incompleta;
- se possui testes;
- se contradiz documentação;
- se pode ser preservada.

---

# 16. Do Not Destroy Unknown Work

Regra crítica:

> Never overwrite, reset, revert, delete, or replace unfamiliar work solely because the current agent did not create it.

Antes de operações destrutivas:

```text
inspect
understand
validate
```

Isso reduz conflitos Claude ↔ Codex.

---

# 17. Conflict Resolution

Quando Claude e Codex chegarem a conclusões diferentes, a autoridade não deve ser:

```text
Claude wins
```

nem:

```text
Codex wins
```

Utilizar evidência.

Ordem:

```text
Requirements / PRD
        ↓
Architecture Decision
        ↓
Tests
        ↓
Observable Behavior
        ↓
Repository Evidence
        ↓
Agent Recommendation
```

Nenhum agente possui autoridade pela identidade.

---

# 18. Reviewer Behavior

O reviewer deve analisar o projeto como um todo.

Claude, ao revisar implementação do Codex:

Não:

```text
This wasn't my implementation.
```

Sim:

```text
I reviewed the current implementation against:
- PRD
- architecture
- tests
- expected behavior
```

Se encontrar problema:

```text
Finding
Evidence
Impact
Recommended Fix
Severity
```

---

# 19. Executor Behavior

O executor também deve analisar descobertas do reviewer criticamente.

Codex não deve simplesmente executar qualquer comentário do Claude.

Fluxo:

```text
Reviewer Finding
      ↓
Verify evidence
      ↓
Check repository
      ↓
Confirm requirement
      ↓
Implement if valid
```

Isso evita:

```text
Claude says X
→ Codex blindly changes X
```

---

# 20. Shared Decision Protocol

Decisões permanentes importantes não devem existir somente em conversa.

Se uma decisão afetar arquitetura:

```text
docs/decisions/
```

Se for conhecimento arquitetural:

```text
docs/architecture/
```

Se for feature planejada:

```text
prds/active/
```

Se for estado temporário:

```text
.ai/STATE.md
```

---

# 21. Agent Identity Should Be Weak

A identidade do agente deve influenciar:

```text
specialization
```

mas não:

```text
ownership
```

Modelo mental:

```text
Bad

Claude Workspace
      ↕
Codex Workspace


Good

        PROJECT
       /       \
   Claude     Codex
 reviewer    executor
       \       /
      Shared State
```

---

# 22. Cross-Agent Awareness

Ao iniciar trabalho, cada agente deve assumir que:

- outro agente pode ter trabalhado desde a sessão anterior;
- arquivos podem ter mudado;
- commits podem ter aparecido;
- documentação pode ter sido atualizada;
- testes podem estar diferentes.

Portanto, antes de tarefas significativas:

```text
inspect current repository state
```

Nunca assumir:

```text
repository == last remembered state
```

---

# 23. Session Bootstrap

Toda nova sessão deve executar conceitualmente:

```text
1. Read global instructions.
2. Read active task.
3. Read shared state.
4. Inspect git status.
5. Inspect relevant recent changes.
6. Verify current branch.
7. Identify current task stage.
8. Continue from repository reality.
```

---

# 24. Session Handoff

Ao finalizar sessão relevante:

```text
1. Update state.
2. Record unresolved issues.
3. Record tests.
4. Record current milestone.
5. Record exact next action.
6. Leave repository recoverable.
```

O agente não precisa escrever:

```text
I did this.
```

Preferir:

```text
Completed this session:
```

---

# 25. Relação com Context Governor

O Cross-Agent Collaboration Protocol deve trabalhar em conjunto com o Context Governor.

```text
              ORCHESTRATION
                    │
       ┌────────────┴────────────┐
       │                         │
Context Governor       Collaboration Protocol
       │                         │
Context budget            Shared ownership
Checkpoints               Agent roles
Handoff                   Conflict rules
Task sizing               Repository truth
       │                         │
       └────────────┬────────────┘
                    │
               Shared State
                    │
          ┌─────────┴─────────┐
          │                   │
        Claude              Codex
```

---

# 26. Possível estrutura

Não implementar automaticamente sem antes comparar com a estrutura existente.

Estrutura conceitual:

```text
.ai/
├── STATE.md
├── TASKS.md
├── HANDOFF.md
└── protocols/
    ├── CONTEXT.md
    └── COLLABORATION.md
```

Instruções permanentes continuam em:

```text
CLAUDE.md
AGENTS.md
```

Enquanto protocolos detalhados podem ficar em documentação dedicada.

---

# 27. Regra para CLAUDE.md

Adicionar algo equivalente a:

```markdown
## Shared Repository Ownership

You operate in a repository that may also be modified by other agents.

Treat all current repository state as shared project state regardless of
which agent produced it.

Do not reject, ignore, or distance yourself from code because you did not
write it.

When encountering unfamiliar changes:

1. inspect them;
2. understand their intent;
3. compare them with requirements and architecture;
4. validate them;
5. then decide whether to preserve, modify, or report them.

Agent authorship is metadata, not an ownership boundary.

Never overwrite or revert unfamiliar work solely because another agent
created it.

Reason about "the current implementation", not "my implementation" versus
"the other agent's implementation".
```

---

# 28. Regra para AGENTS.md

Adicionar política equivalente:

```markdown
## Multi-Agent Repository Policy

This repository is a shared workspace.

Other agents may modify files, create commits, implement features, review
code, or update documentation between sessions.

Always reason from the current repository state.

Do not assume unfamiliar changes are incorrect or outside your
responsibility.

Before modifying unfamiliar work:

- inspect the diff;
- understand the intent;
- verify requirements;
- run relevant validation.

Commits represent project checkpoints, not agent ownership.

Primary agent assignments indicate specialization, not exclusive control
of a task or file.
```

---

# 29. Resultado esperado

O comportamento desejado deixa de ser:

```text
Claude:
"Codex fez isso, então não sei."

Codex:
"Claude mudou aquilo, então não vou tocar."
```

e passa a ser:

```text
Claude:
"The current implementation contains X.
It conflicts with requirement Y.
Here is the evidence."

Codex:
"Confirmed.
The current implementation should be changed in Z.
Applying correction."
```

O projeto vira o ponto central.

Os agentes tornam-se participantes substituíveis do workflow.

---

# 30. Princípio final

A regra central do sistema deve ser:

> Agents do not own code. The project owns state.

Claude e Codex podem ter papéis diferentes.

Podem ter especializações diferentes.

Podem produzir commits diferentes.

Mas devem compartilhar:

```text
truth
state
responsibility
context
requirements
```

O resultado esperado é continuidade entre agentes sem territorialidade, perda de contexto ou transferência informal de responsabilidade.
