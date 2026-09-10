# Mini-PRD — Nota das métricas analisadas e diagnóstico parcial

Status em 2026-09-09: especificação preparada e revisada contra o código local;
implementação não iniciada. Princípio aprovado pelo usuário nesta conversa;
desenho detalhado abaixo é a proposta de implementação. Evidência e continuidade:
[sessão de 09/09](../sessions/2026-09-09.md), seção
“Especificação — diagnóstico parcial”. Esta frente é independente da revisão
final de P5 e não reabre os PRs da fase-5 de vocabulário.

## 1. Objetivo e decisão de produto

O NexGestor continua útil com dados incompletos: avalia o que foi informado ou
derivado com segurança. O usuário precisa entender o alcance dessa avaliação
antes de interpretar a nota como saúde geral ou tomar uma decisão.

Decisão aprovada: mostrar a nota das métricas analisadas, cobertura, confiança
e quais aspectos puderam ou não ser avaliados. Usar “aspectos do desempenho”,
não “áreas da campanha”, que não são divisões oficiais da plataforma.

Precisões necessárias, identificadas na conferência do código:

- A nota considera métricas **avaliadas**, incluindo as derivadas dos brutos;
  nem toda métrica preenchida entra na nota (pode faltar meta ou ser informativa).
- Cobertura é percentual do **peso** das métricas que entraram na nota. Não é
  percentual de campos preenchidos, de pessoas alcançadas ou de acerto.
- Mais dados podem revelar um problema e reduzir a nota. Mais dados também
  não garantem aumento da confiança: pouco volume de conversões pode limitá-la.
- Não há critério aprovado que transforme 70% ou 100% de cobertura em prova
  de saúde geral. Mesmo 100% só cobre o conjunto de métricas da nota atual.
  O exemplo anterior no chat “25% das métricas necessárias” deve ser lido
  como ilustração; a implementação deve usar a definição ponderada correta.

## 2. Estado observado e problema

Base: branch `fix/p5-validacao-consistencia-metricas`, HEAD `692a0f9`, com
diff local P5. Código/testes são evidência do comportamento observado.

| Ponto | Comportamento observado | Implicação para a mudança |
|---|---|---|
| `service.py`, `_preprocess` | Deriva taxas a partir de brutos; preserva taxas enviadas | Campo da taxa vazio não prova falta de avaliação |
| `_evaluate_metrics` | Pula métrica ausente e, quando necessária, meta ausente | Distinguir falta de dado de falta de meta |
| `_calc_overall_score` | Média ponderada só dos avaliados; sem peso avaliado devolve 50/0 | Não apresentar 50 neutro como nota real quando cobertura é zero |
| `_METRIC_WEIGHTS` | CPA pesa 25%, CPM 5%; CTR Todos e Conversões/semana pesam zero | Não contar linhas/tiles para recalcular cobertura |
| `_score_confidence` | Combina cobertura e conversões quando informadas | Não prometer confiança alta apenas por preencher formulário |
| `CampaignDetail.tsx` | “Score de saúde”; cobertura/confiança condicionadas à presença de ambos | Mostrar alcance junto da nota, inclusive em metadados incompletos |
| `status.ts`, cards e resumo | GREEN aparece como “Saudável” | Evitar interpretação de saúde global mantendo severidade do engine |
| `CompareModal.tsx` | “mais eficiente”, “saúde geral”; ressalva só quando vencedor tem confiança baixa | Não concluir superioridade geral por notas de bases diferentes |
| `adapt.ts`/`CampaignVM` | Guardam coverage/confidence e tiles; input original não é persistido | Tiles não bastam para reconstruir por que uma métrica não foi avaliada |

`_partial_diagnosis_note` só explica parte dos casos: exige métrica crítica
ponderada sem causa explicada. Ausência dessa mensagem não prova avaliação
completa. Não usar busca de palavras no resumo como detector de parcialidade.

## 3. Experiência proposta

### Nota e alcance

No detalhe, substituir “Score de saúde” por **“Nota das métricas analisadas”**.
No card compacto, usar “Nota da análise”, com a mesma explicação acessível.
Mostrar o alcance ao lado da nota, sem depender de tooltip ou hover:

| Cobertura recebida | Apresentação |
|---|---|
| 0% | “Sem nota calculada” no lugar do 50/100 neutro; “Nenhuma métrica que compõe a nota pôde ser avaliada.” Informações e alertas existentes continuam disponíveis |
| Maior que 0 e menor que 100% | Nota existente + “Diagnóstico parcial” + cobertura |
| 100% | Nota existente + “Todas as métricas da nota foram avaliadas.” Sem selo de saúde completa |
| Ausente/inválida | Nota existente identificada como registrada + “Alcance da análise não informado”. Não usar zero ou 100 como fallback |

Texto principal para diagnóstico parcial:

> A nota considera somente as métricas avaliadas nesta análise. Ainda faltam
> informações para avaliar outros aspectos do desempenho da campanha.

