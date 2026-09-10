# Histórico, auditorias e propostas

[Mapa da documentação](../README.md) · [Sessões](../sessions/README.md)

Catálogo das referências históricas do projeto, incluindo documentos mantidos
nos caminhos originais para preservar citações. Datas, achados e afirmações de
validação descrevem a versão examinada; não definem automaticamente tarefas
abertas nem o comportamento atual do produto.

## Produto e auditorias

| Documento | Como interpretar |
|---|---|
| [Extensão Chrome](nexgestor-extensao.md) | Arquitetura e funcionamento do frontend descontinuado em 24/08. O código foi removido do checkout em `01bfe1f`. |
| [PRD retroativo](../PRD.md) | Descrição baseada no produto de agosto, com ressalvas posteriores. Revisão integral do corpo contra o dashboard pendente; requisitos por frente em [prds/](../prds/README.md). |
| [Avaliação de testes de 28/07](../../teste.md) | Auditoria do commit `c2eb9ca`; inclui a extensão antiga. Correções e decisões posteriores estão nas sessões. |
| [Auditoria do backend](../../backend/backend-nexgestor-main/AUDITORIA.md) | Achados e resoluções da auditoria anterior. A contagem de testes é histórica. |
| [Pendências conferidas em 07/09](../pendencias-conferidas-2026-09-07.md) | Fotografia de uma conferência. Consultar registros posteriores antes de abrir ou repetir tarefas. |

## Propostas de agentes

| Documento | Contexto |
|---|---|
| [Context-Aware Agent Execution](<../Context-Aware Agent Execution — Especificação Técnica.md>) | Proposta de controle de contexto, parcialmente superada pela discussão de 07/09. |
| [Cross-Agent Collaboration Protocol](<../Cross-Agent Collaboration Protocol — Claude Code + Codex.md>) | Proposta de colaboração, parcialmente superada pela política consolidada. |

A política vigente está em [CLAUDE.md](../../CLAUDE.md). As propostas não
ativam protocolos, diretórios de estado ou delegação por sua presença.

Prompts reutilizáveis (`temporario.md` e `docs/rascunho_prompt.md`) permanecem
como entradas de trabalho, descritas no [mapa](../README.md#propostas-e-prompts).
Uma instrução antiga dentro deles deve ser conferida contra o pedido atual e
o checkpoint da tarefa antes de execução.
