# Requisitos por funcionalidade

[Mapa da documentação](../README.md) · [Roadmap](../roadmap.md) · [Sessões](../sessions/README.md)

Os PRDs guardam requisitos, decisões e critérios de aceite. O roadmap consolida
as fases; os cabeçalhos de cada PRD e suas sessões distinguem implementação,
validação e aceite pendente. O diagnóstico original no corpo de um PRD não é
uma lista atual de defeitos. Confira o código antes de retomar uma implementação.

## Fases do dashboard

| Frente | Documento e escopo |
|---|---|
| Fase 1 — Ajuda no formulário | [Ajuda em linguagem simples](fase-1-ajuda-formulario-campanha.md): explicações dos campos e critérios de leitura. |
| Fase 2 — Navegação | [Dashboard e intuitividade](fase-2-dashboard-intuitividade.md): sidebar, Ajuda, Copiloto e aceite com leigo (§8); vereditos nos cards (§11). |
| Fase 2b — Benchmark | [Benchmark de mercado](fase-2b-benchmark-mercado.md): referências informativas, fontes, cache e limites de ativação. |
| Fase 3 — Gráficos e histórico | [Gráficos de campanha](fase-3-graficos-campanha.md): Parte A histórica e substituída; Parte B especifica histórico e tendências. |
| Fase 4 — Feed de métricas | [Seção A6 do PRD de gráficos](fase-3-graficos-campanha.md#a6-substituída-no-mesmo-dia--o-que-aconteceu): registra a substituição pelo feed. Não há PRD próprio desta fase. |
| Fase 5 — Vocabulário | [Vocabulário e linguagem](fase-5-vocabulario-linguagem.md): PR1–PR7 e critérios de linguagem do engine, IA e interface. |

Orçamentos de PRs pertencem a cada fase; não há teto universal de dois PRs.

## Especificações adicionais

| Frente | Documento e referência |
|---|---|
| Diagnóstico parcial | [Nota das métricas analisadas e diagnóstico parcial](diagnostico-parcial.md): especificação preparada em 09/09, implementação não iniciada naquele registro. [Decisão e evidência](../sessions/2026-09-09.md#especificação--diagnóstico-parcial). |

## Requisitos registrados em outros documentos

**P5 (consistência de métricas) e fase 5 (vocabulário) são frentes diferentes.**
P5 tem decisão de produto e matriz registradas nas sessões, além do contrato
técnico; não foi criado um PRD separado. Para localizar o trabalho:

- [Decisão de produto de P5](../sessions/2026-09-08.md#decisão-de-produto--p5-bloquear-criação-com-explicação-contextual).
- [Matriz revisada de P5](../sessions/2026-09-09.md#continuidade--p5-corrigido-matriz-revisada), com retificações nas seções posteriores da mesma sessão.
- [Checkpoint para retomada de P5 em outro dispositivo](../sessions/2026-09-09.md#continuidade--transferência-para-outro-dispositivo).
- [Contrato da API](../CONTRATO_API_FRONTEND.md): erros de consistência e formato de gravação de campanhas.

Para a descrição retroativa do produto, consulte [PRD geral](../PRD.md), cujo
corpo ainda precisa de revisão integral contra o dashboard. Ele não é o manual
operacional atual.