Cobertura: **“Cobertura da nota: X%”**. Explicação:

> Mostra quanto do conjunto usado na nota foi avaliado. As métricas têm
> importâncias diferentes; por isso, não é a porcentagem de campos preenchidos.

Confiança: mostrar **“Confiança na análise: baixa/média/alta”** quando disponível,
independentemente de coverage existir. Se ausente: “Confiança não informada”.
Explicação: “Indica a sustentação da análise pelos dados disponíveis. Considera
as métricas avaliadas e, quando informado, o volume de conversões.” Não chamar
esse nível de probabilidade de acerto. A IA ligada/desligada é outro indicador.

### Estado da campanha e outros pontos de leitura

Preservar status, cores de severidade, score, cenários, ações e restrições de
escala calculados pelo engine. Em cards, detalhe, resumo e filtros, substituir
o rótulo amplo “Saudável” por **“Sem alerta nos dados avaliados”** (versão curta
“Sem alerta” com contexto visível no resumo). RED/YELLOW continuam indicando
problemas encontrados, mesmo em diagnóstico parcial; dados faltantes não
neutralizam um alerta. BLUE mantém o critério atual de escala e a ressalva de
alcance; esta mudança não autoriza recalibrar a recomendação.

Resumo da página: “Estados das análises disponíveis”. Ajuda e Copiloto devem
usar os mesmos conceitos; frases como “mais dados sempre dão mais confiança”
ou “nenhum cenário significa campanha saudável” precisam ser substituídas
nos trechos diretamente relacionados a esta funcionalidade.

Comparador: manter valores e comparações métricas válidas, com cobertura e
confiança **das duas** campanhas. Trocar a conclusão de eficiência geral por
“Maior nota nesta análise”, sem vencedor em empate ou quando faltar base para
uma nota calculada (cobertura zero/desconhecida). Mostrar “As notas podem usar
métricas e metas diferentes; a comparação é indicativa”. Não afirmar que a
outra campanha está saudável só por não ter cenário. Não recalcular scores.

### O que foi e o que não foi avaliado

No detalhe, após o bloco da nota e antes das recomendações, mostrar “O que
esta análise avaliou”. Agrupar por aspectos apenas para facilitar leitura:

| Aspecto de apresentação | Métricas do engine |
|---|---|
| Atenção e retenção do vídeo | Hook Rate, Hold Rate |
| Cliques | CTR Link, CTR Todos |
| Custos | CPM, CPC, CPA, CPL |
| Conversão e retorno | Conversão na página, ROAS |
| Frequência de exibição | Frequência |
| Volume semanal de conversões | Conversões/semana (informativa para a nota) |

Os grupos não recebem nota nem veredito próprio. Exibir cada métrica com seu
estado, evitando declarar “custos avaliados” como um todo só porque existe CPM.
Não declarar vídeo aplicável ou obrigatório a toda campanha: se faltarem dados,
o texto é sobre ausência de avaliação; orientar preenchimento “se esse aspecto
fizer parte da sua campanha”. Não inferir formato de anúncio a partir do nicho.

Estados e textos por métrica:

| Estado | Texto e comportamento |
|---|---|
| Avaliada, entra na nota | “Avaliada nesta análise”; manter valor e referência/meta usada, incluindo origem padrão do sistema |
| Avaliada, peso zero | “Informativa — não entra na nota”; pode sustentar alertas e cenários, não é irrelevante |
| Sem valor utilizável | “Sem dados para avaliar”; indicar a taxa ou combinação de brutos necessária, quando conhecida |
| Valor presente, meta necessária ausente | “Dado disponível; falta definir a meta para avaliar”; não pedir para reenviar a métrica |
| Brutos presentes, cálculo não definido/utilizável | “Não foi possível calcular com os dados disponíveis”; não confundir denominador zero com campo vazio |
| Motivo não comprovado | “Não avaliada nesta análise”; não inventar a causa |

Não afirmar que uma métrica sem nota nunca foi usada por qualquer detector.
Este inventário descreve a avaliação individual e sua participação na nota;
os cenários continuam sendo apresentados separadamente.

## 4. Informação necessária e implementação proposta

A primeira etapa pode ajustar rótulos e alcance usando `score_coverage` e
`score_confidence` existentes. Ela não conclui sozinha a funcionalidade.

Para o inventário completo, acrescentar metadados versionados de avaliação
à resposta do backend e ao CampaignVM, em vez de deduzir ausência por tiles.
Nome proposto: `assessment`, com `version: 1` e lista de métricas identificadas
por chave estável do schema. Cada item informa estado, participação na nota
e motivo/campos faltantes quando comprovados. Sem copiar todo o input bruto.

Produzir essa informação no fluxo que já conhece input, métricas processadas,
metas e avaliações. Reutilizar a configuração dos avaliadores/pesos; não manter
uma segunda matriz de cálculos ou limiares no frontend. Referências padrão
contam como metas efetivas e precisam ser identificadas como padrão do sistema.
Se dado e meta faltarem, registrar ambas as necessidades; não escolher só uma.

