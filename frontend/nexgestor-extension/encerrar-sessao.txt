---
description: Encerra a sessão atualizando CLAUDE.md e fazendo commit/push
allowed-tools: Bash(git *), Bash(pytest *), Bash(tsc *), Read, Edit
---

Antes de encerrar a sessão:

1. Roda a suite de testes (pytest no backend, tsc --noEmit no frontend se aplicável).
   Só o que passar de fato pode ser documentado como "funcionando".

2. Atualiza o CLAUDE.md com o progresso real de hoje (não otimista):
   o que foi implementado E VALIDADO, decisões tomadas, e o que ficou
   pendente, incompleto, ou implementado mas não testado.

3. Atualiza a seção de Status atual / Roadmap, se algum passo mudou de fase.

4. Commita as mudanças com uma mensagem descritiva do que foi feito
   (inclua contagem de testes passando, se mudou).

5. Faz push pro repositório remoto.

6. Me dá um resumo curto do que foi commitado e do que fica como
   próximo passo pra próxima sessão.