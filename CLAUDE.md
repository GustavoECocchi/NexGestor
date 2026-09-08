# NexGestor — Monorepo

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads / TikTok Ads / LinkedIn Ads). Monorepo unificando backend (FastAPI) e frontend (dashboard web, Vite + React + TS).

## Estrutura

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise de campanhas + integração Gemini
frontend/nexgestor-dashboard/      Dashboard web (Vite + React + TS + Tailwind) — alvo de desenvolvimento ativo desde 2026-08-24
docs/historico/nexgestor-extensao.md  Referência da extensão descontinuada; código removido em 01bfe1f
.claude/commands/encerrar-sessao.md  comando de fim de sessão: grava em docs/sessions/, atualiza docs/roadmap.md só se algo mudou de fase
.claude/commands/rascunho.md         lê e executa docs/rascunho_prompt.md
```

## Rastreabilidade obrigatória de tarefas

Mapa de leitura e classificação dos documentos: `docs/README.md`. Propostas
e prompts arquivados não são regras vigentes nem tarefas automaticamente ativas.

Antes de declarar qualquer tarefa, etapa ou PR concluída, valide o trabalho e
registre a evidência em `docs/sessions/AAAA-MM-DD.md` — isso é parte da
definição de pronto, não um passo opcional de encerramento de sessão. Se o
item pertence a uma fase do roadmap, atualize também a linha correspondente
em `docs/roadmap.md` (só se ela mudou de fase).

Cada tarefa tem um destes estados, e eles não se confundem:

- **não iniciado**
- **em andamento**
- **implementado, não validado** — código escrito, suíte/build ainda não
  rodados (ou rodaram e falharam)
- **concluído e validado** — validado (suíte, build, ou revisão do diff
  quando a mudança é só documental) e com a evidência registrada
- **bloqueado** — com o motivo

Commit, push e deploy são estados independentes de "concluído e validado":
código pronto e testado não significa commitado, commitado não significa
enviado pro remoto, e enviado não significa implantado em produção. Declare
cada um separadamente — nunca confunda "código pronto" com "já está no ar".

`.claude/commands/encerrar-sessao.md` reconcilia `git status`/`git diff` com
esse registro e com o roadmap ao fim de cada sessão, como rede de segurança
contra tarefas esquecidas — não substitui o registro feito na hora em que a
tarefa termina.

## Execução compartilhada e continuidade

Esta política vale para Claude Code e Codex. O usuário coordena as tarefas.
Claude Code é o executor principal por padrão. Codex atua por padrão como
revisor, auditor, arquiteto, parceiro de discussão e gerador de planos/prompts
de correção. Fluxo usual: Claude executa → usuário pede revisão ao Codex →
Codex verifica o estado resultante e entrega achados/instruções → usuário leva
as correções ao Claude. Não há transferência automática.

Durante reviews e auditorias, Codex não modifica código de produto, testes ou
configuração por padrão; implementar correções exige solicitação explícita do
usuário. O registro documental exigido pela rastreabilidade não autoriza essas
correções; se o pedido proibir qualquer escrita, apresente a análise sem editar
arquivos. Um pedido explícito de execução ao Codex vale para aquela tarefa,
sem exigir nova confirmação por Claude ser o executor padrão.

Esses papéis são preferências, não propriedade nem exclusividade. Autoria é
informação de auditoria: não recuse analisar trabalho autorizado por ter sido
escrito por outro agente. Isso não amplia o escopo autorizado.

- Antes de uma etapa significativa, confira tarefa/requisito, branch, HEAD,
  `git status`, diff relevante (inclusive staged) e arquivos novos relacionados.
  Leia o checkpoint relevante, se existir, e confira-o contra o código atual.
  Código, execução, testes e Git demonstram o comportamento observado;
  instruções vigentes do usuário e requisitos aprovados definem o esperado.
  Investigue divergências; não legitime um bug alterando apenas a documentação.
- Preserve mudanças desconhecidas até entender intenção, requisito e impacto.
  Inspecione e valide o necessário antes de modificá-las dentro da tarefa.
  Não reverta, apague ou sobrescreva trabalho por desconhecer sua autoria.
  Se houver edição concorrente dos mesmos arquivos, coordene a passagem da
  edição; isso inclui a sessão. Um responsável pela edição por vez é uma
  convenção, não um bloqueio técnico. Releia o trecho antes de aplicar mudanças.
- Divida trabalho significativo em etapas recuperáveis: implementar, validar,
  registrar e continuar. Considere trabalho restante, tamanho da próxima etapa
  e contexto disponível quando houver medição confiável. Sem medição, não
  invente percentuais. Sob pressão, diminua a próxima unidade de execução,
  sem retirar requisitos, e registre o estado seguro alcançado. Achado que
  invalida a etapa exige reavaliá-la, não terminá-la a qualquer custo.
- Atualize um checkpoint após avanço relevante, decisão, bloqueio ou passagem
  da tarefa. Mudança pequena concluída usa o registro normal de conclusão;
  não precisa de checkpoint adicional. Compactação não encerra a tarefa nem
  exige handoff: confira o estado e continue quando possível.
- Handoff é o checkpoint mais a referência enviada na transferência: use-o
  quando o usuário trocar o agente, encerrar com trabalho pendente ou houver
  impedimento concreto à continuidade. Não é pedido automático de confirmação
  nem executa commit/push/deploy. Prompts para outro agente devem indicar
  requisito, evidência do achado, versão analisada e próxima ação; quem recebe
  verifica se o problema ainda existe antes de corrigir.
- Validação e revisão valem para a versão examinada, não só para o nome da
  tarefa. Mesmo HEAD pode ter diff diferente. Se o código mudar, reavalie os
  trechos afetados e repita verificações pertinentes; não repita toda a suíte
  sem necessidade. Revisão somente leitura não autoriza correções automáticas.

### Checkpoint por tarefa

Use uma seção identificável em `docs/sessions/AAAA-MM-DD.md`. Na mesma sessão,
atualize a seção da tarefa quando possível; em outra data, referencie a anterior.
Na transferência, indique arquivo e título da seção. Leia apenas o contexto
relevante, sem reconstruir todo o histórico. Registre conclusões e evidências,
não cada comando nem o raciocínio inteiro. Modelo (omita campos inaplicáveis):

```text
Continuidade — <id da tarefa>
Objetivo/referência: <pedido, PRD ou item>
Base observada: <branch, HEAD e alterações locais relevantes>
Estado: <um dos estados da Rastreabilidade obrigatória de tarefas>
Validado: <comportamento, comando/verificação e resultado>
Incompleto/não validado: <limite exato, bloqueio se existir>
Decisões/restrições: <somente o necessário para continuar>
Edição/revisão: <responsável atual, versão revisada ou revisão pendente>
Próxima ação: <passo concreto e validação esperada>
Entrega: <commitado, enviado e implantado, separadamente>
```

Inclua processos, portas e dados locais somente se necessários à retomada,
sem segredos. Checkpoint não prova que o ambiente ou produção continuam iguais.
Reutilize `docs/prds/` para requisitos, roadmap para fases e sessões para
evidências/continuidade. Não crie TASKS/STATE/HANDOFF paralelos nem migre PRDs
para outra taxonomia neste MVP. Decisões duráveis pertencem ao documento
pertinente, referenciado pela sessão; instruções globais não recebem estado
temporário. Atualize o roadmap apenas quando uma frente mudar de fase.

### Achados, bloqueios e encerramento

Registre achados na sessão da tarefa, junto ao checkpoint existente: evidência,
condição alcançável, impacto, relação com o escopo e próxima ação. Distinga
defeito confirmado, hipótese e lacuna de validação. Use campos adicionais só
quando o impacto justificar; não invente probabilidades ou custos numéricos.
Não crie um cadastro paralelo. Ao planejar a próxima entrega, consulte os
achados pertinentes, sem transformar todo o backlog em condição de início.

Um bloqueador é um defeito ou uma incerteza material que impede atender ou
validar um requisito da entrega. Identifique a ação afetada — implementação,
aceite, merge ou deploy — e continue as partes independentes. A classificação
exige evidência do impacto e do alcance: caso raro não significa impacto baixo,
e severidade não transforma hipótese em fato. Teste obrigatório falhando impede
declarar aquela validação aprovada; investigue se é defeito do produto ou
limitação ambiental e delimite o que permanece sem validação.

Revisão não autoriza implementar correções. Em execução autorizada, inclua os
ajustes necessários ao requisito dentro do escopo vigente. Achado sem relação
de dependência com a entrega recebe registro e próxima ação, sem ampliar o
trabalho. Peça decisão apenas para escolha material ainda não resolvida pelos
requisitos ou pela autorização; divergência documental ou arquivo adicional
não exigem confirmação por si só. Um defeito externo que invalide a entrega
bloqueia apenas sua parte dependente.

Encerre a tarefa quando os critérios do escopo estiverem atendidos, as
validações exigidas registradas e não houver bloqueador material dessa entrega.
Dê destino às pendências e explicite os limites; não exija eliminar toda
incerteza. Auditoria técnica concluída não comprova calibração empírica: se o
aceite permitir encerrar a parte técnica, registre separadamente a validação
com dados reais ainda pendente. Use os cinco estados de rastreabilidade acima,
com revisão pendente no checkpoint e commit, envio e implantação separados.

### Mudanças analíticas, contratos e dados

Mudança de cálculo, limiar, confiança ou recomendação exige fundamento para o
resultado esperado: requisito aprovado, fonte aplicável ou decisão de domínio
explícita, com responsável pela decisão identificado. Casos de referência
incluem controles positivos, negativos e fronteiras pertinentes; a saída do
próprio engine não é fundamento independente. Registre a revisão independente
da mudança de regra ou mantenha-a explicitamente pendente, sem inventar aceite.
Reutilize testes existentes e execute as verificações pertinentes ao impacto.

Quando contratos ou dados persistidos forem afetados, avalie consumidores,
compatibilidade com dados existentes, ordem de atualização e reversibilidade,
incluindo o impacto de rollback. Tarefas sem esse efeito dispensam essa análise.
Use o checkpoint e as regras de conferência de versão e coordenação de edição
acima; mudanças posteriores exigem revalidar o impacto, não reiniciar tudo.

## Backend — `backend/backend-nexgestor-main`

- FastAPI. Rotas principais: `POST /api/v1/campaign/analyze` (+ `GET /api/v1/campaign/scenarios`), `GET /api/v1/status` (estado da IA) e `/api/v1/campaigns*` (persistência isolada por dono, header `X-Nex-Dono` obrigatório). Contrato completo em `docs/CONTRATO_API_FRONTEND.md`.
- Engine: 15 cenários de diagnóstico (A–O), score ponderado (0–100) com `score_coverage`/`score_confidence` (confiança combina cobertura de métricas e volume de amostra), métricas deriváveis a partir de brutos (impressions, reach, spend, etc.). Plataformas suportadas: Meta Ads, Google Ads, TikTok Ads, LinkedIn Ads.
- Integração Gemini opcional (`GEMINI_ENABLED`), client singleton em `app/service/ai_service.py`.
- Validação de referência: roadmap e sessão correspondente. `conftest.py` desliga a IA por padrão; contagens e limitações de ambiente pertencem ao registro da execução.
- `AUDITORIA.md` documenta uma auditoria anterior (9 itens 🔴/🟠/🟡) — todos marcados como resolvidos/documentados naquele momento.

## Frontend

### Dashboard — `frontend/nexgestor-dashboard` (alvo de desenvolvimento ativo)

- Vite + React + TS + Tailwind, layout full-screen com sidebar. Substituiu a extensão como alvo de desenvolvimento em 2026-08-24. **Não deployado em lugar nenhum ainda** — só roda local via `vite dev`.
- Identificação simples antes de entrar (`DonoGate.tsx` + `lib/dono.ts`, sem senha) — manda o header `X-Nex-Dono` em toda chamada de campanhas salvas.
- Reaproveita a lógica da extensão por cópia (`types.ts`, `lib/`, componentes); modos de criação de campanha: manual e importar arquivo (JSON, whitelist fechada de campos por nome exato) — sem o modo "coletar automático" da extensão.
- Resultados da suíte e build: ver roadmap e evidências datadas nas sessões.

### Extensão Chrome — histórico, removida do checkout

- Side panel, Plasmo + React + TS, descontinuado em 2026-08-24. `frontend/nexgestor-extension` e `extensao-pronta` foram removidos em `01bfe1f`; consulte o histórico Git se necessário.
- Documentação completa (como funcionava, estrutura técnica, dívidas conhecidas): `docs/historico/nexgestor-extensao.md`.
- Migração da coleta automática pra Meta Marketing API (OAuth) segue adiada por decisão do usuário — não é prioridade enquanto durar o período de testes.
- A suíte da extensão é histórica; não faz parte da validação do dashboard atual.

Roadmap, decisões em aberto e histórico completo de cada sessão: `docs/roadmap.md` (que aponta pra `docs/sessions/AAAA-MM-DD.md`).
