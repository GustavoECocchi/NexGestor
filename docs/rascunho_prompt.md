# Revisão independente pelo Opus 5 — último commit do Sonnet

Revise criticamente o commit `2cb13db84f390009ef4162d6ca784893f2aae226`
(`fase-2b: corrige atribuicao parcial de fonte no grounding e valida com
Gemini real`), comparando com seu pai `77e29dd`. O objetivo é verificar se
as correções recentes do Sonnet resolvem os problemas e se as evidências
sustentam o estado declarado. Esta execução é uma REVISÃO, sem implementar
correções no produto. Produza achados reproduzíveis e um veredito por lote.

Este prompt substitui o anterior de legibilidade. Não execute a antiga
reescrita visual nem retome todas as pendências do roadmap. O nome Opus 5
indica o revisor pretendido; este arquivo não altera o modelo da ferramenta.

## Preparação e limites

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md. Confira git status, o hash do
HEAD, o diff completo do commit alvo e os testes atuais. Se houver novos
commits, mantenha `2cb13db` como alvo e diferencie correções posteriores.

Leia docs/sessions/2026-09-07.md inteiro: há uma análise anterior e uma
continuação do Sonnet sobre correção e chamadas reais. O commit também
incorpora a análise anterior; não atribua todo o documento ao Sonnet.
Consulte o contrato da API e o PRD da fase-2b nos pontos pertinentes.

Preserve arquivos preexistentes e mudanças de outros processos. Na criação
deste prompt havia um arquivo não rastreado:
`backend/backend-nexgestor-main/data/benchmark_local_test.db`.
Não o apague, altere ou use como banco de testes. O relato diz que foi
removido; confira a divergência pelo estado dos arquivos sem presumir sua
origem ou que seja exatamente o banco daquela execução.

Não leia/exiba o .env real, chaves ou prefixos de chaves. Não altere
configuração local para fazer a suíte passar. Execute testes com variáveis
fictícias e bancos temporários. Não faça novas chamadas ao Gemini, ao VPS
ou a produção. A autorização de chamadas da sessão anterior não é um novo
orçamento para esta revisão. Não faça commit, push, deploy ou instalação
de dependências. Preserve BENCHMARK_ENABLED desligado por padrão.

Pode criar reproduções e testes temporários isolados, preferencialmente em
/tmp ou em cópia temporária dos arquivos rastreados. Não copie .env/data.
Se usar mutação para medir força dos testes, faça-a nessa cópia; não use
git checkout/reset/clean para restaurar arquivos do worktree compartilhado.
As únicas edições persistentes desta revisão serão registro da sessão e,
se os achados mudarem a fase, atualização factual da linha do roadmap.

## Escopo exato

O commit altera cinco arquivos:

- backend/backend-nexgestor-main/app/service/benchmark_service.py;
- backend/backend-nexgestor-main/app/service/storage.py;
- backend/backend-nexgestor-main/test_benchmark_mercado.py;
- docs/roadmap.md;
- docs/sessions/2026-09-07.md.

Amplie a leitura para ai_service.py, config.py, rota de benchmark e SDK
instalado quando necessário para provar comportamento nas fronteiras.
Frontend só precisa ser consultado para contrato/timeout/impacto: não há
mudança visual neste commit.

## Lote A — atribuição de fonte e cobertura integral

Defeito anterior: em `VALOR: 12.34`, um support `[7,8)` com fonte válida e
outro `[8,12)` sem fonte válida eram somados, atribuindo o número inteiro
à fonte que sustentava apenas um byte. O Sonnet passou a filtrar os índices
válidos de CADA support antes de contar o intervalo.

1. Reproduza as três variantes no pai e no commit alvo: lista de índices
   vazia, índice fora da faixa e chunk sem web. O pai deve aceitar
   indevidamente; o alvo deve rejeitar como falha transitória.
2. Verifique casos adjacentes: URL inválida, índices negativos, mistura de
   índices válidos/inválidos, buracos, sobreposição, supports fora do
   número, ordem invertida e duplicatas. Avalie tipos malformados somente
   quando alcançáveis pela desserialização do SDK/caminho real; não promova
   um double impossível a falha de produção sem explicar a fronteira.
3. Prove os controles positivos: uma fonte cobre tudo; vários supports
   adjacentes da MESMA URL cobrem tudo; chunks duplicados da mesma URL não
   criam falsa ambiguidade. Duas URLs distintas devem seguir a política
   conservadora existente de rejeição, inclusive se cada uma cobre só parte.
4. Preserve bytes UTF-8 e part_index, inclusive respostas com várias Part.
   Não aceite cobertura somada de partes distintas. Verifique se filtrar
   chunks antes da cobertura sustenta a invariável por fonte ou apenas
   resolve as três fixtures literais.
5. Exercite o serviço e a rota: rejeição vira 503 e não grava resultado
   negativo/positivo; não pode virar 200 "não encontrado" ou 500 incidental.

Use objetos reais do google.genai nos fixtures. Não assuma que a correção
está incompleta: procure provar ou refutar a invariável, com casos positivos
para evitar aprovar uma solução que simplesmente rejeita tudo.

## Lote B — cache versão 2 e preservação de dados

Confirme que REGRA_BENCHMARK_VERSAO=2 afeta escrita E leitura. Em SQLite
TEMPORÁRIO, exercite cache legado sem versão, versão 1, versão 2 válida,
expirada e corrompida. Teste positivos e negativos; registre se a mudança
invalida ambos, mesmo que o comentário enfatize positivos.

Um cache v1 que ainda teria TTL não pode fornecer referência sob a regra
nova; deve provocar nova busca mockada. Uma entrada v2 válida deve evitar
busca. Falha transitória não deve substituir ausência/valor por uma mentira
cacheada. Verifique os testes existentes de versão: não basta continuarem
verdes se só verificam uma versão muito antiga e ignoram a transição 1→2.

