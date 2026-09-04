# Auditoria integral de requisições e comunicação do NexGestor

Faça uma auditoria técnica ponta a ponta de **todas as requisições de rede e
todos os sinais entre frontend e backend** do NexGestor. Não se limite aos
endpoints principais nem ao caminho de sucesso. O objetivo é reconstruir o
fluxo real, provar os contratos, localizar falhas, riscos e contextos perdidos
e mostrar exatamente o que acontece desde uma ação ou efeito no navegador até
o estado final apresentado ao usuário.

Esta etapa é de diagnóstico. **Não corrija o código de produção durante a
auditoria.** Primeiro entregue os achados completos, com evidência e proposta
de correção/teste. Não faça commit, push ou deploy.

## Escopo e fontes

- Frontend ativo: `frontend/nexgestor-dashboard/`.
- Backend ativo: `backend/backend-nexgestor-main/`.
- Camada de rede/deploy: `deploy/`, especialmente nginx e Docker Compose.
- Configuração: leia somente código, arquivos de exemplo e documentação. Não
  abra `.env` reais, não mostre segredos e não dependa de valores secretos.
- Leia antes de concluir:
  - `CLAUDE.md`;
  - `docs/roadmap.md`;
  - `docs/CONTRATO_API_FRONTEND.md`;
  - as partes relevantes de `docs/PRD.md` e `docs/sessions/`;
  - `frontend/nexgestor-dashboard/src/lib/api.ts` e todos os seus chamadores;
  - rotas, schemas, handlers, services e configuração do backend;
  - configuração de nginx/deploy e os testes existentes relacionados.
- A extensão Chrome foi descontinuada/removida. Não a recrie nem use seu
  comportamento como contrato atual. Documentação histórica pode ser
  consultada apenas para rastrear decisões.
- Inspecione `git status` e `git diff` antes de qualquer teste. Preserve todas
  as mudanças preexistentes do worktree e não as atribua à auditoria.

Não acesse produção, VPS, Gemini nem qualquer serviço externo. Não faça
requisições pagas. Use inspeção estática, mocks, `TestClient`, jsdom e servidor
local quando necessário. Qualquer harness temporário deve ficar fora do código
de produção e ser removido ao final.

## 1. Descoberta exaustiva e inventário canônico

Descubra as requisições pelos dois lados e reconcilie os resultados:

1. No frontend, procure `fetch`, clientes HTTP, URLs absolutas, imports de
   recursos externos, efeitos de montagem, callbacks, timers, aborts e todo
   ponto que possa iniciar tráfego.
2. No backend, enumere todos os decorators de rota, routers e prefixos, além
   das rotas automáticas do FastAPI, middleware CORS, handlers de exceção e
   chamadas de saída para serviços externos.
3. No deploy, enumere redirects, `location`, proxy, preflight, rate limiting,
   limites de corpo, timeouts, cabeçalhos e arquivos estáticos.
4. Cruze os três inventários para encontrar endpoint fornecido e não usado,
   endpoint usado e não fornecido, caminhos duplicados, caminhos documentados
   mas inexistentes e tráfego externo que não passa por `api.ts`.

O inventário deve considerar, sem assumir que esta lista esteja completa:

- documentos, JavaScript, CSS, imagens, fontes e demais assets carregados pelo
  navegador, inclusive Google Fonts ou outro terceiro;
- redirects HTTP→HTTPS e navegação para o dashboard;
- preflights `OPTIONS` gerados por `Content-Type: application/json` e
  `X-Nex-Dono`;
- análise de campanha;
- consulta de status/capacidades;
- listagem, criação/atualização e exclusão de campanhas persistidas;
- catálogo e health checks do engine;
- health check raiz, OpenAPI, Swagger e ReDoc expostos automaticamente;
- chamada backend→Gemini e sua resolução DNS/TLS/timeout pelo SDK;
- qualquer telemetria, analytics, websocket, SSE, beacon, atualização
  automática ou polling — registre explicitamente se não existirem.

Para **cada requisição**, produza uma linha com:

- identificador e finalidade;
- origem e gatilho exato;
- ambiente em que ocorre (dev, build local, produção ou todos);
- método e URL final, incluindo composição de `VITE_API_BASE` e prefixos;
- headers, credenciais/cookies e motivo de preflight;
- formato e origem do body;
- timeout, cancelamento, retry e deduplicação;
- nginx/middleware atravessados;
- handler e validação no backend;
- leitura/escrita ou outro efeito colateral;
- status e corpo possíveis;
- consumidor da resposta e transformação feita;
- estado visual/fallback final;
- teste existente que a cobre, ou lacuna de teste.

