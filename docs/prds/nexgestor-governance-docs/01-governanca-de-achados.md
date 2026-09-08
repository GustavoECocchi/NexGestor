> **Proposta histórica, não normativa.** Não executar este texto como política.
> A fonte única é [CLAUDE.md](../../../CLAUDE.md); regras conflitantes foram
> substituídas pela política consolidada. Corpo preservado como referência.

# Governança de Achados e Critérios de Continuidade

## 1. Objetivo

Definir uma política única para identificar, classificar, priorizar e tratar achados durante o desenvolvimento do NexGestor.

O objetivo é evitar dois extremos:

- avançar com problemas que comprometem a lógica do produto;
- interromper indefinidamente o roadmap por melhorias, refatorações ou riscos de baixo impacto.

Este documento deve ser seguido por qualquer agente que implemente, revise, audite ou proponha alterações no projeto.

---

## 2. Princípios

1. A corretude da lógica de negócio tem prioridade sobre velocidade.
2. Nem todo achado é bloqueador.
3. Todo achado relevante deve ter:
   - descrição;
   - severidade;
   - impacto;
   - evidência;
   - recomendação;
   - destino.
4. Nenhum agente deve expandir o escopo de uma tarefa sem justificar a necessidade.
5. Um achado só deve interromper o fluxo quando houver risco material.
6. Testes passando não provam, sozinhos, que a lógica está conceitualmente correta.
7. Revisões devem procurar regressões e inconsistências, mas não transformar qualquer melhoria possível em obrigação imediata.

---

## 3. Tipos de achado

Todo achado deve ser classificado primeiro por natureza:

### 3.1 Bug funcional
Comportamento diferente do esperado.

### 3.2 Bug de lógica de negócio
Regra, cálculo, interpretação de métrica ou decisão de campanha potencialmente incorreta.

### 3.3 Bug de integração
Contrato incorreto entre backend, frontend, banco, provedor externo ou modelo de IA.

### 3.4 Risco de dados
Problema que pode corromper, perder, duplicar, interpretar incorretamente ou persistir dados de maneira inválida.

### 3.5 Regressão
Algo que funcionava anteriormente deixou de funcionar.

### 3.6 Débito técnico
Estrutura que funciona hoje, mas aumenta custo, fragilidade ou dificuldade futura.

### 3.7 Refatoração
Melhoria estrutural sem mudança de comportamento esperado.

### 3.8 Melhoria
Aprimoramento não necessário para a corretude da tarefa atual.

### 3.9 Observação
Ponto relevante para conhecimento futuro, mas sem ação imediata.

---

## 4. Severidade

### CRÍTICO — bloqueia obrigatoriamente

Um achado é crítico quando pelo menos uma das condições abaixo for verdadeira:

- pode produzir análise incorreta de campanha;
- pode recomendar ação errada ao usuário;
- pode distorcer métricas ou cálculos;
- pode violar contrato de API essencial;
- pode causar perda, corrupção ou inconsistência de dados;
- cria risco de segurança relevante;
- quebra fluxo central do produto;
- produz regressão em funcionalidade já aceita;
- faz testes obrigatórios falharem;
- invalida premissas centrais do PRD atual;
- torna impossível confiar no resultado da feature.

### MÉDIO — não bloqueia automaticamente

Um achado é médio quando:

- existe risco real, porém limitado ou indireto;
- afeta fluxo secundário;
- depende de cenário incomum;
- aumenta fragilidade futura;
- cria dívida técnica relevante;
- pode se tornar crítico em etapas posteriores;
- reduz clareza, manutenção ou previsibilidade do sistema.

Para achados médios, o agente deve obrigatoriamente responder:

1. Qual o impacto?
2. Qual a probabilidade?
3. Qual o custo de corrigir agora?
4. Qual o custo de adiar?
5. Há risco de contaminar o próximo PRD?
6. Recomenda corrigir agora ou registrar para depois?

### BAIXO — não bloqueia

Exemplos:

- naming;
- pequena duplicação;
- melhoria estética de código;
- comentário;
- organização interna sem impacto funcional;
- otimização prematura;
- refatoração opcional;
- melhoria de legibilidade;
- sugestão sem risco atual.