Comprove que campanhas e payloads existentes permanecem intactos. Não é
necessário migrar/apagar banco real para testar essa garantia.

## Lote C — timeout dedicado e isolamento da análise principal

O relato descreve erro real 400 com deadline de 8s e mínimo de 10s. A
correção adiciona `_TIMEOUT_BUSCA_MS=12_000` em
GenerateContentConfig.http_options da chamada com google_search.

- Confira no SDK INSTALADO se o campo é suportado, a unidade é milissegundos
  e a configuração por chamada prevalece sobre o timeout de 8s do cliente.
  Prefira inspecionar o SDK e interceptar transporte sem rede. Aceitar kwargs
  num MagicMock permissivo não prova que o HTTP final usa o valor correto.
- Faça uma regressão comportamental que exercite `_executar_busca`, capture
  a configuração efetivamente entregue ao SDK/transporte e falhe se o
  override for removido. A suíte anterior passou sem teste novo de timeout;
  examine essa lacuna explicitamente.
- Verifique que o singleton compartilhado não é mutado e que a análise
  principal continua usando sua configuração/espera original, inclusive
  quando análise e benchmark se alternam ou concorrem.
- Diferencie timeout HTTP/deadline, tentativas automáticas do SDK e duração
  total percebida pelo frontend. Não declare um teto absoluto de 12s apenas
  porque a constante vale 12.000. Confira timeout do frontend e retries.
- Confirme que timeout/exceção continuam transitórios, sem cache negativo,
  e que cancelar um interessado não cancela a busca compartilhada nem
  permite outra chamada simultânea para a mesma chave enquanto ela roda.
  Use executor síncrono bloqueado controlável quando necessário; nenhuma
  chamada paga deve ser feita.

Se não houver evidência suficiente para provar o override no transporte,
registre exatamente o nível validado e a lacuna; não invente uma falha.

## Lote D — o que as chamadas reais e os documentos comprovam

Segundo a continuação da sessão, houve tentativas 401 e 400, depois três
respostas 200, todas `encontrado=false`/`NAO_ENCONTRADO`, em ~1,6–1,8s,
com cache versão 2. Avalie essas afirmações como evidência histórica, não
como execuções realizadas por você.

- Diferencie enviar google_search na config, o modelo efetivamente executar
  busca e obter fonte que sustenta um número. Três resultados negativos
  não validam o caminho positivo nem, sozinhos, demonstram uso da ferramenta
  de busca. Se faltarem metadados/respostas brutas, explicite a limitação.
- "Não retornou número" não comprova ausência de benchmark no mercado.
  Não generalize a latência desses três negativos para resultados positivos.
- Separe erro de autenticação, erro de deadline e buscas bem-sucedidas ao
  conferir a contagem. Não estime custo efetivamente cobrado sem evidência
  de uso/faturamento; preservar o limite não prova medição do gasto.
- Confira divergências do relato contra `.env.example` (arquivo público,
  permitido ler), defaults, contagens, situação de data/ e Git. Não leia o
  .env real nem o banco preexistente para essa reconciliação.
- O código agora está COMMITADO em `2cb13db`, apesar de a seção histórica
  terminar com "não commitado". Preserve o relato temporal e registre o
  estado atual separadamente. Não infira push/deploy de existência do commit.
- Não feche validação positiva do grounding, aceite do PR6 de linguagem,
  nginx A2 ou ativação em produção por causa dessas três chamadas negativas.

## Verificações e critério de revisão

Execute primeiro reproduções direcionadas e depois a suíte do backend,
com GEMINI_ENABLED=false, GEMINI_API_KEY fictícia, DEBUG=false,
BENCHMARK_ENABLED=false e DB_PATH vazio no ambiente do processo. Fixtures
que exercitam benchmark podem sobrescrever settings com mocks/bases temporárias.
Resultado registrado pelo Sonnet: 1677 testes. Meça o resultado atual;
não copie a contagem como se tivesse executado.

Inspecione conftest e doubles para garantir que nenhum teste use a chave
real. Se TestClient travar no sandbox, use tentativa com limite de tempo e
siga o mecanismo de aprovação do ambiente antes de repetir fora dele.
Não mude o produto nem o .env para contornar uma limitação ambiental.

Não precisa repetir frontend/lint/build sem mudança ou suspeita concreta
nessa fronteira. Não altere implementação para deixar um teste verde.
Revise o diff documental final com git diff --check; confira também arquivos
novos, que não aparecem no diff padrão enquanto não rastreados.

## Entrega obrigatória

Comece pelo veredito: aprovado, aprovado com ressalvas ou reprovado, com
resultado separado para fonte, cache, timeout e fidelidade documental.
Liste achados em ordem de severidade. Para cada um, forneça:

- arquivo/linha e comportamento concreto;
- condição de reprodução, esperado e observado;
- impacto e alcance real, sem exagerar risco hipotético;
- teste/evidência, distinguindo execução de inspeção;
- se é regressão do commit, falha preexistente relacionada ou lacuna de teste;
- correção recomendada, sem implementá-la nesta rodada.

Inclua hipóteses refutadas, controles positivos, resultados das verificações
e limitações. Se não encontrar defeitos, diga isso expressamente; falta
de teste ou validação externa não é automaticamente bug de produção.

Acrescente uma seção de revisão ao histórico da data corrente conforme
CLAUDE.md, sem apagar as análises e execuções anteriores. Atualize o roadmap
somente se um achado confirmado mudar o estado da frente; diferencie
revisão concluída de produto corrigido/validado. Informe o que foi escrito,
o que permanece pendente e o estado real de commit/push/deploy.
