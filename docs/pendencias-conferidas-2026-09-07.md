# Pendências conferidas — 2026-09-07

Comparação solicitada pelo usuário para evitar repetir trabalho. Base:
checkout `84a8cf0`, código e testes atuais, histórico Git, roadmap, PRDs e
sessões. Este inventário substitui, para fins de triagem, a lista da conversa
anterior. Não altera prioridades acordadas nem autoriza implementação/deploy.

## Já implementado: não abrir tarefa para refazer

| Tema | Evidência | O que ainda cabe fazer |
|---|---|---|
| Persistência, exclusão e isolamento por dono | `app/routes/campanhas_salvas.py`, `storage.py`, testes de storage | Confirmar implantação; autenticação real é trabalho distinto. |
| Navegação, Ajuda, atalho Nova campanha/Copiloto | `DashboardShell.tsx`, `HelpCenter.tsx`, testes de navegação; roadmap 13 | Aceite com pessoa leiga. |
| Explicações de métricas e vocabulário fase-5 | `MetricFeed.tsx`, `Copilot.tsx`, `prompts.py`; sessões 04/09 e 07/09 | Aceite real PR6; reconciliar o PRD que diz nada implementado. |
| Aumento de legibilidade | `12a0918`, sessão 06/09 | Zoom/janela reais, teclado/leitor de tela na nova escala e aceite do professor. |
| Integração Gemini para análise | Roadmap 2 e validação real registrada | Conferir configuração e funcionamento no VPS. |
| Benchmark, fonte, cache versionado e timeout de grounding | `81a1ca1`, `2cb13db`; `REGRA_BENCHMARK_VERSAO=2`, timeout dedicado 12000 ms | Positivo real com fonte; controle de custo/acesso antes de ativação pública. |
| Grounding com Gemini real | Três buscas em 07/09, todas negativas | Não repetir a tarefa genérica de primeira chamada real; lacuna é resposta positiva. |
| Correção nginx A2 | `deploy/nginx-gestor.conf.exemplo` já permite `x-nex-dono` e DELETE | Validar configuração atual em nginx real e conferir/aplicar no VPS. |
| Erros específicos de sincronização e reenvio idempotente | `63f9645`; avisos 413/507 em `CampaignCard.tsx`, `client_id` nas rotas | Lacuna remanescente é indicação global para falhas transitórias de listagem/conexão. |
| Exclusão de dinheiro fictício dos totais | `Summary.tsx` e `Summary.test.tsx`, presentes desde `d57f596` | Suspeita visual antiga descartada; não corrigir de novo. |
| Contagem de exemplos nos chips e título | Teste explícito: chips contam tudo de propósito | Sem tarefa corretiva. Mudança só se houver nova decisão de produto. |
| CPL sem meta mantém nota | `MetricFeed.tsx`, `9aee39f`, roadmap 16 | Não reabrir. |
| Limite de fadiga lido corretamente pelo Copiloto | `maxFrequencyFatigue`, `7e8865e` | Não reabrir. |
| Booleanos rejeitados nos modelos públicos inteiros | `63f9645`, regressões de 04/09 | Não reabrir com base no achado antigo. |
| Remoção do ruído libc | Roadmap 16, `16d9514` | Não remover a dependência legítima detect-libc. |
| Revogação da chave antiga | Roadmap 5 | Alerta de secret scanning é verificação administrativa distinta. |

## Restante da lista anterior, sem duplicatas

