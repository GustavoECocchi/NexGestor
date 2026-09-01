# Validação intensiva do backend e do dashboard NexGestor

Execute uma rodada ampla, determinística e documentada de testes no backend e no dashboard. O objetivo é observar como o sistema se comporta com grande variação de dados, encontrar inconsistências reais e entender qualquer falha — não apenas obter uma saída verde.

## Escopo confirmado

- Backend ativo: `backend/backend-nexgestor-main/`.
- Frontend ativo: `frontend/nexgestor-dashboard/`.
- A extensão Chrome foi descontinuada. Não execute testes, build ou manutenção em `frontend/nexgestor-extension/` ou `extensao-pronta/`.
- Não acesse produção, VPS, Gemini, APIs externas ou serviços pagos.
- Não abra `.env` reais e não exponha segredos.

## Regra principal sobre falhas

Se qualquer teste falhar, não altere imediatamente o teste nem o código para fazê-lo passar. Primeiro:

1. reproduza a falha isoladamente;
2. registre seed, payload, estado inicial, resultado obtido, resultado esperado, traceback e arquivos/linhas envolvidos;
3. reduza o caso para o menor exemplo que ainda falha;
4. confira schema, contrato da API, PRD, regras do engine e comportamento atual;
5. classifique a causa como defeito de produção, teste incorreto/expectativa desatualizada, contrato/documentação divergente, problema ambiental ou comportamento ambíguo que exige decisão de produto;
6. explique a classificação com evidências antes de propor qualquer correção.

Nunca enfraqueça uma asserção, remova um teste, aumente tolerância ou atualize um snapshot apenas para deixar a suíte verde. Uma falha reproduzível deve permanecer visível até entendermos sua causa.

## Etapa 1 — diagnóstico e linha de base

1. Inspecione o estado do Git e preserve mudanças preexistentes. Em caso de `dubious ownership`, use `git -c safe.directory="<caminho absoluto>"` apenas no comando necessário; não altere configuração global.
2. Leia as configurações e os scripts de teste do backend e dashboard.
3. Identifique comandos oficiais, versões, testes coletados e mecanismos que bloqueiam rede/IA.
4. Execute primeiro as suítes existentes sem alterar nada:
   - backend: suíte completa do `pytest`;
   - dashboard: suíte completa do Vitest, type-check e build de produção.
5. Registre duração, quantidade coletada, pass/fail/skip e warnings.

Se a linha de base falhar, investigue-a antes dos testes intensivos. Continue nas áreas independentes seguras, sem esconder a falha inicial.

## Etapa 2 — backend: no mínimo 36.000 casos exploratórios

Crie um harness temporário e determinístico fora do código de produção, com seed fixa registrada e sem rede.

### A. 30.000 campanhas válidas variadas

Varie combinatória e pseudoaleatoriamente:

- Meta, Google, TikTok e LinkedIn;
- objetivos e tipos aceitos pelo schema;
- métricas ausentes, parciais e completas;
- zero legítimo versus campo ausente;
- valores muito pequenos, normais, altos e próximos dos limites;
- relações coerentes e incoerentes entre impressões, alcance, cliques, visitas, conversões, investimento e receita;
- metas padrão, personalizadas, permissivas e restritivas;
- amostras pequenas, médias e grandes;
- combinações que acionem cada cenário A–O;
- campanhas GREEN, RED e elegíveis a BLUE no frontend;
- IA desabilitada e retorno ausente, sempre com mock local;
- dados suficientes e insuficientes para score/confiança.

Valide score, cobertura e confiança; ausência não convertida em zero; inexistência de `NaN`, `Infinity`, valores impossíveis ou textos contraditórios; status coerente; efeito real das metas; cenários incompatíveis; ausência de previsão ou escala inventada; determinismo; e não mutação do input.

### B. 5.000 entradas inválidas e de fronteira

Cubra tipos errados, strings vazias, campos desconhecidos, enums inválidos, negativos, booleanos como números, `null`, extremos, payloads incompletos, nesting incorreto, nomes excessivos e `NaN`/`Infinity`. Verifique rejeição e código HTTP corretos, erro estruturado sem segredo/traceback, servidor funcional após rejeição e nenhum 500 onde deveria haver 4xx.

### C. 1.000 operações de persistência/isolamento

Varie donos, capitalização, espaços, IDs, criação, listagem, atualização, remoção, limites por dono e global. Verifique isolamento, `X-Nex-Dono`, normalização, idempotência esperada, limites, códigos, integridade do payload e intercalamento determinístico.

## Etapa 3 — dashboard: no mínimo 7.000 casos exploratórios

Use Vitest/jsdom e funções puras sempre que possível. Não abra navegador externo.

### A. 5.000 variações de adapter, formatação e status

Varie opcionais, zeros, cenários, status, scores, confiança, métricas e textos. Confirme que o adapter não inventa zero, status/BLUE seguem as regras, formatos estão corretos, texto externo é sanitizado, nenhuma combinação válida quebra e a resposta não é mutada.

### B. 1.000 variações de importação/formulário

Cubra JSON válido, parcial e inválido, campos desconhecidos, tipos errados, plataformas, métricas, metas, zeros, arquivos grandes razoáveis e conteúdo malicioso. Verifique allowlist, mensagens e payload final.

### C. 600 transições de estado, API e persistência

Cubra dono ausente/presente, loading, sucesso, 4xx, 429, 5xx, timeout, resposta malformada, IA on/off/falhando/desconhecida, criar/listar/apagar e fallback local. Tudo com mocks e sem chamadas reais.

### D. 400 renderizações e interações críticas

Varie RED/GREEN/BLUE, dados ausentes, temas, navegação, detalhe, `MetricFeed`, Copiloto, tooltips, teclado e estados vazios/erro. Inclua bugs registrados no roadmap e confirme no código se ainda existem.

## Etapa 4 — contrato entre backend e dashboard

Valide pelo menos 2.000 respostas reais do engine passando pelo contrato esperado pelo adapter, por fixtures temporárias ou harness local, sem servidor externo. Confirme nomes/tipos, opcionais/`null`, plataformas/enums, status, cenários, métricas, targets, persistência/header do dono, que nenhuma resposta válida quebra o adapter e que o dashboard não depende de campo inexistente.

Total mínimo: **45.000 casos** (36.000 backend + 7.000 dashboard + 2.000 contrato), além das suítes existentes, type-check e build.

## Implementação dos testes exploratórios

- Não altere código de produção nesta etapa.
- Prefira harnesses temporários ou testes de auditoria claramente identificados.
- Não gere milhares de testes estáticos nem comite payloads enormes.
- Use loops parametrizados/propriedades com seed e contraexemplo.
- Ao revelar regressão real, proponha teste pequeno permanente, mas não corrija o produto sem aprovação.
- Não instale bibliotecas novas; limite o paralelismo.
- Se o volume for inviável, demonstre com dados, execute o maior volume seguro e informe exatamente o que faltou.

## Entrega obrigatória

Ao final, apresente:

1. tabela separada para backend, dashboard e contrato com planejado, executado, pass/fail/skip, duração e seed;
2. suítes existentes, type-check e build;
3. matriz das dimensões cobertas;
4. cada falha com menor caso reproduzível e classificação;
5. warnings, comportamentos estranhos e lacunas;
6. bugs que merecem teste permanente;
7. limitações e cenários não cobertos;
8. estado final do Git e arquivos criados/modificados.

Não faça commit, push ou deploy. Não corrija código de produção. Ao encontrar falha, pare apenas o fluxo dependente, investigue profundamente e continue verificações independentes seguras.
