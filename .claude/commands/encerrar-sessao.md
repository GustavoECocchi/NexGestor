---
description: Encerra a sessão atualizando docs/roadmap.md e fazendo commit/push
allowed-tools: Bash(git *), Bash(pytest *), Bash(tsc *), Read, Edit, Write
---

Antes de encerrar a sessão:

1. Roda a suite de testes: pytest em backend/backend-nexgestor-main,
   e tsc --noEmit em frontend/nexgestor-extension se houver mudanças lá.
   Só o que passar de fato pode ser documentado como "funcionando".

2. Cria um arquivo novo em docs/sessions/AAAA-MM-DD.md (data de hoje;
   se já existir um arquivo pra hoje, acrescenta uma seção "(parte N)")
   com o progresso real da sessão (não otimista): o que foi implementado
   E VALIDADO, decisões tomadas, e o que ficou pendente, incompleto, ou
   implementado mas não testado. NUNCA escreve isso no CLAUDE.md.

3. Atualiza docs/roadmap.md SÓ se algum item mudou de fase (concluído,
   bloqueado, mudou de prioridade) — edita a linha do item existente,
   não anexa histórico novo. Se o item já resume o estado atual
   corretamente, não mexe.

4. Se — e só se — algo mudou de forma estrutural (novo componente
   arquitetural, mudança de stack, novo diretório importante), atualiza
   o CLAUDE.md raiz (cabeçalho + estrutura). Isso deve ser raro.
   CLAUDE.md nunca recebe log de sessão, decisão pontual ou pendência
   de curto prazo — isso vai em docs/sessions/.

5. Commita as mudanças (do repositório único na raiz) com uma mensagem
   descritiva do que foi feito (inclua contagem de testes passando, se mudou).

6. Faz push pro repositório remoto (origin main).

7. Me dá um resumo curto do que foi commitado e do que fica como
   próximo passo pra próxima sessão.