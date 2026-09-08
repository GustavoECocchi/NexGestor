# NexGestor — instruções para agentes

Antes de trabalhar, leia `CLAUDE.md` e `docs/roadmap.md`, preserve alterações
preexistentes do worktree e use o código/testes atuais como evidência do estado
real.

Para execução, revisão, criação de prompts e retomada entre agentes, siga
**Execução compartilhada e continuidade** em `CLAUDE.md`, a fonte única da
política. Confira o checkpoint da tarefa contra o repositório antes de retomar.

## Registro obrigatório de conclusão

Siga integralmente a seção **Rastreabilidade obrigatória de tarefas** de
`CLAUDE.md`. O registro é parte da definição de pronto: antes de declarar uma
tarefa, etapa ou PR concluída, valide o trabalho, registre a evidência em
`docs/sessions/AAAA-MM-DD.md` e atualize `docs/roadmap.md` se o item mudou de
fase.

Não confunda `implementado`, `validado`, `commitado`, `enviado` e `implantado`.
Se a tarefa não pertence ao roadmap, registre-a apenas no histórico da sessão.
O comando `.claude/commands/encerrar-sessao.md` faz a reconciliação final para
capturar tarefas que tenham ficado sem registro.
