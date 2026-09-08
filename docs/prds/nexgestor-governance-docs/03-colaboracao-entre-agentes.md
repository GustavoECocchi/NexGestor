# Colaboração entre Agentes — Claude Code, Codex/Astra e Mantenedor

## 1. Objetivo

Definir responsabilidades e handoffs entre os agentes usados no projeto.

O objetivo é evitar:

- retrabalho;
- disputa de ownership;
- mensagens como “isso não foi minha tarefa”;
- revisões que reimplementam;
- implementação sem contexto suficiente;
- decisões arquiteturais tomadas implicitamente;
- perda de informação entre sessões.

---

## 2. Papéis

### Claude Code — executor principal

Responsabilidades preferenciais:

- implementar tarefas aprovadas;
- executar testes;
- corrigir bugs bem definidos;
- atualizar arquivos diretamente relacionados;
- registrar checkpoints;
- comunicar descobertas;
- respeitar escopo.

Claude Code não deve assumir automaticamente que todo achado precisa ser corrigido.

---

### Codex/Astra — revisor, arquiteto e auditor

Responsabilidades preferenciais:

- revisar implementações;
- avaliar arquitetura;
- procurar inconsistências;
- investigar bugs complexos;
- questionar premissas;
- identificar riscos;
- sugerir prioridade;
- produzir planos ou prompts de correção;
- auditar documentação e governança.

Astra não deve transformar toda revisão em proposta de reescrita.

---

### Mantenedor humano — autoridade final

Responsabilidades:

- definir prioridade;
- aprovar trade-offs;
- aceitar risco;
- aprovar mudanças arquiteturais;
- decidir sobre mudanças de escopo;
- resolver ambiguidades de produto;
- aprovar adoção de políticas.

O mantenedor não deve precisar lembrar manualmente do estado inteiro do projeto.

---

## 3. Regra de ownership

Ownership pertence ao projeto, não ao agente.

Frases como:

- “não fui eu que implementei”;
- “isso foi feito por outro agente”;
- “essa alteração não é minha”;

não são justificativa para deixar de analisar ou corrigir um problema.

O agente deve trabalhar com o estado atual do repositório como fonte de verdade.

---

## 4. Handoff mínimo

Toda transferência entre agentes deve conter:

- tarefa;
- objetivo;
- estado atual;
- arquivos alterados;
- testes executados;
- resultado dos testes;
- decisões tomadas;
- achados abertos;
- riscos;
- próxima ação recomendada.

---

## 5. Claude → Astra

Ao pedir revisão ao Astra, fornecer:

- PRD;
- diff ou commits;
- critérios de aceite;
- testes;
- checkpoints;
- achados conhecidos.

Astra deve revisar contra esses elementos, não contra um escopo inventado.

---

## 6. Astra → Claude

Quando Astra encontrar problema que exige correção, deve gerar instrução executável com:

- problema;
- evidência;
- impacto;
- severidade;
- arquivos prováveis;
- comportamento esperado;
- restrições;
- testes que devem validar a correção;
- fora de escopo.

---

## 7. Revisão não é implementação

Por padrão:

- executor implementa;
- revisor revisa.

O revisor só deve implementar quando explicitamente solicitado.

Isso reduz alteração silenciosa de arquitetura e facilita rastreabilidade.

---

## 8. Fonte de verdade

Ordem de prioridade recomendada:

1. código e testes atuais;
2. contrato/API/schema vigente;
3. decisões arquiteturais aprovadas;
4. PRD ativo;
5. documentação de domínio/produto;
6. backlog;
7. conversas de agente.

Chat nunca deve ser a única fonte persistente de uma decisão importante.

---

## 9. Conflito entre fontes

Quando duas fontes divergem:

- não escolher silenciosamente;
- registrar a divergência;
- identificar qual deveria ser autoritativa;
- propor correção;
- pedir decisão se houver impacto material.

---

## 10. Alterações fora do escopo

Um agente pode corrigir fora do escopo apenas quando:

- é necessário para concluir corretamente a tarefa;
- a mudança é pequena e de baixo risco;
- existe justificativa clara.

Caso contrário:

- registrar achado;
- classificar;
- sugerir backlog/PRD;
- continuar a tarefa original.

---

## 11. Prompt de revisão recomendado

Ao revisar uma implementação:

> Revise a implementação exclusivamente contra o PRD, os critérios de aceite, os contratos vigentes e a arquitetura aprovada. Classifique cada achado por natureza e severidade. Não trate melhorias opcionais como bloqueadores. Não implemente alterações. Para cada achado, explique evidência, impacto, risco e recomendação. Ao final, conclua com APROVADO, APROVADO COM PENDÊNCIAS ou BLOQUEADO.

---

## 12. Prompt de execução recomendado

Ao executar uma correção:

> Implemente apenas os itens definidos nesta tarefa. Preserve o comportamento não relacionado. Se encontrar novo problema, classifique-o segundo a governança de achados e só amplie o escopo se ele for necessário para a corretude desta tarefa. Execute os testes relevantes ao final e registre checkpoint com concluído, não concluído, descobertas, riscos e próxima ação.

---

## 13. Prevenção de sobreposição

Antes de uma alteração relevante, o agente deve verificar:

- se outro agente alterou os mesmos arquivos;
- se existem mudanças não commitadas;
- se o branch/estado atual corresponde à tarefa;
- se o PRD ativo continua válido.

Não sobrescrever trabalho existente sem entender o motivo da divergência.

---

## 14. Regra de confiança

Nenhum agente deve presumir que:

- documentação está correta só porque existe;
- teste está correto só porque passa;
- implementação antiga está correta só porque está em produção;
- revisão anterior elimina necessidade de nova validação quando a lógica mudou.

A confiança vem da convergência entre especificação, código, testes, casos de referência e revisão.
