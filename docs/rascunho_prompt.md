Revise e integre o PR #5 de governança mínima à main atual do NexGestor,
que já recebeu o P5 pelo PR #6. Conclua revisão documental, reconciliação
necessária, commit/push, merge e registro da entrega.

Este pedido autoriza a integração do PR #5 quando o resultado estiver
validado. As restrições históricas que paravam antes do merge pertenciam
àquelas etapas; não exigem nova confirmação para esta tarefa já solicitada.
Respeite permissões do ambiente e proteções do GitHub. Se a revisão automática
de aprovação bloquear o merge, apresente a ação concreta e o motivo informado
para autorização pelo usuário; não contorne o bloqueio.

## Contexto e fontes

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md da main atual antes de trabalhar.
Consulte:
- docs/sessions/2026-09-10.md: “Integração — PR #6 mergeado na main (Claude)”
  e a preparação deste prompt de governança.
- docs/sessions/2026-09-08.md: “Continuidade — pr-governanca-minima”,
  “Revisão Codex — entrega de governança mínima” e
  “Continuidade — finalização da entrega de governança (ajustes finais,
  commit, envio, PR)”. Considere retificações posteriores na mesma sessão.
- Na branch de governança, docs/prds/nexgestor-governance-docs/
  05-pr-governanca-minima.md: requisitos G01–G09 e exemplos de aceite.
  Sua ordem operacional antiga deve ser adaptada ao Git atual; a dependência
  692a0f9 e o P5 já foram integrados. Não execute novamente tarefas antigas.

PR: https://github.com/GustavoECocchi/NexGestor/pull/5
Repositório: GustavoECocchi/NexGestor
Branch de origem: docs/governanca-minima
Destino: main

Base LOCAL conferida ao preparar este prompt:
- main em b0b3818, registro final de P5; merge do PR #6 em 5fec3a8.
- docs/governanca-minima em c433626.
- Worktree inicialmente limpo, na main. Este prompt e sua seção de preparação
  em docs/sessions/2026-09-10.md serão alterações documentais locais novas.
- Diff da branch de governança desde a base comum: nove arquivos documentais,
  incluindo 49 linhas em CLAUDE.md, docs/README.md, seis documentos do pacote
  e sessão de 08/09. Nenhuma alteração de produto nesse diff local.

Não houve consulta remota nova na preparação. O último relato registra PR #5
OPEN; confira agora estado, head/base, proteções, reviews, checks e conflitos.

## 1. Preparar sem perder trabalho

Confira branch, HEAD, status, diff local/staged e arquivos novos; fetch das
referências necessárias. Confirme main contendo P5 e o registro final.
Se o PR já estiver integrado, confira seu conteúdo e siga para reconciliação,
sem repetir merge. Se estiver fechado sem merge, investigue antes de reabrir.

Preserve o prompt e os registros locais desta preparação e qualquer trabalho
concorrente. Use worktree/checkout isolado ou transporte documental conferido
para trabalhar na branch de governança sem sobrescrever a main. Inclua esta
preparação no fluxo documental da entrega. Não faça stage indiscriminado,
reset, clean, force push nem manipule stash para liberar a troca de branch.
Não carregue commits de produto de fix/auditoria-precisao-confiabilidade:
essa branch contém contexto histórico que não pertence a esta integração.

## 2. Revisar e reconciliar o PR sobre a main atual

Leia o diff completo e os documentos novos. Não basta o Git indicar CLEAN:
confira a coerência do texto resultante e sua relação com as decisões atuais.
Atualize a branch de governança com main quando necessário para resolver
conflitos/validar a integração, preferindo merge sem reescrever histórico.

Pontos de aceite:
- CLAUDE.md continua sendo a fonte única de política. As duas seções novas,
  “Achados, bloqueios e encerramento” e “Mudanças analíticas, contratos e
  dados”, complementam a política existente sem duplicar estados ou mudar
  papéis: usuário coordena, Claude executa por padrão, Codex revisa por padrão;
  revisão não autoriza correção automática de produto.
- Achado confirmado, hipótese e lacuna de validação ficam distintos.
  Bloqueador identifica requisito e ação afetada; partes independentes seguem.
  Encerramento depende do escopo e da evidência, sem exigir eliminar backlog
  ou declarar validação empírica por haver testes verdes.