## 2. Rastreamento ponta a ponta dos fluxos reais

Reconstrua ao menos estes fluxos completos, citando funções e linhas:

1. Primeira abertura do dashboard: assets, fonte, portão de dono, consulta de
   status, leitura local, listagem remota e merge.
2. Análise manual e por importação de arquivo: formulário → normalização →
   payload → `POST` → CORS/nginx → Pydantic → engine → Gemini opcional →
   response model → JSON → adapter → estado da IA → UI/localStorage →
   persistência remota.
3. Abertura com campanhas locais ainda não salvas e sincronização posterior,
   incluindo múltiplas campanhas pendentes.
4. Criação versus atualização no servidor e conversão entre id local e id do
   servidor.
5. Exclusão local e remota, incluindo `404`, erro de servidor e corrida entre
   o `GET` inicial e o `DELETE`.
6. Backend, nginx ou rede indisponível; timeout; abort; resposta vazia,
   truncada, HTML no lugar de JSON ou JSON com formato incorreto.
7. CORS permitido e negado, inclusive erro gerado pelo nginx sem cabeçalhos
   CORS e preflight atingindo rate limit.
8. Análises simultâneas, clique duplo, remontagem do React/Strict Mode,
   navegação durante request e resposta chegando depois de desmontar o
   componente.

Em cada fluxo, identifique a fonte de verdade em cada instante: estado React,
`localStorage`, SQLite, resposta do backend ou observação da última análise.
Mostre onde o sinal pode ser perdido, duplicado, reordenado, tratado como
sucesso sem ter concluído ou transformado silenciosamente.

## 3. Contrato frontend ↔ backend

Compare diretamente:

- tipos TypeScript;
- payload realmente montado;
- schemas Pydantic e defaults;
- `response_model` e serialização;
- adapter e componentes consumidores;
- documentação do contrato;
- fixtures e mocks de teste.

Verifique nomes, tipos, enums, opcionais, `null`, zero versus ausente, campos
desconhecidos, números não finitos, limites, valores extremos, arrays/objetos,
mensagens de erro e compatibilidade com campanhas antigas salvas. Procure
casts TypeScript que apenas prometem um tipo sem validar o JSON em runtime.

Confirme também:

- se URL base vazia, inválida, com barra final ou sem HTTPS produz o caminho
  correto e não causa `//api`, mixed content ou fallback acidental para
  localhost em build de produção;
- se método, `Content-Type`, `X-Nex-Dono` e CORS combinam em todas as rotas;
- se os status documentados coincidem com os realmente devolvidos por
  FastAPI, middleware, storage e nginx;
- se o frontend distingue corretamente `400`, `404`, `413`, `422`, `429`,
  `500`, `501`, `502`, `503`, `504`, timeout, CORS e falha de parsing;
- se algum erro importante é reduzido silenciosamente a `null`, `falhou` ou
  estado vazio, impedindo o usuário e a equipe de saber o que aconteceu;
- se resposta `2xx` malformada pode contaminar estado ou persistência;
- se a documentação promete uma garantia que existe apenas nos mocks.

## 4. Rede, proxy, CORS e segurança

Audite a cadeia navegador → DNS/TLS → nginx → Uvicorn/FastAPI e, quando
aplicável, backend → Gemini:

- origens permitidas, credentials, methods, headers e cache de preflight;
- comportamento dos cabeçalhos CORS em respostas do backend e em erros
  produzidos pelo próprio nginx;
- redirect, TLS, host/proto encaminhado, path e preservação de status/body;
- rate limit, burst e se `OPTIONS`, health/status e análise consomem a mesma
  cota indevidamente;
- limites de body em cada camada e divergências entre nginx, Pydantic e
  persistência;
- timeouts do navegador, proxy, servidor e Gemini, inclusive qual camada
  vence e se o trabalho/custo continua após o cliente abortar;
- exposição de `/docs`, `/redoc`, `/openapi.json`, health/status e metadados;
- autenticação/autorização real do `X-Nex-Dono`, isolamento entre donos,
  possibilidade de forjar identidade e risco de CSRF/CORS;
- vazamento de payload, traceback, chave ou configuração em resposta/log;
- sanitização de conteúdo vindo do backend/IA antes de renderizar HTML;
- dependência e privacidade de recursos de terceiros, especialmente fontes;
- cache, compressão e headers de segurança quando forem relevantes;
- possibilidade de abuso, replay, duplicação de POST e ausência de
  idempotência.

Não faça pentest destrutivo nem envie carga para ambientes externos. Demonstre
problemas localmente com o menor caso possível.

