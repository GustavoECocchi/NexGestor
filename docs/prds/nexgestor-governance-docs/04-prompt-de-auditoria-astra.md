> **Referência histórica de auditoria.** A presença deste prompt não inicia uma tarefa. A auditoria já realizada está registrada na sessão de 08/09; consulte o README do pacote antes de retomar.

# Prompt de Auditoria para Astra

Use este prompt antes de transformar os documentos de governança em política oficial do projeto.

---

## Prompt

Atue como arquiteto de software, auditor de engenharia e revisor de governança de desenvolvimento assistido por IA.

Você receberá um ou mais documentos que definem o processo de desenvolvimento deste projeto.

Sua tarefa é **auditar criticamente os documentos**.

### Objetivo da auditoria

Verificar se o processo proposto:

- reduz carga contextual do mantenedor;
- evita loops infinitos de correção;
- preserva rigor em lógica de negócio;
- diferencia bloqueadores de melhorias;
- funciona bem com Claude Code e Codex/Astra no mesmo repositório;
- reduz ambiguidade de responsabilidade;
- mantém rastreabilidade;
- é simples o suficiente para ser seguido no dia a dia.

### Não implemente nada

Nesta etapa:

- não altere código;
- não mova arquivos;
- não reescreva automaticamente os documentos;
- não crie estrutura nova sem antes justificar;
- não transforme recomendações em regras definitivas.

Primeiro audite.

### Avalie obrigatoriamente

#### 1. Ambiguidades
Identifique regras que possam ser interpretadas de maneiras diferentes por agentes diferentes.

#### 2. Conflitos internos
Procure regras que se contradizem ou criam incentivos incompatíveis.

#### 3. Lacunas
Identifique situações importantes que não estão cobertas.

#### 4. Casos de borda
Considere:
- bugs descobertos fora do escopo;
- testes passando com regra de negócio errada;
- documentação desatualizada;
- PRD incorreto;
- dois agentes alterando a mesma área;
- backlog crescente;
- regressões;
- alterações de contrato;
- migração de dados;
- mudança de arquitetura;
- revisão que encontra novos problemas infinitamente.

#### 5. Critério de parada
Avalie se existe uma definição objetiva de quando:
- parar;
- continuar;
- escalar;
- criar backlog;
- abrir novo PRD;
- aprovar.

#### 6. Severidade
Avalie se CRÍTICO / MÉDIO / BAIXO está bem definido e difícil de abusar.

#### 7. Precisão da lógica
Considere que o produto depende fortemente de:
- métricas;
- regras analíticas;
- diagnósticos;
- recomendações;
- thresholds;
- cálculos.

Avalie se a política é suficientemente rigorosa para mudanças nessas áreas.

#### 8. Colaboração multiagente
Avalie se:
- Claude Code sabe quando executar;
- Astra sabe quando revisar;
- ownership pertence ao projeto;
- handoffs preservam contexto;
- nenhum agente pode se eximir com “não fui eu que fiz”.

#### 9. Escalabilidade
Avalie se o processo continuará funcionando quando:
- houver mais PRDs;
- mais módulos;
- mais testes;
- mais integrações;
- mais documentação;
- mais agentes.

#### 10. Sobrecarga
Identifique regras que parecem boas, mas podem gerar burocracia excessiva.

---

## Formato obrigatório da resposta

### A. Resumo executivo
Avaliação geral em até 10 linhas.

### B. Pontos fortes
O que deve ser preservado.

### C. Problemas encontrados
Para cada problema:
- ID;
- documento;
- seção;
- severidade;
- problema;
- consequência;
- exemplo de falha.

### D. Lacunas
Regras ausentes.

### E. Ambiguidades
Trechos que precisam de critérios mais objetivos.

### F. Conflitos
Regras que podem se chocar.

### G. Riscos de burocracia
Onde o processo pode ficar pesado demais.

### H. Melhorias recomendadas
Para cada melhoria:
- prioridade;
- alteração conceitual;
- motivo;
- impacto esperado.

### I. Mudanças mínimas necessárias antes da adoção
Liste somente o que realmente precisa ser corrigido antes de tornar a política oficial.

### J. Veredito
Escolha um:
- APROVAR COMO ESTÁ
- APROVAR COM AJUSTES
- REVISAR ANTES DE ADOTAR

Justifique.

---

## Regra final

Não proponha complexidade sem benefício claro.

A política deve aumentar a confiabilidade **e ao mesmo tempo reduzir a quantidade de decisões que o mantenedor precisa guardar na cabeça**.
