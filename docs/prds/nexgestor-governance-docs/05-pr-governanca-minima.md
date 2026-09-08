# PR proposto — Critérios de achados e encerramento na política existente

**Estado: especificação pronta; implementação e PR no GitHub não iniciados.**
Preparado em 2026-09-08 para execução posterior pelo Claude, quando acionado
pelo usuário. Título sugerido: `docs: define bloqueadores e encerramento proporcional`.

## Problema e resultado esperado

A auditoria deste pacote identificou critérios que podem classificar quase
tudo como crítico, impedir encerramento por qualquer incerteza e duplicar
estados oficiais. Este PR deve integrar somente os ajustes necessários em
CLAUDE.md e identificar os documentos propostos como referências não normativas.

Exemplo: uma hipótese fora do escopo passa a ser registrada com impacto e
próxima ação, sem interromper trabalho independente. Um defeito demonstrado que
invalida o resultado da tarefa bloqueia seu aceite até resolução ou revisão
explícita dos requisitos, sem permitir declarar o comportamento defeituoso correto.

## Preparação e base

Leia AGENTS.md, CLAUDE.md, docs/README.md e a seção “Auditoria —
nexgestor-governance-docs” de `docs/sessions/2026-09-08.md` (G01–G09).
Confira HEAD, branch, diff staged/local e arquivos novos antes de editar.
Base desta especificação: `199f54c`, branch de auditoria de precisão; o pacote
de governança e o relatório têm alterações locais ainda não commitadas.

O PR será exclusivamente documental. Prepare uma branch própria, sugerida
`docs/governanca-minima`, com base na main remota conferida na execução.
Reutilize a política documental de `692a0f9` ou seu equivalente se ainda não
estiver na base; examine e documente essa dependência. Não use a branch de
precisão como base sem avaliar os commits herdados: P1–P4 não pertencem a este PR.
Use checkout/worktree isolado se necessário, preservando as alterações locais,
o relatório de auditoria e o stash do benchmark. Não é necessário adotar outra
estrutura de branches permanente. Se a dependência ampliar materialmente o
diff, prepare primeiro o PR documental de base e indique a ordem de integração.

## Alterações autorizadas na execução

### 1. Complementar CLAUDE.md, sem duplicar o que já existe

- **Autoridade (G01):** requisitos e instruções aprovados definem o esperado;
  código e testes demonstram o observado. Investigar divergências antes de
  corrigir; não alterar requisito apenas para legitimar a implementação.
- **Achados (G02/G07/G09):** registrar na sessão evidência, condição alcançável,
  impacto, relação com o escopo e próxima ação. Distinguir defeito confirmado,
  hipótese e lacuna de validação. Usar campos extras só quando necessários;
  não exigir estimativas numéricas sem dados nem criar cadastro paralelo.
- **Bloqueio (G02/G03):** bloqueador é defeito ou incerteza material que impede
  atender ou validar o requisito da entrega. Identificar a ação afetada
  (implementação, aceite, merge ou deploy) e continuar partes independentes.
  Caso raro não implica impacto baixo; hipótese não vira fato por severidade.
  Teste obrigatório falhando impede declarar sua validação, mas exige distinguir
  defeito do produto de limitação ambiental e delimitar o alcance do bloqueio.
- **Escopo/autorização (G05/G06):** revisão não autoriza correções. Implementação
  pode incluir ajuste necessário dentro da autorização vigente; descoberta não
  relacionada recebe destino. Pedir decisão somente quando houver escolha
  material ainda não resolvida por requisito ou autorização, não por qualquer
  divergência documental ou arquivo adicional.
- **Encerramento (G03/G04):** critérios do escopo atendidos, validações exigidas
  registradas, sem bloqueador material dessa entrega e com pendências destinadas.
  Não exigir inexistência de toda incerteza. Não confundir conclusão de auditoria
  técnica com validação empírica. Reutilizar os cinco estados existentes e manter
  commit, envio e implantação separados.
- **Lógica analítica (G08):** mudança de cálculo, limiar, confiança ou recomendação
  precisa justificar o esperado por requisito, fonte aplicável ou decisão de
  domínio explícita. Casos incluem controles positivos, negativos e fronteiras;
  saída do próprio engine não é fundamento independente. Registrar revisão
  independente da mudança de regra, ou seu estado pendente, sem inventar aceite.
  Reutilizar testes existentes e exigir apenas verificações pertinentes ao impacto.
- **Continuidade (G07):** referenciar o checkpoint e as regras de edição existentes.
  Contrato/migração exige avaliar consumidores, dados existentes e reversibilidade
  quando afetados; não impor essa análise a tarefas sem esse impacto.

### 2. Eliminar autoridade concorrente do pacote

No README do pacote, explicar que CLAUDE.md é a fonte normativa e apontar para
a auditoria e este PR. Nos documentos 01–03, acrescentar aviso claro no topo:
propostas históricas, não executar como política; regras conflitantes foram
substituídas pela política consolidada. Preservar seus corpos como referência,
sem manter três versões normativas nem reescrevê-los integralmente.

No documento 04, identificar o prompt como referência de auditoria, cuja presença
não inicia uma tarefa. Em docs/README.md, adicionar o pacote ao mapa de propostas
com o mesmo status. AGENTS.md continua apontando para CLAUDE.md; só alterar se
uma referência realmente precisar de ajuste. Não criar estados novos, automação,
skills, agentes adicionais ou arquivos TASKS/STATE/HANDOFF.

## Validação e critérios de aceite

Revisar o diff completo, arquivos novos, links e `git diff --check`.
Não executar suítes de produto por mudança somente documental.
Validar o processo por estes exemplos, registrando a decisão prevista:

| Caso | Comportamento exigido |
|---|---|
| Teste passa, regra contraria requisito aprovado | Investigar/corrigir a regra dentro da autorização; não reescrever requisito para aprovar. |
| Melhoria estética ou bug externo sem dependência | Registrar se útil e continuar; não ampliar o PR. |
| Bug externo invalida a entrega | Bloquear somente a parte dependente e identificar a próxima ação. |
| Teste falha por ambiente | Não declarar validação passada; registrar limitação e seguir verificações independentes. |
| Revisor encontra correção simples | Registrar/prescrever; não implementar sem autorização. |
| Auditoria técnica completa, campanhas reais ausentes | Encerrar parte técnica se o aceite permitir, mantendo validação empírica pendente. |
| Outro agente muda os arquivos | Conferir versão, coordenar edição e revalidar impacto; não sobrescrever nem reiniciar tudo. |
| Mudança de contrato/dados | Avaliar compatibilidade e reversibilidade antes de aceitar a mudança. |

Pronto quando G01–G09 tiverem destino explícito, os exemplos forem consistentes,
CLAUDE permanecer a única política e não houver nova exigência de confirmação
para ações já autorizadas. Registrar implementação e validação documental na
sessão; eficácia real na próxima tarefa continua não medida.

## Entrega e limites

Ao ser acionado, implementar o escopo documental e preparar descrição de PR
com problema, resultado e validação. Esta especificação não executa commit,
push, abertura de PR remoto, merge ou deploy automaticamente; seguir a
autorização de entrega que existir na sessão de execução.

Não corrigir P5/P6/P7, produto, testes ou benchmark. Não retomar PR #4 fechado.
Roadmap só muda se uma frente mudar de fase; melhoria de processo fica na sessão.
Rollback documental: reverter apenas as alterações deste PR, preservando histórico
e trabalho posterior. Nenhuma migração de dados está prevista.
