---
description: Encerra a sessão atualizando docs/roadmap.md e fazendo commit/push
allowed-tools: Bash(git *), Bash(pytest *), Bash(tsc *), Read, Edit, Write
---

Antes de encerrar a sessão:

Este fluxo de encerramento inclui entrega Git; não o acione apenas para
registrar um checkpoint intermediário. Para isso, siga **Execução compartilhada
e continuidade** em `CLAUDE.md` e registre diretamente na sessão, sem commit/push.

1. Reconcilia `git status`/`git diff` com o registro de hoje e com o roadmap.
   Toda tarefa ou PR tocada precisa ter estado honesto em
   `docs/sessions/AAAA-MM-DD.md`; toda mudança de fase precisa aparecer no
   item correspondente de `docs/roadmap.md`. Este é o mecanismo de segurança
   para capturar omissões — o registro deveria ter sido feito assim que cada
   tarefa terminou, conforme `CLAUDE.md`.
   Confira também se tarefas incompletas têm checkpoint identificável com
   versão observada, validação pendente e próxima ação. Reutilize o registro
   da tarefa em vez de criar STATE/HANDOFF paralelos. Coordene a escrita se
   outro agente estiver editando a mesma sessão.

2. Valide conforme o que mudou: pytest em backend/backend-nexgestor-main
   para backend; npm test + tsc -b em frontend/nexgestor-dashboard para
   dashboard. Para alterações somente documentais, revise conteúdo, referências
   e `git diff --check`. Reutilize validação já executada sobre a mesma versão;
   mudanças posteriores exigem reavaliar o impacto e repetir os checks pertinentes.
   Só o que passar de fato pode ser documentado como "funcionando".

3. Cria um arquivo novo em docs/sessions/AAAA-MM-DD.md (data de hoje;
   se já existir um arquivo pra hoje, acrescenta uma seção "(parte N)")
   com o progresso real da sessão (não otimista): o que foi implementado
   E VALIDADO, decisões tomadas, e o que ficou pendente, incompleto, ou
   implementado mas não testado. Registra separadamente se cada tarefa está
   commitada, enviada e implantada. NUNCA escreve o log no CLAUDE.md.

4. Atualiza docs/roadmap.md SÓ se algum item mudou de fase (concluído,
   bloqueado, mudou de prioridade) — edita a linha do item existente,
   não anexa histórico novo. Se o item já resume o estado atual
   corretamente, não mexe.

5. Se — e só se — algo mudou de forma estrutural (novo componente
   arquitetural, mudança de stack, novo diretório importante), atualiza
   o CLAUDE.md raiz (cabeçalho + estrutura). Isso deve ser raro.
   CLAUDE.md nunca recebe log de sessão, decisão pontual ou pendência
   de curto prazo — isso vai em docs/sessions/.

6. Commita as mudanças (do repositório único na raiz) com uma mensagem
   descritiva do que foi feito (inclua contagem de testes passando, se mudou).

7. Faz push pro repositório remoto (origin main).

8. Me dá um resumo curto do que foi commitado e do que fica como
   próximo passo pra próxima sessão.
