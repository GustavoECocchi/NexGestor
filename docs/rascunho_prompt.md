# Opus 5 — revisar e corrigir a execução do Sonnet

Revise de forma independente o trabalho executado pelo Claude Code/Sonnet e
corrija os erros confirmados. O pedido é revisão COM implementação: avance
até validar as correções, sem encerrar apenas com plano ou lista de achados.
Este prompt é destinado ao Opus 5; não altera automaticamente o modelo
selecionado no Claude Code.

## Contexto e evidências

Leia AGENTS.md, CLAUDE.md, docs/roadmap.md e instruções locais aplicáveis.
Leia docs/sessions/2026-09-04.md: parte 4 (revisão original do Opus),
parte 5 (decisões do prompt anterior) e parte 6 (execução do Sonnet).
Leia docs/sessions/2026-09-05.md, docs/prds/fase-2b-benchmark-mercado.md,
docs/CONTRATO_API_FRONTEND.md e o PRD da fase-5.

Na preparação deste prompt, HEAD continuava em 63f9645; implementações,
correções e arquivos novos estão no worktree. Confira git status, git log,
diffs e untracked. O diff contra HEAD mistura várias rodadas: não atribua
tudo ao Sonnet. Preserve alterações preexistentes, inclusive as de processo.

O Sonnet declarou sete lotes concluídos, backend 1626/1626 e dashboard
474/474. Essas são alegações históricas a auditar. Na preparação foram
repetidos apenas os testes direcionados: backend 113/113 e dashboard
107/107. Mesmo passando, deixaram de cobrir as falhas reproduzidas abaixo.

## Decisões e limites

- Benchmark permanece referência informativa separada: não altera score,
  diagnóstico, cor, nota, origem da meta ou banner de default do sistema.
- Só ctr_link em Meta/Google é elegível a busca real. Custos ficam em
  fallback até existir contrato de país/moeda/período. Não amplie o escopo.
- A análise principal aparece e é salva localmente antes de aguardar
  benchmark. Falha de enriquecimento nunca invalida a análise.
- BENCHMARK_ENABLED continua desligado por padrão. A rota pública não está
  aprovada para buscas pagas em produção; X-Nex-Dono não é autenticação.
- Campaign.niche continua opcional na API para compatibilidade, com enum
  fechado quando presente. Criação nova no dashboard exige escolha explícita.
- Preserve lógica, thresholds e prioridades do engine. Extensão congelada.
- Trabalhe localmente com mocks e bancos temporários. Não leia/exiba .env
  real, não chame Gemini real, não instale dependências, não acesse VPS,
  não altere alertas remotos e não faça commit, push ou deploy.

## Método

Monte uma matriz dos achados da revisão original e dos requisitos dos sete
lotes: requisito, evidência, teste, situação e ajuste necessário. Diferencie
corrigido, parcial, não corrigido e não verificável no ambiente. Comentários
e contagem de testes não provam o comportamento.

Para cada bug confirmado, acrescente uma regressão que falhe antes da
mudança, corrija e confirme o teste passando. Priorize perda de dados, fonte
incorreta e custo duplicado. Classifique severidade pelo impacto real.
Investigue regressões adjacentes no escopo; refute suspeitas com evidência
quando necessário. Não use git checkout/reset para testes de mutação sobre
arquivos com alterações preexistentes.

## 1. Persistência e corridas no frontend

Revise src/components/App.tsx, src/lib/store.ts e src/lib/api.ts do dashboard.

Reproduções com as funções atuais de store.ts:
- upsertLive(vm) → aplicarBenchmarkNaLive(clientId, refs) →
  marcarComoSalva(vm, serverId, idLocal) apaga benchmarks: o último passo
  sobrescreve o estado enriquecido com o snapshot antigo de vm.
- Enriquecer localmente e depois mesclarComServidor com o payload original
  também apaga benchmarks. App só atualiza localStorage/React no callback
  do benchmark; não envia o payload enriquecido para a API.
- removeLive(id) seguido de marcarComoSalva(vm, ...) recria a campanha.
  Essa corrida envolve o save; o callback isolado de benchmark já é no-op
  quando a campanha não existe. Não confunda as duas coisas.