| ID | Pendência residual | Classificação / limite do escopo |
|---|---|---|
| P01 | Resumo diz últimos 7 dias sem filtrar período | Correção ainda ausente em `Summary.tsx:67`; não exige necessariamente implementar histórico. |
| P02 | Resumo exibe média zero quando não há nenhuma medição de CPA/ROAS | Correção ainda ausente em `Summary.tsx:43-44`. Excluir métricas ausentes do denominador já foi feito; falta apenas representar ausência total. |
| P03 | Estado global de falha transitória de conexão/sincronização | Melhoria documentada, ainda ausente: listagem retorna null e App mantém cache sem aviso global. Preservar avisos 413/507 e recuperação já implementados. |
| P04 | Teste de contrato depende do encoding padrão | Falha reproduzida na rodada anterior em `test_benchmark_mercado.py:1208`; teste passa com UTF-8 explícito. Não é bug demonstrado na API/engine. |
| P05 | Autenticação real | Ainda ausente. Uma única frente backend/frontend, antes de clientes reais; não duplicar por camada. |
| P06 | Política/controle de custo e acesso para benchmark público | Ainda ausente. Coordenar com P05; não criar um segundo sistema de login. Toggle desligado é proteção deliberada. |
| V01 | Aceite de navegação com leigo | Fase-2 implementada. Validar fluxos existentes, corrigir somente falhas observadas. |
| V02 | Aceite de linguagem PR6 com 1–2 chamadas reais | Prompt implementado; falta evidência desse aceite específico. |
| V03 | Aceite de legibilidade/acessibilidade na nova escala | Layout implementado; completar verificações da sessão 06/09. |
| V04 | Benchmark encontrado=true com fonte genuína | Lacuna de validação não bloqueante; não presumir defeito nem gastar chamadas automaticamente. |
| D01 | Backend, dashboard e IA no VPS | Uma frente de publicação com três verificações/entregas. Estado externo não revalidado; conferir o servidor antes de agir. Backend/dashboard já existem. |
| D02 | nginx A2 | Configuração escrita; falta validação real e confirmação/aplicação em produção. Não reimplementar. |
| E01 | Alerta de secret scanning | Conferir estado atual antes de fechar; registro histórico o considera falso positivo. |
| E02 | Repositório da empresa | Conferir acesso/estado. Só origin configurado neste checkout; ausência do remoto local não prova atraso no GitHub. |
| B01 | Ajuste manual de conversões semanais e adequação do piso 50 | Uma decisão de produto com eventual campo no frontend. Backend e JSON já aceitam min_weekly_conversions; não recriar suporte. |
| B02 | Benchmarks de custo com país/moeda/período | Evolução condicionada a contrato de produto. Fallback atual é intencional, não bug. |
| B03 | Histórico e gráficos temporais | Parte B da fase-3 apenas especificada. Definir retenção ao priorizar; não restaurar gráfico polar descartado. |
| B04 | Importação acessível ao leigo | Melhoria futura registrada. JSON atual funciona; não chamar de importador quebrado. |
| B05 | Cenário adicional para CPM caro isolado | Decisão aberta; cenário J para CPM alto + CPA alto + página saudável já existe. |
| DOC01 | Reconciliar documentação de estado | Uma tarefa documental: PRD principal, cabeçalhos fase-1/2/5, contagens antigas, localização da extensão e pendências antigas de push. Sem reabrir código entregue. |

## Exclusões e limites

- Instalar dependências do frontend neste checkout é preparo do ambiente,
  não nova funcionalidade pendente. Vitest ausente não prova falha da suíte.
- Push genérico para origin não entra como tarefa comprovadamente pendente:
  referências locais estavam iguais na rodada anterior e sessão 06/09
  registra push. Sem fetch não se afirma sincronização externa atual.
- Extensão/OAuth seguem fora da fila ativa. Correção à documentação e à
  descrição da conversa anterior: a extensão foi removida do checkout em
  `01bfe1f`; `git ls-tree HEAD frontend/` mostra somente o dashboard.
  Seu código é histórico, não uma pasta atual a manter.
- Não há nova validação de produção/GitHub nesta comparação. Itens D/E são
  primeiro verificações de estado, não autorização para repetir operações.
- Evidência de testes reutilizada da mesma sessão: backend 1676 passaram,
  um falhou por encoding e passou isoladamente com UTF-8. Frontend não
  iniciou por Vitest ausente. Nesta etapa só houve revisão documental e
  de código/testes existentes; não se repetiu suíte sem alteração de código.
