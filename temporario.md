Com base em tudo que discutimos até agora sobre:

* Context Governor / Context-Aware Execution;
* Cross-Agent Collaboration Protocol;
* auditoria cruzada;
* arquitetura consolidada;
* e principalmente os ajustes e decisões que acabamos de discutir sobre a implementação;

quero que você agora transforme o que foi decidido em uma **implementação concreta e mínima dentro do projeto**.

Não volte para uma nova exploração arquitetural ampla.

Antes de alterar arquivos, faça apenas uma consolidação curta contendo:

1. decisões finais que ficaram acordadas;
2. mudanças que serão implementadas agora;
3. mudanças que deliberadamente ficarão fora do MVP;
4. arquivos que serão criados;
5. arquivos que serão modificados;
6. arquivos existentes que serão reutilizados em vez de duplicados.

Se existir alguma divergência entre a proposta original e o que discutimos posteriormente, **as decisões mais recentes da nossa discussão têm prioridade**.

Depois dessa consolidação, prossiga com a implementação sem pedir nova confirmação, desde que não exista um bloqueio real.

## Objetivo do MVP

Quero que Claude Code e Codex consigam trabalhar no mesmo projeto com:

* estado compartilhado;
* continuidade entre sessões;
* consciência de contexto;
* milestones recuperáveis;
* handoff quando realmente necessário;
* ausência de territorialidade sobre commits e alterações;
* proteção contra sobrescrever trabalho desconhecido;
* repository state como fonte principal de verdade;
* separação entre documentação permanente e estado operacional temporário.

## Princípios obrigatórios

### 1. Shared repository ownership

Nenhum agente é dono de código, arquivos ou commits.

Claude e Codex podem ter papéis preferenciais, mas o estado atual pertence ao projeto.

Autoria é metadata.

Responsabilidade sobre o estado atual é compartilhada.

### 2. Repository reality first

Quando houver conflito, usar como referência:

Repository state
→ tests
→ git diff/history
→ architecture / decisions
→ active PRD
→ shared operational state
→ handoff
→ agent memory

Nunca confiar cegamente em STATE ou HANDOFF.

### 3. Unknown changes are preserved until understood

Ao encontrar alterações que o agente não reconhece:

* inspecionar;
* entender;
* validar;
* comparar com requisitos;
* só então modificar.

Nunca reverter, sobrescrever ou apagar trabalho apenas porque foi produzido por outro agente.

### 4. Context-aware execution

Antes de iniciar uma unidade significativa de trabalho, considerar:

* trabalho restante;
* tamanho do próximo milestone;
* contexto disponível quando essa informação estiver acessível;
* risco de deixar o repositório em estado intermediário.

Quando houver pressão de contexto:

* reduzir escopo;
* terminar a menor unidade segura;
* validar;
* persistir estado;
* criar handoff somente se realmente necessário.

Não criar falsa precisão de porcentagens se não houver dados confiáveis.

### 5. Atomic work

Preferir:

implement
→ validate
→ checkpoint
→ continue

em vez de mudanças transversais enormes antes de testar.

### 6. Estado operacional não é development log

Não registrar cada comando ou pequena alteração.

Persistir apenas aquilo necessário para continuidade:

* milestone atual;
* concluído;
* pendente;
* decisões temporárias relevantes;
* testes;
* blockers;
* próximo passo exato.

### 7. Minimal infrastructure

Não construir agora:

* daemon;
* serviço externo;
* dashboard;
* banco próprio;
* sistema complexo de telemetria;
* automação pesada;
* orquestrador sofisticado;

a menos que algo disso tenha sido explicitamente aprovado na nossa discussão.

O MVP deve funcionar primeiro principalmente através das regras, estrutura e estado compartilhado do próprio repositório.

## Integração Claude Code ↔ Codex

As instruções devem levar os agentes a pensar em:

* current implementation;
* current repository state;
* active task;
* current workflow stage;

e evitar mentalidade como:

* "my changes";
* "Codex's files";
* "Claude's implementation";
* "that wasn't my task";

quando autoria não for tecnicamente relevante.

Especialização não significa propriedade exclusiva.

## AGENTS.md e CLAUDE.md

Evite copiar blocos enormes idênticos para os dois arquivos.

As regras devem ficar no local de maior autoridade possível.

Se existir uma regra compartilhada que possa ser referenciada de maneira simples, prefira uma fonte única.

AGENTS.md e CLAUDE.md devem conter apenas as instruções necessárias para garantir que cada agente realmente siga o protocolo.

Não transforme esses arquivos em documentação arquitetural gigantesca.

## Compatibilidade com a política de documentação existente

Respeite a classificação já existente no projeto:

* instruções globais de agente → AGENTS.md / CLAUDE.md;
* arquitetura → docs/architecture/;
* decisões arquiteturais → docs/decisions/;
* feature planejada → prds/active/;
* PRD concluído → prds/completed/.

Estado transitório de execução não deve contaminar essas categorias.

## Durante a implementação

Antes de modificar:

* git status;
* diff atual;
* branch atual;
* arquivos relevantes;
* documentação existente.

Preserve trabalho não relacionado.

Faça alterações pequenas e verificáveis.

Depois de cada unidade relevante:

* valide;
* execute testes apropriados;
* verifique se não introduziu inconsistências.

## Ao finalizar

Faça uma auditoria da própria implementação.

Verifique:

1. se existem regras duplicadas;
2. se Claude e Codex recebem instruções incompatíveis;
3. se alguma regra incentiva territorialidade;
4. se STATE/HANDOFF/TASKS possuem responsabilidades sobrepostas;
5. se existe documentação operacional demais;
6. se o sistema consegue sobreviver a uma nova sessão;
7. se outro agente consegue assumir a tarefa lendo o repositório;
8. se alterações desconhecidas estão protegidas;
9. se contexto é tratado como orçamento sem depender de precisão inexistente;
10. se o MVP ficou menor ou igual ao necessário.

Execute os testes relevantes.

Depois entregue um relatório final contendo:

### Implementado

O que entrou no projeto.

### Arquivos alterados

Arquivo → finalidade da alteração.

### Comportamento resultante

Como Claude e Codex devem operar agora.

### Validação

Testes e verificações executadas.

### Fora do MVP

O que foi propositalmente deixado para depois.

### Riscos restantes

Problemas ainda possíveis.

### Próxima evolução recomendada

Somente a evolução imediatamente posterior que faça sentido após testarmos o MVP em uso real.

Não implemente funcionalidades futuras apenas porque seriam interessantes.

O objetivo desta etapa é sair com um **MVP pequeno, funcional e testável em sessões reais de Claude Code + Codex**.
