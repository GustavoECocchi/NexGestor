> **Proposta histórica, não normativa.** Não executar este texto como política.
> A fonte única é [CLAUDE.md](../../../CLAUDE.md); regras conflitantes foram
> substituídas pela política consolidada. Corpo preservado como referência.

# Lifecycle de Desenvolvimento

## 1. Objetivo

Definir um fluxo previsível para transformar uma demanda em implementação validada sem depender da memória do mantenedor.

O ciclo deve deixar claro:

- onde a tarefa está;
- o que falta;
- o que já foi decidido;
- quem executa;
- quem revisa;
- quando pode avançar;
- quando deve parar.

---

## 2. Estados oficiais

Toda tarefa/PRD deve estar em um único estado principal:

1. `DISCOVERY`
2. `READY`
3. `IN_PROGRESS`
4. `IMPLEMENTED`
5. `UNDER_REVIEW`
6. `FIX_REQUIRED`
7. `VALIDATED`
8. `DONE`
9. `BLOCKED`
10. `CANCELLED`

---

## 3. DISCOVERY

Objetivo: entender o problema antes de implementar.

Deve conter:

- problema;
- motivação;
- escopo;
- fora de escopo;
- riscos;
- dependências;
- impacto arquitetural;
- critérios de aceite;
- critérios de sucesso;
- perguntas abertas.

Não implementar nesta fase, salvo protótipo explicitamente autorizado.

---

## 4. READY

Uma tarefa só entra em `READY` quando:

- escopo está claro;
- critérios de aceite existem;
- dependências críticas estão resolvidas;
- não há ambiguidade material;
- impacto em contratos foi identificado;
- estratégia de teste está definida.

---

## 5. IN_PROGRESS

Durante a implementação:

- seguir o escopo aprovado;
- evitar mudanças laterais;
- registrar descobertas;
- classificar novos achados;
- atualizar checkpoints;
- não reescrever arquitetura sem decisão explícita.

Se surgir um crítico externo ao escopo, a tarefa pode mudar para `BLOCKED`.

---

## 6. IMPLEMENTED

Significa somente:

> O código previsto foi produzido.

Não significa que a tarefa está concluída.

Para entrar nesse estado:

- implementação terminou;
- código compila/roda;
- testes locais relevantes foram executados;
- nenhuma falha óbvia permanece.

---

## 7. UNDER_REVIEW

A revisão deve verificar:

- aderência ao PRD;
- corretude funcional;
- corretude da lógica;
- contratos;
- regressões;
- segurança;
- edge cases;
- qualidade suficiente;
- impacto futuro.

A revisão não deve expandir arbitrariamente o escopo.

---

## 8. FIX_REQUIRED

Usar quando a revisão encontrou algo que precisa ser resolvido antes do aceite.

Toda correção deve apontar para um achado concreto.

Após corrigir:

- executar os testes relevantes;
- repetir somente as revisões necessárias;
- evitar reiniciar a auditoria completa sem justificativa.

---

## 9. VALIDATED

A tarefa entra em `VALIDATED` quando:

- critérios de aceite foram atendidos;
- testes obrigatórios passam;
- não há críticos;
- riscos médios estão destinados;
- contratos e documentação foram atualizados;
- não há divergência conhecida entre comportamento esperado e real.

---

## 10. DONE

`DONE` significa:

- implementação validada;
- documentação atualizada;
- checkpoints finais registrados;
- pendências residuais destinadas;
- PRD finalizado;
- contexto futuro preservado.

Nenhuma informação importante deve permanecer apenas no chat do agente.

---

## 11. Checkpoint obrigatório

Ao final de cada etapa relevante, registrar:

### Concluído
O que foi efetivamente resolvido.

### Não concluído
O que ficou pendente.

### Descobertas
O que foi identificado durante a execução.

### Decisões
O que mudou em relação ao plano inicial.

### Riscos residuais
O que ainda pode dar problema.

### Próxima ação recomendada
A ação objetiva seguinte.

---

## 12. Critério de parada

Um agente deve parar e pedir decisão quando:

- há duas soluções arquiteturais com trade-offs relevantes;
- regra de negócio está ambígua;
- existe risco de dados;
- escopo cresceu significativamente;
- a correção exigiria mexer em componente não previsto;
- testes contradizem a especificação;
- documentação e implementação entram em conflito;
- a ação pode apagar ou migrar dados;
- a tarefa exigiria mudança irreversível.

---

## 13. Critério de continuidade

O desenvolvimento pode continuar quando:

- não há crítico;
- testes relevantes passam;
- achados residuais estão classificados;
- o próximo passo é conhecido;
- nenhuma decisão humana pendente bloqueia a execução.

---

## 14. Limite de loops de revisão

Para evitar ciclo infinito:

1. implementação;
2. revisão;
3. correção dos bloqueadores;
4. revisão focada nos itens corrigidos;
5. aceite, caso não existam novos críticos.

Uma revisão de correção não deve reabrir toda a codebase sem justificativa.

Se novos achados não relacionados surgirem, registrar em backlog.

---

## 15. Janela de estabilização

Quando o backlog de médios/débitos crescer, criar uma janela de estabilização separada do roadmap de features.

Objetivos:

- reduzir débitos;
- fechar bugs médios;
- melhorar testes;
- consolidar contratos;
- simplificar áreas frágeis.

Não misturar essa janela silenciosamente com PRDs de produto.

---

## 16. Definição de pronto

Uma feature não está pronta porque “o agente terminou”.

Está pronta quando:

- comportamento esperado foi validado;
- riscos estão conhecidos;
- documentação foi sincronizada;
- o estado futuro do projeto ficou compreensível para outro agente.