Achados baixos devem ser registrados apenas quando houver valor real em mantê-los.

---

## 5. Regra de bloqueio

Um PRD ou tarefa só deve ser interrompido por:

- achado crítico;
- teste obrigatório falhando;
- incerteza material sobre a lógica de negócio;
- dependência não resolvida que invalide a implementação;
- conflito explícito com arquitetura ou contrato aprovado.

Achados médios podem bloquear somente quando o agente justificar que o adiamento:

- aumenta significativamente o risco;
- gera retrabalho relevante;
- compromete o próximo estágio;
- dificulta validar a implementação atual.

Achados baixos nunca bloqueiam.

---

## 6. Descobertas durante uma tarefa

Quando um novo problema surgir durante a execução:

### Se for necessário para concluir corretamente a tarefa atual
Resolver dentro do escopo.

### Se for relacionado, mas não necessário
Registrar como achado separado.

### Se for de outra área do sistema
Não expandir automaticamente o escopo.
Registrar e recomendar destino.

### Se revelar que o PRD está conceitualmente incorreto
Suspender a implementação e escalar como crítico.

---

## 7. Destino dos achados

Todo achado não resolvido deve terminar em exatamente um destino:

- `BLOCKER_CURRENT`
- `BACKLOG_BUG`
- `BACKLOG_TECH_DEBT`
- `BACKLOG_IMPROVEMENT`
- `NEXT_PRD_CANDIDATE`
- `ARCHITECTURAL_REVIEW`
- `DISMISSED_WITH_REASON`

Nunca deixar um achado apenas em texto solto de revisão.

---

## 8. Critério de encerramento

Uma tarefa pode ser considerada concluída quando:

- objetivo do PRD foi atendido;
- critérios de aceite foram satisfeitos;
- testes obrigatórios passam;
- não há crítico aberto;
- achados médios estão classificados e destinados;
- achados baixos relevantes foram registrados;
- contratos afetados foram atualizados;
- checkpoints foram atualizados;
- documentação necessária foi atualizada;
- não existe incerteza conhecida sobre a corretude da lógica implementada.

---

## 9. Regra especial para lógica analítica do NexGestor

Qualquer alteração que afete:

- interpretação de métricas;
- thresholds;
- diagnóstico;
- score;
- recomendação;
- classificação de campanha;
- pesos;
- regras de decisão;
- normalização;
- fallback;
- agregação;

deve ser tratada como mudança sensível.

Ela exige, quando aplicável:

1. testes unitários;
2. testes de regressão;
3. casos de referência;
4. comparação antes/depois;
5. validação de edge cases;
6. justificativa explícita da regra;
7. revisão independente.

---

## 10. Casos de referência

Manter um conjunto pequeno de cenários conhecidos com entrada e saída esperadas.

Exemplo:

- campanha saudável;
- campanha com CTR baixo;
- campanha com CPA alto;
- campanha contraditória;
- dados incompletos;
- valores extremos;
- dados inválidos;
- campanha nova sem histórico suficiente.

Esses casos devem funcionar como proteção conceitual, não apenas como proteção contra regressão técnica.

---

## 11. Antipadrões proibidos

- “Já que estamos aqui, vamos corrigir também...”
- transformar revisão em refatoração ampla;
- classificar tudo como crítico;
- usar número de achados como métrica de qualidade;
- impedir avanço por melhoria estética;
- ocultar risco para “terminar a tarefa”;
- abrir um novo PRD para cada detalhe;
- manter pendências sem dono ou destino;
- corrigir algo sem reproduzir ou entender o problema;
- alterar regra de negócio apenas para fazer teste passar.

---

## 12. Saída esperada de uma revisão

Toda revisão deve terminar com:

### Resultado
- APROVADO
- APROVADO COM PENDÊNCIAS
- BLOQUEADO

### Achados críticos
Lista objetiva.

### Achados médios
Lista objetiva com recomendação.

### Achados baixos
Somente os relevantes.

### Decisão recomendada
- seguir;
- corrigir antes;
- criar PRD;
- criar bug;
- revisar arquitetura.

### Risco residual
O que continua existindo mesmo após a aprovação.