- Mudança analítica exige fundamento independente e revisão explicitada;
  contratos/dados exigem compatibilidade e reversibilidade quando aplicável.
  Não impor checklists irrelevantes a toda tarefa nem novas confirmações
  para ações já autorizadas.
- Pacote 01–04 permanece proposta histórica/referência, sem autoridade
  concorrente. Documento 05 é a especificação desta governança, não gatilho
  para executar novamente auditorias, P5 ou outras tarefas.
- AGENTS.md mantém a referência para CLAUDE.md. Ajuste links/índices afetados
  na estrutura atual quando necessário; não restaure versões antigas dos guias.

Atenção especial às sobreposições:
- docs/README.md foi reorganizado na main pelo P5; preserve a organização
  atual ao incluir a referência ao pacote de governança.
- docs/sessions/2026-09-08.md existe dos dois lados com históricos relacionados.
  Reconcilie por seção: preserve evidências e retificações de governança e
  P5, sem duplicar blocos comuns nem substituir a sessão inteira por um lado.
- Preserve sessões de 09/09–10/09, índices de PRDs/sessões/histórico e o
  mini-PRD de diagnóstico parcial. Não reabra achados P5 resolvidos por ler
  registros antigos. Use um registro novo para explicar o estado atual;
  não apague a história para fazer parecer que sempre esteve assim.

Corrija inconsistências documentais e conflitos necessários dentro desse
escopo. Se houver escolha material de política sem decisão anterior, isole-a,
registre as alternativas e peça decisão; não invente regra para conseguir merge.

## 3. Validar a versão a integrar

Compare o resultado com origin/main atualizado. O delta entregue deve continuar
exclusivamente documental: nenhuma remoção/alteração de backend, frontend,
testes, dependências ou configuração de produto do P5.

Revise o diff completo, links locais novos/alterados, âncoras, índices e
marcadores de conflito; execute git diff --check. Exercite os exemplos de
aceite do documento 05 como revisão de consistência da política, registrando
as conclusões. Isso valida o texto; eficácia operacional futura não é provada.

Não execute suítes de produto por mudanças apenas documentais. Reutilize
registros anteriores com suas datas e limites, sem relatar testes alheios
como recém-executados. Se detectar mudança inesperada de produto, investigue
a origem e preserve-a; não aprove esse delta como se fosse só documentação.

Registre resultado da revisão, resolução de conflitos e validação na sessão.
Commite/envie os arquivos conferidos na branch do PR. Atualize descrição do
PR para refletir o conteúdo final e a main após P5; use argumento estruturado
ou arquivo com --body-file para textos multilinha.

## 4. Integrar e confirmar

Confira novamente head/base, proteções e checks após os commits. Ausência
de CI não é CI aprovado; UNKNOWN não é conflito nem aprovação. Aguarde
verificações obrigatórias quando existirem. Use o SHA completo exato que
acabou de revisar para proteger o merge contra mudanças concorrentes.

Faça merge do PR #5 pelo GitHub, preferindo merge commit se permitido e
usando a opção de correspondência do head. Não use bypass administrativo.
Não apague a branch local/remota. Se houver recusa automática de aprovação,
peça autorização para a ação específica com o estado já pronto e validado.

Confirme MERGED, mergedAt, commit de integração e main remota contendo o
resultado. Atualize main local por fast-forward quando seguro, preservando
worktrees e alterações; declare a branch/checkout final corretamente.

## 5. Registro final e entrega

Publique o registro da integração na sessão da data, respeitando proteções
(com PR documental se necessário). Inclua PR, head revisado, commit de merge,
validações, conflitos tratados, estado local/remoto e limites. Preserve
histórico e atualize o índice se criar sessão. Não deixe apenas “merge
pendente” após integração confirmada. Roadmap só muda se um item mudar de
fase; governança é melhoria de processo registrada na sessão.

Entregue resumo curto: o que foi reconciliado, veredito, PR/commit de merge,
main local/remota e registro publicado. Separe implementado, validado,
commitado, enviado, integrado e implantado.

Sem deploy, chamadas pagas, ativação de IA/benchmark, implementação de
P5/P6/P7 ou diagnóstico parcial, auditoria geral ou retomada do PR #4.
Conclua esta integração; a próxima frente será coordenada pelo usuário.