Corrija as duas ordens de resposta (save antes do benchmark e vice-versa),
recarga, duas campanhas simultâneas e exclusão durante requests. Use
identidade estável e estado atual ao mesclar, preservando outras edições.
Sincronize o enriquecimento remotamente sem duplicatas. Confira a semântica
de client_id: repetir criação sem serverId pode ser idempotente e ignorar o
conteúdo novo, em vez de realizar o update pretendido.

Não ressuscite exclusões com callbacks tardios; trate também o save remoto
que ainda estava em voo. Diferencie fechar o modal após entregar a análise
(enriquecimento continua) de desmontar o App. Teste falhas de atualização,
payload efetivamente enviado, estado do servidor e tela após recarregar.

## 2. Cancelamento, timeout e busca compartilhada

Em app/service/benchmark_service.py, buscar_benchmarks usa await tarefa
diretamente. Reprodução com eventos e mock: cancelar o primeiro chamador
cancelou a tarefa compartilhada; retry iniciou uma segunda busca. Isso
contradiz o comentário de _buscar_e_cachear.

Proteja a tarefa contra cancelamento individual e mantenha seu registro
até o trabalho real terminar. Revise timeout do chamador, limpeza, exceções
sem consumidores, shutdown e segunda leitura do cache dentro do trabalho
compartilhado. Uma thread no executor pode continuar após cancelamento do
await: não alegue que esse cancelamento interrompe custo.

Teste com barreiras/eventos e double síncrono bloqueado no executor:
cancelar/expirar um interessado não cancela outro nem permite nova chamada
enquanto a primeira executa. Chaves diferentes continuam independentes.
Evite sleeps frágeis. Documente o limite por processo se múltiplos workers
não forem coordenados pelo desenho.

## 3. Grounding ainda aceita cobertura parcial

Reprodução: texto VALOR: 12.34; número no intervalo [7, 12); support [7, 8)
com um chunk HTTPS. _interpretar_resposta aceita 12.34 apesar de a fonte
cobrir só um caractere. _localizar_fonte_associada verifica sobreposição,
enquanto comentários e relatório afirmam cobertura exata.

Exija cobertura integral do trecho numérico. Confira os tipos do SDK
instalado para segment, part_index, candidates e offsets; não presuma que
response.text concatenado sempre coincide com o segmento original.
Use fixtures realistas, preferencialmente objetos do SDK, incluindo várias
partes e whitespace Unicode. Teste trecho parcial/fora do valor, índices
inválidos, supports mistos e fontes ambíguas/sem nome útil.

Metadado insuficiente produz falha transitória, sem cache negativo.
Associação de grounding prova atribuição local, não exatidão factual do
benchmark publicado; registre essa limitação sem prometer validação ao vivo.

## 4. Cache, schema, URLs e validação runtime

Falhas reproduzidas no backend:
- _cache_e_valido aceita CTR 999 e capturado_em inválido.
- valor textual no cache levanta TypeError em vez de produzir miss.
- BenchmarkEncontrado aceita valor 999, fonte só com espaço, URL https://
  sem host e timestamp vazio. Prefixo HTTP(S) não valida URL completa.
- Inicializar banco A, trocar DB_PATH para B e consultar cache gera
  OperationalError: no such table: benchmarks_mercado. _iniciado continua
  global; as fixtures resetam esse estado e escondem a lacuna.

Aplique invariantes coerentes no parser, cache, response_model e frontend:
CTR finito em 0 < value <= 100, tipos adequados (incluindo bool indevido),
fonte não vazia após trim, URL HTTP(S) analisável com host e data válida.
Defina/teste arrays parciais, duplicados e métricas extras. Resultado negativo
não deve carregar dados positivos incoerentes. Corrupção vira miss seguro;
falha de SQLite deve ter tratamento coerente, sem fingir ausência de fonte.
Vincule inicialização e tarefas à base correta quando DB_PATH mudar.

Investigue cache legado: positivos sem atribuição comprovada e negativos
por falha transitória podem continuar válidos por 14 dias na mesma chave.
Reproduza com fixtures antigas; invalide/versione somente benchmarks se
necessário, preservando campanhas e dados do usuário.