## 5. Concorrência, resiliência e consistência

Investigue:

- requests duplicadas por efeitos, remontagem ou ação repetida;
- respostas fora de ordem sobrescrevendo estado mais novo;
- timeout/abort no cliente sem cancelamento real no servidor;
- sincronização local→servidor parcial, falha no meio do lote e repetição na
  próxima abertura;
- updates concorrentes e política de último escritor;
- corrida entre listar, salvar e apagar;
- campanha removida reaparecendo;
- id local colidindo ou sendo reancorado incorretamente;
- falha de persistência mascarada como sucesso local;
- resposta tardia atualizando componente desmontado;
- ausência de retry, backoff ou idempotency key onde isso possa causar dano;
- comportamento offline e recuperação quando a rede volta.

Diferencie claramente comportamento deliberado, risco aceito, bug confirmado
e hipótese que precisa de decisão de produto.

## 6. Observabilidade e cobertura de testes

Para cada fronteira de rede, verifique se existem logs úteis, correlação entre
cliente/proxy/backend, métricas, mensagens acionáveis e redação de segredo.
Mostre quais falhas hoje seriam invisíveis ou indistinguíveis em produção.

Monte uma matriz de cobertura com caminhos de sucesso e falha. Leia e execute
os testes existentes; não presuma cobertura pelo nome. Quando necessário,
use testes/harnesses temporários para provar o comportamento de:

- payload e headers exatos;
- timeout e abort;
- preflight/CORS;
- todos os status relevantes;
- JSON malformado ou contrato divergente;
- duplicação e corridas;
- indisponibilidade do Gemini e da persistência;
- ausência de rede externa durante a suíte.

Rode, sem instalar dependências:

- suíte completa do backend com `pytest`;
- suíte completa do dashboard com `npm test`;
- `npm run build`;
- `npm run lint`.

Não enfraqueça testes nem altere expectativas para obter verde. Como esta é
uma auditoria, não deixe novos testes ou alterações de produção no worktree;
registre quais testes permanentes deveriam ser criados na etapa de correção.

## 7. Rastreabilidade documental e contexto perdido

Cruze código, testes, contrato, PRD, roadmap, sessões e histórico do Git.
Procure decisão/requisito omitido, requisito órfão, deriva de implementação,
contradição, documentação desatualizada, inferência apresentada como fato e
afirmação sem evidência.

Não chame automaticamente de “alucinação”. Classifique cada item como
`confirmado`, `contradito`, `desatualizado`, `ambíguo`, `requisito órfão` ou
`afirmação sem suporte`, sempre com caminho/linha e evidência. Documentação
histórica não está errada apenas por descrever um estado antigo; considere a
data e decisões posteriores. Não reescreva registros históricos.

## Classificação dos achados

Para cada achado, informe:

- severidade: `P0 crítico`, `P1 alto`, `P2 médio` ou `P3 baixo`;
- natureza: segurança, privacidade, contrato, confiabilidade, concorrência,
  UX/erro, desempenho, observabilidade, documentação ou cobertura de teste;
- classificação: bug confirmado, risco demonstrado, comportamento esperado,
  dívida aceita, divergência documental ou hipótese não confirmada;
- evidência com arquivo/linha e menor reprodução;
- impacto real e quem é afetado;
- correção mínima recomendada;
- teste permanente que impediria regressão.

Não aumente severidade só porque o cenário é teoricamente grave: combine
probabilidade, alcance e impacto no sistema real. Não declare segurança nem
completude por ausência de falha nos testes.

## Entrega obrigatória

Entregue um relatório autocontido contendo:

1. resumo executivo e os achados mais importantes;
2. diagrama textual da topologia e das fronteiras de confiança;
3. inventário canônico de **todas** as requisições encontradas;
4. rastreamento dos fluxos ponta a ponta;
5. matriz de contrato frontend/backend/status/fallback;
6. achados ordenados por severidade, com evidência e reprodução;
7. matriz de testes existentes versus lacunas;
8. tráfego procurado e não encontrado (telemetria, websocket, polling etc.);
9. divergências documentais e possíveis contextos perdidos;
10. limitações da auditoria e tudo que exigiria validação em ambiente real;
11. plano de correção em ordem segura, sem implementar ainda;
12. comandos executados, resultados e estado final do Git.

Se não for possível provar alguma camada sem tocar produção, marque-a como
`não verificada` e explique exatamente qual evidência falta. Não use “tudo
parece correto” como conclusão sem inventário reconciliado dos dois lados e
sem rastrear os caminhos de erro.
