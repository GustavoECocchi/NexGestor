# Mapa da documentação

Este índice orienta a leitura; não mantém uma segunda lista de tarefas.

| Preciso de… | Ler |
|---|---|
| Iniciar o projeto | [README da raiz](../README.md) |
| Navegar como usuário | [Como usar](../COMO-USAR.md) |
| Regras para Claude/Codex | [AGENTS.md](../AGENTS.md) → [CLAUDE.md](../CLAUDE.md) |
| Estado e pendências | [Roadmap](roadmap.md), depois a evidência citada |
| Contrato de frontend/backend | [Contrato da API](CONTRATO_API_FRONTEND.md), conferindo código/testes |
| Requisitos por funcionalidade | [Índice de fases](PRD.md#fases) → `prds/` |
| Retomar tarefa | Checkpoint identificado em `sessions/AAAA-MM-DD.md`; conferir branch/diff atual |
| Operar o VPS | [Runbook](../deploy/README.md); registros datados não provam produção atual |
| Extensão antiga | [Histórico](historico/nexgestor-extensao.md); código removido do checkout |

## Estado, requisito e histórico

- `CLAUDE.md` contém a política vigente. O usuário coordena: Claude executor
  principal; Codex revisor/auditor e gerador de planos/prompts por padrão.
- `roadmap.md` consolida fases. `sessions/` registra fatos datados e checkpoints;
  relatos antigos não são reescritos como se tivessem conhecido mudanças futuras.
- `prds/` preserva requisitos e decisões. Cabeçalhos distinguem implementação de
  aceite. Descrições históricas no corpo não viram automaticamente bugs abertos.
- `PRD.md` é referência retroativa com índice reconciliado. A revisão integral
  de seu corpo continua pendente; não usá-lo como manual operacional atual.
- [Pendências conferidas em 07/09](pendencias-conferidas-2026-09-07.md) é uma
  fotografia de auditoria. Verifique código e registros posteriores antes de agir.
- [teste.md](../teste.md) é a auditoria de 28/07 sobre uma versão antiga.
  [AUDITORIA.md](../backend/backend-nexgestor-main/AUDITORIA.md) também descreve
  sua auditoria histórica; não substitui revisão do estado atual.

## Propostas e prompts

As duas propostas de agentes nesta pasta foram discutidas e simplificadas:

- [Context-Aware Agent Execution](<Context-Aware Agent Execution — Especificação Técnica.md>)
- [Cross-Agent Collaboration Protocol](<Cross-Agent Collaboration Protocol — Claude Code + Codex.md>)

São referências de discussão, não protocolos adicionais ativos. A implementação
vigente está em `CLAUDE.md`; não criar `.ai/STATE`, TASKS ou HANDOFF por ler as
propostas. Decisões posteriores do usuário prevalecem sobre o texto original.

`../temporario.md` e `rascunho_prompt.md` são entradas reutilizáveis de prompt.
Só executar quando o usuário invocar; podem conter pedidos já atendidos.
Sua presença não define a tarefa atual. Não apagar ou mover enquanto estiverem
em uso. As conclusões e evidências pertencem à sessão, não ao prompt.

## Manutenção

Antes de criar documento, verificar se a responsabilidade já tem destino acima.
Atualizar referências e cabeçalhos ao reconciliar contexto; evitar cópias de
estados e contagens de testes em múltiplos guias. Não é necessário ler tudo:
instruções → tarefa/roadmap pertinente → checkpoint/PRD → código relevante.
