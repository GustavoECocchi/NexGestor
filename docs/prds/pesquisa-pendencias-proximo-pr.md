# Mini-PRD — Pesquisar pendências e definir o próximo PR pequeno

Data: 2026-09-08. **Execução futura; pesquisa e correções não iniciadas.**
Executor previsto: Claude. Este documento prepara a tarefa; não retoma a
execução pausada nem autoriza publicação agora.

## 1. Objetivo

Determinar a melhor forma de resolver as pendências atuais com evidências,
comparar alternativas e preparar **um único PR pequeno e coerente** para
execução posterior. O resultado não deve ser uma nova auditoria geral nem
uma tentativa de corrigir todo o backlog de uma vez.

## 2. Base e escopo

Leia AGENTS.md, CLAUDE.md, roadmap e o último checkpoint de
`../sessions/2026-09-08.md`. Confira branch, HEAD, diffs inclusive staged,
arquivos novos e commits antes de transformar registros em tarefas.

Na preparação, a branch era `fix/auditoria-precisao-confiabilidade`, HEAD
`13ea187`. P1–P4 têm commits; P5/P6/P7 estão pendentes no checkpoint.
Benchmark está separado no stash `7891e2e802958d34da9d6b11b1ecf6928a043e0f`.
Preserve-o, assim como alterações locais. Não aplique ou remova o stash.

Use `auditoria-precisao-confiabilidade.md` e seu relatório como evidência
anterior. Revalide apenas suspeitas relevantes à versão atual, sem refazer
a auditoria inteira nem presumir que testes comprovam precisão real.

Faça triagem breve das pendências do roadmap: resolvida, correção de código,
decisão de produto, aceite/validação real ou operação externa. Aprofunde
somente o necessário para selecionar a próxima correção, priorizando:

- **P5:** faixas válidas e consistência entre dados brutos e taxas.
- **P6:** instrução contraditória no prompt da IA.
- **P7:** origem e aplicabilidade dos limiares.

Autenticação, publicação, benchmark, aceites com pessoas e demais melhorias
ficam em frentes separadas; registre dependências sem incluí-las por conveniência
no PR. Não reabra P1–P4 sem evidência nova.

## 3. Pesquisa e comparação

1. Reproduza o problema candidato e rastreie entrada manual/importação/API,
   cálculo, persistência e apresentação nos pontos afetados.
2. Consulte documentação oficial das plataformas e fontes primárias pertinentes.
   Registre URL, data, definição da métrica e limites de aplicabilidade. Não
   presuma que toda taxa deve ficar entre 0 e 100: confira denominadores,
   eventos repetidos, período, atribuição e unidade de cada campo.
3. Para P5, compare rejeitar, avisar, recalcular a partir dos brutos e manter
   o valor informado. Avalie ausência versus zero, arredondamento, tolerância,
   precedência atual, dados antigos e compatibilidade do contrato/frontend.
   Não invente tolerância sem justificativa nem corrija dados silenciosamente.
4. Compare alternativas por redução do erro, risco de rejeitar dados legítimos,
   impacto para o usuário, compatibilidade, esforço e testabilidade. Recomende
   uma opção, explicando incertezas e decisões de produto ainda necessárias.
5. P6 pode ser um PR próprio se for a menor correção independente. P7 deve
   identificar fontes ou declarar heurísticas; pesquisa inconclusiva não
   autoriza inventar fundamento nem alterar limiares arbitrariamente.

Pesquisa pública não deve transmitir dados privados. Reproduções usam dados
fictícios e ambiente isolado. Sem Gemini pago, produção/VPS, segredos, banco
real, instalação ou alterações persistentes de produto nesta pesquisa.

## 4. Entrega: especificação executável de um PR

Registre a pesquisa e o checkpoint na sessão da data corrente. Ao concluir,
acrescente neste documento uma seção “PR recomendado” com:

- Problema único, título proposto e exemplo concreto de antes/depois.
- Alternativa escolhida, fontes, decisões resolvidas e dependências pendentes.
- Comportamento esperado, pontos de alteração e limites explícitos do escopo.
- Base proposta: complementar a branch atual ou PR separado, com justificativa;
  evitar carregar P1–P4 acidentalmente em um PR anunciado como outra correção.
- Testes de regressão e controles de entradas legítimas, verificações de
  compatibilidade e comandos de validação proporcionais à mudança.
- Critério de pronto e forma de reverter a mudança sem perder dados.

“Pequeno” significa uma mudança de comportamento revisável de forma independente,
com seus testes necessários. Não agrupe P5/P6/P7 se não dependerem entre si.
Se P5 depender de decisão do usuário, formule a pergunta com recomendação e
impacto; termine as partes independentes da pesquisa enquanto isso.

## 5. Encerramento e execução posterior

A pesquisa termina quando houver triagem atualizada, problema reproduzido,
alternativas avaliadas e especificação do PR com critérios verificáveis.
Se faltarem evidências ou decisão, declare esse limite e não apresente o
PR como pronto para implementar.

Nesta etapa, entregar o plano local; **não implementar, criar PR no GitHub,
fazer commit, push ou deploy**. A execução posterior seguirá a especificação
quando acionada pelo usuário, conferindo novamente o estado do repositório.
Validar documentos e registrar conclusão conforme CLAUDE.md. Roadmap só muda
se uma frente mudar de fase. Validação empírica da precisão continua separada.
