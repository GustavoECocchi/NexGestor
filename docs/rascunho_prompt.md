Execute a correção focada dos quatro achados da última revisão Codex de P5.
O usuário autoriza corrigir produto, testes e contrato necessários a esse delta,
validar e registrar a entrega local. Sem commit, push, PR, merge ou deploy.
Não reinicie P5 nem refaça a auditoria geral.

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md. Referências canônicas:
- docs/sessions/2026-09-09.md, seção "Revisão Codex — entrega do Claude após
  matriz revisada": é a revisão vigente e o ponto de retomada deste prompt.
- Na mesma sessão, "Continuidade — P5 corrigido: achados 1–4 e linguagem" e
  "Continuidade — P5 corrigido: matriz revisada": implementação e limites
  anteriores, a conferir contra o código; não são aprovação independente.
- docs/sessions/2026-09-08.md, "Decisão de produto — P5: bloquear criação
  com explicação contextual", incluindo refinamento de linguagem aprovado.

Base revisada: fix/p5-validacao-consistencia-metricas, HEAD 692a0f9, índice
vazio, alterações locais e arquivos novos. Confira branch, HEAD, status,
diff local/staged e arquivos novos relacionados antes de editar. As linhas
citadas abaixo são da versão revisada; localize as funções no código atual.
Preserve trabalho preexistente, histórico das sessões e stash do benchmark.
Não misture a tarefa ao PR #5 de governança, não reabra PR #4 e não traga
P1–P4 de outra branch. P6/P7 ficam fora do escopo.

REQUISITO

Bloquear dados demonstravelmente inválidos/contraditórios com explicação
específica, compreensível e fiel aos números. Não corrigir/descartar valores
silenciosamente para aceitar a campanha. Preservar fluxos legítimos e leitura
de legados. Não inventar fundamento analítico nem transformar limite conhecido
em aprovação. A decisão de rejeitar já existe; não perguntar novamente.

1. FECHAR A VALIDAÇÃO ESTRUTURAL DA GRAVAÇÃO

Em app/service/campaign_payload.py, _lista_opcional verifica apenas se o bloco
é uma lista. Reprodução confirmada por HTTP, em SQLite temporário:
POST /api/v1/campaigns, header X-Nex-Dono: review-p5, corpo:
{"payload":{"id":1000,"name":"Review","platform":"Meta Ads","status":"GREEN","score":88,"invest":0,"revenue":0,"tiles":[null]}}
Resultado: 200; GET devolve tiles:[null].

MetricFeed.tsx:61 faz c.tiles.map(canonico); canonico, linha 52, acessa t[0],
que falha para null. A gravação/GET foram executados pelo Codex; a falha de
renderização foi identificada pelo caminho de código, sem navegador nessa
revisão. Reproduza o consumidor real em teste para fechar essa evidência.

Os blocos não são todos "apenas textos": Tile é tupla e seu score numérico
é usado na altura das barras (MetricFeed.tsx:133–137). Conferir types.ts,
adapt.ts e consumidores. Validar forma, tipos e faixas pertinentes dos itens
aceitos, além de campos obrigatórios consumidos sem fallback. Avaliar os
outros blocos aceitos pelo mesmo critério, sem inventar restrições a texto livre.
Não se exige comprovar procedência da análise ou veracidade de recomendações.
Não mascarar a falha descartando itens inválidos ou apenas tolerando null na UI:
a fronteira de escrita deve rejeitar o dado inválido antes de persistir.

Preservar leitura de legados, reenvio por client_id, atualização por id e VM
real produzido pelo adapter. Não migrar/apagar dados reais. Avaliar consumidores,
compatibilidade e reversibilidade do contrato; não tornar todos os opcionais
obrigatórios sem verificar uso e versões. Se a mudança puder rejeitar reenvios
legítimos, tratar explicitamente essa compatibilidade e o feedback de erro.

Regressões: corpo acima e deformações pertinentes retornam 422 sem gravação;
VM completo real com blocos preenchidos salva, relê e renderiza. Não basta uma
fixture mínima com todas as listas vazias nem apenas comparar nomes de chaves.
Atualizar contrato/docstrings conforme o comportamento efetivamente validado.

2. IMPEDIR 500 COM INTEIRO GRANDE

campaign_payload.py:87–89, _e_numero chama math.isfinite sobre int arbitrário
vindo do JSON. Use o corpo do item 1, com tiles:[] e score igual a 10**400
(número JSON com 401 dígitos, não a string "10**400"). Resultado reproduzido:
HTTP 500 por conversão de int enorme para float. O corpo tem centenas de bytes;
não exige carga grande, ataque de volume ou esgotamento de recursos.

Validar tipo/faixa sem conversão que estoure. Dado inválido deve retornar 422,
sem gravação e sem truncar/arredondar para caber. Cobrir campos que compartilham
esse helper, mantendo rejeição de bool e números não finitos. Não impor limite
arbitrário novo para campos independentes: usar contrato/faixa aplicável.
Não basta testar status lista/objeto, que já foi corrigido.

3. PRESERVAR PRECISÃO NA EXPLICAÇÃO DE R1