No frontend, src/lib/api.ts valida finitude/prefixo/string de data, mas não
faixa, host ou validade temporal. Revise também referências restauradas de
localStorage e da API de campanhas: BenchmarkNote usa href e toFixed
diretamente sobre payload persistido. Proteja os caminhos alcançáveis;
validar apenas a resposta nova de benchmark não protege dados antigos.

## 5. Integração HTTP e cobertura real dos testes

App.benchmark.test.tsx mocka analyzeCampaign, buscarStatus e
buscarBenchmarkMercado. O caso chamado {resultados:[null]} retorna null
diretamente; 404/503/timeout fazem o mesmo. Isso testa a orquestração, mas
não HTTP, parsing ou validação. O teste de exclusão esvazia localStorage
diretamente, sem exercitar a ação da UI.

Mantenha testes unitários úteis e adicione integração com App/modal/API
reais, interceptando fetch na fronteira. Cubra status, análise, benchmark e
persistência com respostas concretas e promessas controladas: JSON inválido,
HTML, {resultados:[null]}, tipos incoerentes, 404/422/501/503, abort/timeout,
fonte válida e todas as sequências da seção 1. Espere o fluxo terminar antes
de assertivas negativas. Demonstre que falhas preservam a análise.

Os 107 testes direcionados passaram com warnings de updates fora de act.
Corrija a coordenação dos testes sem suprimir avisos. Não descreva mocks da
própria camada examinada como validação ponta a ponta dessa camada.

## 6. Conferir os demais requisitos dos sete lotes

- Revalide CampanhaEntrada.id: bool rejeitado com 422, payload original
  preservado no SQLite, criação/update normal e outros inteiros públicos.
- Confira LP em textos públicos e PR6 no prompt realmente despachado ao
  Gemini mockado. Preserve identificadores internos e lógica do engine.
- A paridade atual compara schema Python e labels Python. Tipagem TS
  garante coerência dentro do frontend, não entre linguagens/documentação.
  Compare as quatro fontes sem inventar uma quinta lista literal.
- Fallback monetário usa motivo genérico de inexistência de benchmark.
  Ausência de contrato de moeda não prova inexistência: diferencie
  inelegibilidade, ausência explícita e indisponibilidade técnica, na UI
  e no contrato. Não invente uma busca concluída.
- Confira status.benchmark, deduplicação de status e reação a falhas.
  Diferencie configuração disponível de saúde efetivamente comprovada.
- Revise validade de referências exibidas/restauradas: TTL do cache no
  servidor não expira automaticamente o conteúdo de uma campanha salva.
- Confira redação de exceções e logs, sem expor chave/conteúdo bruto
  desnecessário. Teste com sentinelas fictícias.

## Validação e entrega

Após as correções, execute com IA desligada, chave fictícia e bancos
temporários, usando dependências já instaladas:
- Backend: python -m pytest -q em backend/backend-nexgestor-main.
- Dashboard: npm test, npm run lint, npm run build.
- OpenAPI, git diff --check e revisão dos arquivos novos e modificados.

Se TestClient travar no sandbox, registre o problema e use o mecanismo de
aprovação do ambiente quando necessário. Timeout não é teste aprovado.

Registre cada lote validado em docs/sessions/AAAA-MM-DD.md conforme CLAUDE.md.
Reconcilie PRD, contrato, CLAUDE e roadmap com o resultado observado.
Confira alegações de “tudo commitado” diante do Git real e diferencie a
contagem histórica do item 16 de uma contagem atual. Não reescreva sessões
históricas: acrescente retificações datadas.

Entregue achados com arquivo/linha, impacto, reprodução, correção e teste;
matriz dos sete lotes; comandos/contagens observados e veredito local.
Separe implementado, validado, commitado, enviado e implantado. Grounding
real, nginx A2 e ativação em produção permanecem fora desta execução.
Não aprove lotes com bugs confirmados sem correção/teste. Descreva qualquer
impedimento real e o trabalho ainda necessário com precisão.
