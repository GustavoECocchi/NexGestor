# Retomada — concluir correções e auditar precisão/confiabilidade

## Objetivo

Finalize a rodada de correções já autorizada e depois execute a auditoria de
`docs/prds/auditoria-precisao-confiabilidade.md` como etapa separada.
Queremos saber quando o diagnóstico merece confiança e onde pode induzir
decisões inadequadas, especialmente pausa e escala.

Este prompt substitui integralmente o conteúdo anterior sobre o MVP de agentes.
Não implemente novamente aquele MVP nem crie outra política de execução.
Siga AGENTS.md e CLAUDE.md; o PRD continua sendo a referência do escopo da auditoria.

## 1. Conferir a tarefa e o estado real

- Leia as instruções, o roadmap e os checkpoints pertinentes da sessão.
- Confira branch, HEAD, status, diff inclusive staged e arquivos novos.
- Identifique quais correções estão em andamento, quais já foram autorizadas
  pelo usuário e quais foram implementadas/validadas. Preserve trabalho existente.
- Há divergência a esclarecer: o usuário informa que a auditoria de precisão
  ainda não foi executada, mas `docs/sessions/2026-09-08.md` contém uma seção
  que a declara concluída. Confira evidências e contexto da sua conversa.
  Explique se houve execução completa, parcial, rascunho ou registro incorreto.
  Não trate o texto do checkpoint nem uma contagem de testes como prova suficiente.
- Se o registro estiver incorreto, acrescente uma retificação identificável,
  preservando o histórico e deixando claro o estado atual. Se houver trabalho
  comprovado, aproveite-o na versão correspondente, sem repeti-lo sem necessidade.

## 2. Fechar a rodada atual de correções

Conclua somente as correções já autorizadas e os testes pertinentes. Este
pedido não autoriza corrigir automaticamente todos os novos achados.

Para cada correção, registre problema, comportamento resultante e evidência
de validação. Quando pertinente, demonstre que a reprodução falha sem a
correção e passa com ela. Distinga validação nova de resultados anteriores.

Defina um ponto de encerramento: correções autorizadas concluídas e validadas,
ou pendência identificada com motivo e próxima ação. Não espere encontrar
“zero bugs” para iniciar a auditoria. Um impedimento localizado não deve
paralisar as verificações independentes.

Não execute commit, push ou deploy por causa deste prompt.

## 3. Executar a auditoria em uma versão identificada

Ao encerrar a rodada, registre HEAD e alterações locais que compõem a base
analisada. Não é necessário criar commit para identificar essa base.

Execute o PRD integralmente, sem implementar correções de produto, testes
permanentes ou configuração durante a auditoria. Pode usar reproduções
temporárias isoladas, conforme os limites do PRD.

Priorize:
- confiança excessiva com dados ausentes ou amostra pequena;
- recomendações indevidas de pausar ou aumentar investimento;
- adequação de metas e regras ao contexto da campanha;
- consistência entre diagnóstico, nota, confiança, IA e apresentação;
- hipóteses de causa apresentadas como certeza.

Para cada achado, registre entrada, esperado, observado, arquivo/linha,
impacto, evidência e recomendação. Diferencie bug de implementação, decisão
de produto, heurística não validada e ausência de evidência empírica.
Inclua controles positivos e suspeitas refutadas.

Se o código mudar durante a auditoria, identifique a nova versão e reavalie
os trechos afetados. Não misture resultados de versões diferentes.
Se um defeito impedir parte da avaliação, documente o limite e siga nas demais.

## 4. Precisão real e limites

Testes passando comprovam comportamento nos casos exercitados; não comprovam
automaticamente que as regras representam bem campanhas reais.

Sem campanhas anonimizadas autorizadas e avaliação independente de gestor,
conclua a parte técnica e entregue o protocolo de comparação previsto no PRD.
Mantenha a validação empírica explicitamente pendente; não invente taxa de acerto.

Respeite os limites do PRD: sem chamadas pagas, produção/VPS, leitura de
segredos, uso de bancos reais ou instalação de dependências. Use testes
isolados, configuração fictícia e IA desligada.

## 5. Entrega e critério de encerramento

Entregue:
1. Esclarecimento da divergência sobre a auditoria registrada.
2. Correções anteriores finalizadas, validações e pendências.
3. Versão examinada e veredito por frente definida no PRD.
4. Achados priorizados e condições em que a análise merece ou não confiança.
5. Até cinco próximas ações, separando correções de decisões de produto
   e validação com campanhas reais.

A etapa termina com o escopo técnico examinado, evidências registradas e
limitações explícitas; não depende de corrigir todos os achados.
Se faltar requisito do PRD, declare a auditoria parcial e indique o que falta.

Registre a entrega na sessão da data corrente conforme CLAUDE.md, coordenando
a edição se outro agente estiver no mesmo arquivo. Atualize o roadmap apenas
se uma frente mudar de fase. Informe separadamente implementação, validação,
commit, envio e implantação.