metric_consistency.py:108–121, _fmt_pct mantém duas casas para taxas comuns.
Caso reproduzido:
metrics = {"impressions":100000,"link_clicks":1234,"ctr_link":1.228}
Taxa implícita: 1,234%; declarada: 1,228%. A R1 rejeita, mas o texto apresenta
as duas como 1,23%, inclusive dizendo que o campo foi preenchido com 1,23%.
As quantidades ainda diferem, mas isso não autoriza ocultar os percentuais nem
alterar o valor declarado na mensagem.

Mostrar precisão suficiente para distinguir os valores em conflito, preservando
o declarado e a leitura em português. Manter clareza também para dízimas e
valores pequenos; não despejar resíduos de float ou texto ilimitado. Não mudar
a regra de comparação só para a mensagem parecer certa. Acrescentar regressões
que verificam a mensagem, o valor informado e a diferença visível, além do 422.

4. CORRIGIR A GLOSA DE THRUPLAY

metric_consistency.py:179 chama os eventos de "reproduções quase completas do
vídeo", mas a glosa admite pelo menos 15 segundos sem limitar a duração total.
Pelo próprio critério escrito, 15s de um vídeo de 120s satisfazem esse ramo e
não são uma reprodução quase completa. Usar nome neutro e explicar a condição
com linguagem simples, sem essa equivalência. Conferir mensagem e ajuda do
formulário afetadas para não manter duas explicações conflitantes.

O schema antigo não é fonte independente para encerrar o conflito de domínio.
A consulta Codex a https://www.facebook.com/business/help/2051461368219124
retornou login/bloqueio: 97% não foi confirmado externamente nesta revisão.
Consultar fonte primária aplicável se acessível e registrar exatamente o que
ela sustenta. Não afirmar validação de fonte que não leu nem usar resumo de
busca como prova. Se o acesso continuar indisponível, corrigir a equivalência
falsa demonstrada, evitar detalhe externo não sustentado e explicitar o limite.
Não expandir para reformular todas as métricas/plataformas ou restaurar R3.

PRESERVAR O QUE JÁ FOI CORRIGIDO

- Rejeição dos corpos antigos com input extra e de status lista/objeto.
- Comparação interna de receita/investimento/ROAS e formato fechado.
- Comparação Decimal e critério atual de precisão; não restaurar a curva de 5%.
  Os casos 5/5,2 e 0,35/0,45 já foram corrigidos; esta rodada ajusta o texto.
- Bloqueio de negativos/fracionários P5 antes da normalização, em ambos os modos.
- Reimportação corrigida na mesma instância e feedback de revalidação após edição.
- Matriz/checkpoint existentes; atualizar conclusões sem apagar evidência histórica.

VALIDAÇÃO E ENTREGA

Trabalhar em etapas recuperáveis: reproduzir, corrigir, testar, registrar.
Ambiente isolado: GEMINI_ENABLED=false, BENCHMARK_ENABLED=false, SQLite
em diretório temporário. Sem chamadas pagas, dados reais ou segredos.

Referência da última revisão independente, não prova do próximo delta:
- Backend: py -m pytest -q test_metric_consistency.py test_storage.py
  test_regressao_20260825.py test_regressao_20260904.py -p no:cacheprovider
  → 260 passed.
- Dashboard: npm test -- src/test/components/NewCampaignModal.p5.test.tsx
  src/test/components/NewCampaignModal.test.ts src/test/lib/api.test.ts
  → 77 passed, 3 arquivos.
Esses testes verdes coexistiram com os achados acima; acrescentar regressões
significativas nos testes existentes e validar o contrato com consumidores reais.

Depois das correções, executar os testes afetados e verificações pertinentes.
Como a escrita compartilhada terá contrato mais estrito, rodar a suíte backend
no fechamento. Rodar a suíte dashboard e tsc/lint/build se alterar o frontend;
para mudanças só backend, exercitar também o fluxo real de VM→gravação→leitura
com os testes de integração pertinentes. Não repetir suítes sem nova mudança,
falha ou incerteza que justifique. Se necessário no Windows, PYTHONUTF8=1 evita
a falha ambiental de encoding já registrada. Para build, usar VITE_API_BASE
válido de teste por ambiente (ex.: https://build-de-teste.invalid), sem editar
.env real/configuração de produção. Executar git diff --check.

Inspecionar a mensagem/consumidor em navegador se houver ferramenta disponível,
sem instalar ferramentas só para isso. Registrar limite de viewport estreito
ou acessibilidade que não consiga verificar. Aceite com leigo permanece
separado: não afirmar que teste automatizado ou inspeção do agente o comprovou.

Registrar em docs/sessions/AAAA-MM-DD.md: base observada, achado/correção,
regressão e resultado, compatibilidade, fonte conferida ou limite, estado e
próxima ação. Na mesma data, atualizar a seção da tarefa quando cabível e
preservar a revisão anterior. Roadmap só muda se a frente mudar de fase.
Não usar este rascunho como log.

Entregar resumo por item 1–4, arquivos alterados, comandos/resultados e limites,
com revisão independente do novo delta pendente para Codex. Não declarar P5
concluído se restar bloqueador material; não exigir eliminar backlog alheio.
Sem commit, push, PR, merge, deploy, manipular stash ou integrar governança.
