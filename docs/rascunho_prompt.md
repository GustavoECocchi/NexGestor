Execute a integração do PR #6 de P5 à main do NexGestor.
Este pedido autoriza conferir a versão, concluir os registros documentais,
commitar/enviar os ajustes documentais necessários e realizar o merge do PR #6
quando as verificações abaixo estiverem satisfeitas. Não exige nova confirmação
só porque o checkpoint anterior parava antes do merge. Respeite permissões do
ambiente e proteções reais do repositório, sem contorná-las.

## Contexto e referências

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md. Consulte em
 docs/sessions/2026-09-10.md:
- “Revisão independente final — P5 (Claude)”.
- “Correção — achados 1 e 2 da revisão independente final (Claude)”.
- “Revisão Codex — duas correções finais do Sonnet”.
- “Entrega Git — P5 revisado”.

PR: https://github.com/GustavoECocchi/NexGestor/pull/6
Repositório: GustavoECocchi/NexGestor
Base: main
Branch: fix/p5-validacao-consistencia-metricas
Último HEAD local conferido na preparação: bbf3e06
Correções finais: b7a80e2; bbf3e06 registra a publicação do PR.
Base main consultada na publicação: 692a0f9.

A consulta remota anterior confirmou o PR OPEN, fora de rascunho, recebendo
bbf3e06. Após o último push, mergeable estava UNKNOWN e não havia checks
listados. UNKNOWN não demonstra conflito nem aprovação: consulte novamente.
Estas informações são históricas; confira GitHub e Git atuais antes de agir.

O delta final do Codex (obrigatórios/Decimal) foi aprovado pelo Claude.
Os dois achados posteriores foram corrigidos pelo Sonnet e aprovados pelo
Codex: PAUSED recusado na escrita e guarda de paridade dos obrigatórios.
Não há achado técnico aberto dessas revisões. Não reinicie a auditoria geral.

## 1. Conferir e preservar o estado

Confira branch, HEAD, status, diff local/staged e arquivos novos; consulte
origin, atualize referências e confira o PR, head/base, reviews, checks,
proteções e conflitos. Confirme que o destino é o repositório acima.

Este prompt e o registro de sua preparação em docs/sessions/2026-09-10.md
serão alterações documentais locais sobre bbf3e06. Inspecione-os e inclua-os
em commit documental na branch P5, com push antes da conferência final do PR.
Preserve qualquer outra alteração: não use git add indiscriminado, reset,
clean, force push ou stash para liberar a troca de branch. Se houver trabalho
não relacionado, use checkout/worktree isolado quando necessário.

Confira o diff completo do PR para confirmar seu escopo e o delta desde a
versão revisada. O snapshot de transferência já inclui organização documental,
sessões e mini-PRD de diagnóstico parcial; isso é conhecido, não implementação
nova de diagnóstico parcial. Governança está em PR separado.

Se o PR já estiver integrado, confira commit/conteúdo e siga para a reconciliação
final; não tente integrar duas vezes. Se houver mudanças novas de produto,
revise e valide o delta antes de considerar a aprovação anterior aplicável.

## 2. Validar o necessário

Reutilize a evidência sobre código idêntico, com autoria/data explícitas:
- Sonnet em 10/09: backend completo 1924 passed, consumidor CampaignVM
  8 passed e tsc -b aprovado.
- Codex em 10/09: backend focal 247 passed e consumidor 8 passed;
  nenhuma nova falha nas duas correções.
- Testes completos/build/lint anteriores do dashboard estão registrados
  em 09/09; não foram repetidos nas últimas correções exclusivamente backend.

Não declare essas execuções como novas. Commits somente documentais pedem
revisão do diff e git diff --check, não repetição automática de todas as suítes.
Se mudanças novas, conflitos ou avanço da base afetarem comportamento,
execute verificações pertinentes à versão que será integrada. Use SQLite
 temporário, GEMINI_ENABLED=false e BENCHMARK_ENABLED=false; sem chamadas
pagas, dados reais ou edição de .env.

Ausência de CI listado não significa CI aprovado. Aguarde checks exigidos
quando existirem. Em conflito, resolva apenas o que estiver claro pelos
requisitos e revisões, preservando os dois lados e validando o resultado.
Se surgir impedimento técnico ou decisão de produto não resolvível neste
escopo, registre evidência e próximo passo; não declare merge concluído.

## 3. Integrar o PR #6

Depois dos commits documentais, obtenha o SHA completo atual da branch e
confira que o PR continua apontando exatamente para a versão examinada.
Faça o merge normal pelo GitHub, preferindo merge commit para preservar os
commits/checkpoints existentes, se esse método for permitido pelo repositório.
Use a proteção de correspondência do head oferecida pelo comando/ferramenta;
se o head mudar, confira o novo delta antes de repetir. Respeite o método
permitido e as proteções; não use bypass administrativo ou force push.

Não apague a branch local/remota nesta etapa. Não integre PR #5 de governança.
Depois do merge, consulte novamente o GitHub: confirme MERGED, mergedAt,
commit de integração e main remota contendo o resultado esperado.
Atualize main local por fast-forward se for seguro, preservando alterações
locais; caso use checkout isolado, declare onde está a main atualizada.

## 4. Registrar e entregar

Atualize a sessão da data de execução com versão conferida, validações
reutilizadas/novas, PR, commit de integração, resultado remoto e pendências.
Preserve o histórico e atualize o índice se criar uma nova sessão. Publique
a confirmação documental respeitando as proteções do repositório, usando
PR documental se necessário. Não deixe o checkpoint dizendo apenas
“merge pendente” depois de uma integração comprovada.

Roadmap só muda se um item realmente mudar de fase; P5 não tem item próprio
atualmente. Não confunda P5 de consistência com fase-5 de vocabulário.
Entregue resumo curto: PR integrado ou impedimento concreto, commit de merge,
estado da main local/remota, testes e registro publicado.

Limites: integração não é deploy. Aceites com leigo, leitor de tela e viewport
real continuam separados. Não ative benchmark/Gemini, não altere produção e
não implemente diagnóstico parcial, P6/P7 ou governança. A próxima frente
após esta entrega será coordenada separadamente pelo usuário.
