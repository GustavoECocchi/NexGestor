# NexGestor — Governança Contextual e Documental

Este pacote define um fluxo de governança para desenvolvimento assistido por múltiplos agentes (Claude Code e Codex/Astra), com foco em:

- reduzir carga mental;
- evitar loops infinitos de correção;
- separar bloqueadores de melhorias;
- preservar precisão da lógica de negócio;
- manter rastreabilidade entre PRDs, achados, testes e decisões;
- deixar claro quem executa, quem revisa e quem decide.

## Documentos

1. `01-governanca-de-achados.md`
   - Como classificar e tratar bugs, riscos, débitos técnicos e melhorias.
   - Define quando um achado bloqueia ou não o desenvolvimento.

2. `02-lifecycle-de-desenvolvimento.md`
   - Define o ciclo de vida de uma tarefa/PRD.
   - Estabelece critérios de entrada, execução, revisão, aceite e encerramento.

3. `03-colaboracao-entre-agentes.md`
   - Define responsabilidades de Claude Code, Codex/Astra e do mantenedor humano.
   - Evita conflitos do tipo “isso não foi minha tarefa”, retrabalho e disputa de ownership.

4. `04-prompt-de-auditoria-astra.md`
   - Prompt para o Astra analisar criticamente os três documentos antes de adotá-los.
   - A auditoria deve propor melhorias sem implementar alterações automaticamente.

## Ordem recomendada de adoção

1. Auditar `01-governanca-de-achados.md`.
2. Ajustar e aprovar.
3. Auditar `02-lifecycle-de-desenvolvimento.md`.
4. Ajustar e aprovar.
5. Auditar `03-colaboracao-entre-agentes.md`.
6. Fazer uma auditoria cruzada dos três documentos.
7. Só depois incorporá-los ao fluxo oficial do projeto.

## Princípio central

O objetivo não é eliminar todos os problemas antes de continuar.

O objetivo é garantir que nenhum problema **materialmente relevante para a corretude, segurança, consistência dos dados ou confiabilidade da lógica de negócio** seja ignorado.

Todo o restante deve ser registrado, classificado e tratado de forma proporcional ao risco.
