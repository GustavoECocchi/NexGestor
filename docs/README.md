# Mapa da documentação

Ponto de entrada da documentação do NexGestor. Escolha pelo que precisa fazer;
o roadmap concentra fases e as sessões guardam evidências e continuidade.

| Preciso de… | Ler |
|---|---|
| Iniciar o projeto | [README da raiz](../README.md) |
| Navegar como usuário | [Como usar](../COMO-USAR.md) |
| Regras para Claude/Codex | [AGENTS.md](../AGENTS.md) → [CLAUDE.md](../CLAUDE.md) |
| Estado e pendências | [Roadmap](roadmap.md), depois a evidência citada |
| Contrato de frontend/backend | [Contrato da API](CONTRATO_API_FRONTEND.md), conferindo código/testes |
| Requisitos por funcionalidade | [Catálogo de requisitos](prds/README.md) |
| Retomar tarefa ou localizar uma decisão | [Índice de sessões](sessions/README.md) → checkpoint da tarefa; conferir branch/diff atual |
| Operar o VPS | [Runbook](../deploy/README.md); registros datados não provam produção atual |
| Extensão antiga, auditorias e propostas anteriores | [Catálogo histórico](historico/README.md) |

## Onde cada documento fica

```text
README.md                      Instalação e desenvolvimento local (na raiz)
COMO-USAR.md                    Uso do dashboard (na raiz)
AGENTS.md → CLAUDE.md           Instruções vigentes para agentes (na raiz)
deploy/README.md                Operação e implantação do backend
docs/
  README.md                    Este mapa
  roadmap.md                   Fases e próximas verificações
  CONTRATO_API_FRONTEND.md      Contrato técnico da API
  prds/README.md               Catálogo de requisitos por funcionalidade
  sessions/README.md           Índice por assunto e data
  historico/README.md          Catálogo de referências históricas e propostas
  PRD.md                       Referência retroativa do produto
  rascunho_prompt.md           Entrada reutilizável de prompt
```

O catálogo histórico também aponta para documentos nos caminhos originais.
Os índices organizam a navegação sem mover fontes citadas por sessões e prompts.

## Estado, requisito e histórico

- `CLAUDE.md` contém a política vigente. O usuário coordena: Claude executor
  principal; Codex revisor/auditor e gerador de planos/prompts por padrão.
- `roadmap.md` consolida fases. `sessions/` registra fatos datados e checkpoints;
  relatos antigos não são reescritos como se tivessem conhecido mudanças futuras.
- [prds/](prds/README.md) preserva requisitos e decisões. Cabeçalhos distinguem implementação de
  aceite. Descrições históricas no corpo não viram automaticamente bugs abertos.
- [PRD.md](PRD.md) é referência retroativa com acesso ao catálogo de requisitos. A revisão integral
  de seu corpo continua pendente; não usá-lo como manual operacional atual.
- [Pendências conferidas em 07/09](pendencias-conferidas-2026-09-07.md) é uma
  fotografia de auditoria. Verifique código e registros posteriores antes de agir.
- Auditorias anteriores e documentação da extensão estão classificadas no
  [catálogo histórico](historico/README.md); não substituem revisão do estado atual.

## Propostas e prompts

As [propostas de agentes](historico/README.md#propostas-de-agentes) foram
discutidas e simplificadas. São referências de discussão. A implementação
vigente está em `CLAUDE.md`; não criar `.ai/STATE`, TASKS ou HANDOFF por ler as
propostas. Decisões posteriores do usuário prevalecem sobre o texto original.

[temporario.md](../temporario.md) e [rascunho_prompt.md](rascunho_prompt.md)
são entradas reutilizáveis de prompt.
Só executar quando o usuário invocar; podem conter pedidos já atendidos.
Sua presença não define a tarefa atual. Não apagar ou mover enquanto estiverem
em uso. As conclusões e evidências pertencem à sessão, não ao prompt.

## Manutenção

Antes de criar documento, verificar se a responsabilidade já tem destino acima.
Atualizar referências e cabeçalhos ao reconciliar contexto; evitar cópias de
estados e contagens de testes em múltiplos guias. Não é necessário ler tudo:
instruções → tarefa/roadmap pertinente → checkpoint/PRD → código relevante.

Ao adicionar um PRD ou sessão, incluir um link no índice da pasta. Usar assunto
e data para localização; resultados de testes e próximos passos ficam no
registro da tarefa. Documentos históricos preservam a evidência da época;
retificações devem indicar o que foi superado e sua referência.
