Faça a revisão independente final do P5 (consistência de métricas) no NexGestor.
As últimas correções foram feitas pelo Codex e ainda aguardam revisão do Claude.
Esta tarefa é revisão: não altere produto, testes ou configuração automaticamente.
Registre achados reproduzíveis, evidências e veredito na sessão correspondente.

## Retomada

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md. Depois consulte:
- docs/sessions/2026-09-09.md, seção “Conclusão — Codex corrige os dois ajustes
  restantes de P5”: alterações finais e validações registradas.
- Na mesma sessão, “Revisão Codex — quatro reproduções corrigidas, dois
  ajustes restantes”: evidência que motivou essas correções.
- “Continuidade — transferência para outro dispositivo”, na mesma sessão:
  o trabalho foi commitado para transporte, com revisão ainda pendente.
- docs/sessions/2026-09-08.md, “Decisão de produto — P5: bloquear criação
  com explicação contextual”: requisito aprovado. A matriz revisada de 09/09
  é contexto, considerando as retificações posteriores da própria sessão.

Base conferida em 10/09: branch fix/p5-validacao-consistencia-metricas,
HEAD 90d7724. Snapshot 52fb515 contém P5 e documentação sobre a base 692a0f9;
90d7724 registra a transferência. Os últimos ajustes não têm commit isolado:
localize-os pelas seções e funções indicadas. Use o diff 692a0f9..52fb515 como
contexto; ele contém mais trabalho que o delta final solicitado para revisão.

Confira branch, HEAD, status, diff local/staged e arquivos novos. Se a versão
mudou, adapte a revisão e declare a versão examinada. Preserve alterações
preexistentes, inclusive rascunho, sessão de 10/09 e índice de sessões.
Este prompt substitui o pedido antigo de corrigir quatro achados anteriores;
não reinicie P5 nem repita automaticamente correções que já estão presentes.

## Requisito

Bloquear dados demonstravelmente inválidos ou contraditórios com explicação
específica, fiel aos números e compreensível. Não descartar ou normalizar um
erro silenciosamente para aceitar a campanha. Preservar fluxos legítimos,
opcionais reais e leitura de legados. Não confundir consistência verificável
com comprovação da procedência da análise, ausente do contrato atual.

## 1. Obrigatórios do CampaignVM e compatibilidade da gravação

Confronte app/service/campaign_payload.py e app/routes/campanhas_salvas.py
no backend com src/types.ts, src/lib/adapt.ts e consumidores do dashboard.
Confira também test_metric_consistency.py, CampaignVM.contrato.test.tsx,
a fixture campaignVMReal.json e docs/CONTRATO_API_FRONTEND.md.

O ajuste final exige as 23 chaves obrigatórias do CampaignVM. Verifique:
- A lista corresponde ao tipo e ao uso real, sem tornar opcionais obrigatórios.
- Remover cada obrigatório de um VM válido retorna 422 antes de gravar.
- Opcionais omitidos, métricas null e listas vazias válidas continuam aceitos.
- VM produzido pelo adapter salva, relê e é consumido corretamente.
- Reenvio com client_id e atualização por id continuam funcionando sem duplicar.
- GET de legados permanece intacto. Escrita de legados sem obrigatórios pode
  ser recusada: confira o tratamento de 422 permanente e aviso na sincronização,
  distinguindo compatibilidade de leitura de compatibilidade de escrita.
- As regressões exercitam a quebra real do consumidor ao omitir tiles/actions
  e a rejeição HTTP sem gravação; não basta uma fixture mínima artificial.
- A alteração não reabre contornos estruturais corrigidos anteriormente.

Não exija comprovar procedência ou veracidade de textos livres como requisito
novo. Se aparecer contradição material fora do delta, registre escopo e
reprodução, sem expandir para auditoria geral ou correção automática.

## 2. Decimal e fidelidade da mensagem

Em app/service/metric_consistency.py, revise _arredonda, seu localcontext e
os caminhos de formatação. A mudança final aumenta a precisão local para
valores grandes e remove zeros somente da parte fracionária.

Verifique:
- 1e25, 1e26, 1e30 e maior float finito não geram InvalidOperation/HTTP 500
  nos caminhos de rejeição R1/R2; a resposta continua 422 explicativo.
- Valores em conflito continuam distinguíveis, sem trocar o declarado na frase.
- Um inteiro como 100 não vira 1 ao formatar com zero casas.
- Transporte de arredondamento, taxas pequenas e fronteiras pertinentes são
  tratados sem esconder diferenças ou gerar resíduos numéricos desnecessários.
- O contexto Decimal global permanece inalterado; o ajuste da mensagem não
  modifica indiretamente as regras R1/R2 nem a tolerância da comparação.
- As regressões usam referências independentes do helper e cobrem HTTP quando
  pertinente, além de chamar funções isoladas.

Não restaure o teto universal numerador <= denominador removido anteriormente.
Confira limites de precisão/fundamento contra os requisitos; testes verdes
não são, sozinhos, prova de fundamento analítico ou aceite do produto.

## Validação

Evidência histórica de 09/09: backend completo 1922 passed; teste focal backend
245 passed; CampaignVM.contrato.test.tsx 8 passed; TypeScript aprovado.
Esses resultados são daquela execução e não devem ser relatados como seus.

Execute primeiro, nos respectivos diretórios:
- backend/backend-nexgestor-main:
  py -X utf8 -m pytest -q test_metric_consistency.py -p no:cacheprovider
- frontend/nexgestor-dashboard:
  npm.cmd test -- src/test/components/CampaignVM.contrato.test.tsx
  npx.cmd tsc -b

Adapte executáveis ao ambiente quando necessário. Use SQLite temporário,
GEMINI_ENABLED=false e BENCHMARK_ENABLED=false em reproduções isoladas.
Sem dados reais, chamadas pagas ou alteração de .env. Reproduções temporárias
são permitidas; não altere testes versionados nesta revisão.

Amplie para storage/sync ou suítes completas se novos achados, mudanças de
versão ou dependências do delta justificarem. Não repita toda a validação sem
necessidade. Se executar build, passe VITE_API_BASE válido temporariamente,
conforme README/.env.example, sem editar configuração real.

Separe falha ambiental de defeito do produto. Declare o que foi executado e
o que foi apenas inspecionado. Testes não comprovam aceite com leigo, leitor
de tela ou viewport real; esses aceites continuam separados.

## Entrega e continuidade

Apresente achados por gravidade, com arquivo/linha atual, reprodução,
esperado versus observado, impacto e correção recomendada. Se não houver
achados, diga explicitamente, com limites. Dê veredito sobre o delta final e
se há impedimento técnico à integração de P5, separado dos aceites humanos.

Registre evidências e checkpoint em docs/sessions/AAAA-MM-DD.md, preservando
seções preexistentes; atualize o índice se criar uma nova sessão. Roadmap só
muda se um item efetivamente mudar de fase. Não declare revisão concluída
sem registrar comandos, resultados, versão examinada e limitações.

Sem commit, push, PR, merge, deploy ou manipulação de stash. Não integre
governança nem implemente diagnóstico parcial, P6/P7 ou outra frente.
Correções de produto exigem novo pedido; nesta tarefa, entregue a revisão.