Critério de paridade: retirar `assessment` da resposta nova deve deixar
inalterados todos os resultados anteriores (score, coverage, confidence,
status, avaliações, cenários e IA). A funcionalidade não envolve chamada nova
ao Gemini nem mudança de prompt da IA. O Copiloto local pode consumir os
metadados para explicar o alcance sem gerar custo.

Contrato aditivo e opcional: atualizar schema, tipos, adapter, validação de
gravação P5 e persistência. O backend precisa aceitar o campo antes de o
dashboard enviá-lo, pois a gravação agora rejeita chaves desconhecidas.
Verificar salvamento inicial, enriquecimento por benchmark, reenvio,
atualização, mesclagem com servidor e recarga: não perder `assessment`.

Legados sem esse campo continuam sendo lidos e reenviados. Mostrar cobertura
e confiança que existirem; para o inventário, “Esta análise antiga não informa
quais métricas ficaram sem avaliação”. Não inventar ausência de dados, migrar
registros ou disparar reanálise paga automaticamente. Versão desconhecida ou
metadados inválidos não podem derrubar a tela; apresentar alcance desconhecido.
Na escrita, campo novo inválido é rejeitado com contrato documentado.

Ordem futura: backend compatível → dashboard. Rollback requer manter o servidor
capaz de aceitar metadados já salvos nos navegadores, ou preparar compatibilidade
antes de retirar o campo. Não resolver removendo dados silenciosamente.

## 5. Casos de referência e aceite

| Caso | Resultado esperado |
|---|---|
| Só CPM informado | Cobertura 5% pelo peso atual; nota parcial. Custos mostram CPM avaliado e os demais com seus motivos; nenhuma conclusão de saúde geral |
| Impressões + cliques, taxa vazia | CTR Link derivado pode ser avaliado; não marcar CTR ausente por estar vazio no formulário |
| CPA disponível, max_cpa ausente | “Falta definir a meta”; valor não vira ausência nem zero |
| Só métrica informativa, como CTR Todos | Cobertura da nota 0%, “Sem nota calculada”, informação e alertas preservados |
| Cobertura 100%, poucas conversões | Cobertura completa da nota e confiança baixa podem coexistir; não chamar de saúde completa |
| Nota alta com cobertura parcial | Ressalva aparece junto da nota já no card, antes de abrir o detalhe |
| Nota alta com alerta crítico de cenário | Alerta continua visível; nota parcial não apaga severidade ou recomendação existente |
| Legado sem coverage/confidence/assessment | “Alcance não informado”; não fabricar 0%, confiança baixa ou lista de campos ausentes |
| Duas campanhas com bases distintas | Mostrar as duas coberturas/confianças; não declarar uma globalmente melhor por score |
| Zero medido versus campo ausente | Zero preservado; explicar ausência/cálculo impossível conforme evidência, sem substituição entre ambos |
| Salvar e recarregar | Alcance e inventário permanecem iguais; legado ainda funciona |

Validação técnica: testes de paridade backend e mapeamento dos estados, metas
padrão versus ausentes, taxas derivadas, campos omitidos/nulos/zero, contrato
de gravação, compatibilidade de versões e fluxo real salvar/ler/renderizar.
No dashboard, verificar cards, detalhe, resumo, comparador e Copiloto sem
suposições contraditórias. Testes não podem apenas repetir o texto literal;
conferir que o conjunto e os motivos exibidos correspondem às entradas reais.

Interface: aviso principal sempre visível; detalhes expansíveis acessíveis por
teclado/toque e leitor de tela. Cobertura/confiança não dependem de cor. Testar
largura real de 360px, zoom 200%, nomes longos e legados. Registrar limites de
ambiente sem confundi-los com aceite executado.

Aceite com alguém leigo do time: apresentar um diagnóstico parcial de nota
alta, outro com alerta e um legado. A pessoa deve explicar, sem orientação,
o que a nota representa, o que não foi avaliado, por que 0% não é nota zero e
qual informação poderia melhorar aquela análise. Entender a ressalva não
exige memorizar pesos, siglas ou a fórmula. Registrar respostas observadas;
esse aceite não é substituído pela suíte automatizada.

## 6. Etapas e limites

1. Conferir a versão após a revisão/integração de P5 e implementar os textos
   e estados de alcance existentes, com testes focados.
2. Implementar o contrato aditivo e o inventário, validar paridade e fluxos
   de persistência; completar textos dos consumidores relacionados.
3. Validar tecnicamente e realizar aceite com leigo; registrar resultados e
   pendências separados. Cada etapa tem checkpoint na sessão.

Não implementar durante esta preparação documental. Não alterar pesos,
limiares, fórmula de confiança, aplicabilidade analítica por plataforma,
autenticação, coleta automática, benchmark ou histórico de campanhas.
P5 e governança continuam com seus próprios checkpoints. Este PRD não
autoriza commit/push/merge/deploy nem substitui o rascunho em uso.
