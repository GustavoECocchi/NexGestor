# Mini-PRD — Precisão e confiabilidade da análise de campanhas

Data: 2026-09-08. Auditoria ainda não iniciada. Executor: Claude.
Pedido: avaliar se os diagnósticos e recomendações do NexGestor são sustentados
pelos dados, distinguindo correção do código de validade na prática.

## 1. Objetivo e limites

Responder: **em quais condições podemos confiar na análise, onde ela pode
induzir decisões erradas e quais evidências faltam para afirmar precisão?**

Esta etapa entrega análise e propostas, sem implementar correções de produto,
testes permanentes ou configuração. Não exige demonstrar um percentual de
acerto sem base real. A revisão do benchmark em `../rascunho_prompt.md` é uma
tarefa separada; reutilizar resultados disponíveis sem substituí-la ou repeti-la.

Antes de executar, ler AGENTS.md, CLAUDE.md e roadmap; conferir branch, HEAD,
status, diffs inclusive staged e arquivos novos. Base na criação: `main`,
`692a0f9`. Preservar trabalho preexistente e registrar a versão efetivamente
analisada. Checkpoint inicial: `../sessions/2026-09-08.md`.

## 2. Escopo da auditoria

| Frente | Perguntas obrigatórias |
|---|---|
| Dados e cálculos | Métricas derivadas, unidades e denominadores são corretos? Como são tratados zero, ausência, inconsistências entre brutos e taxas, período e atribuição? |
| Regras e contexto | Os 15 cenários e metas fazem sentido para objetivo, plataforma, nicho e volume? Quais limites têm fonte ou justificativa e quais são heurísticas? |
| Nota e confiança | Pesos, cobertura e volume sustentam a nota/rótulo? Ausência de conversões pode elevar confiança indevidamente? Métricas inaplicáveis ou correlacionadas distorcem o resultado? |
| Recomendações | Pausa, manutenção e escala têm evidência suficiente? Conflitos são resolvidos sem esconder riscos? Hipóteses de causa são apresentadas como fatos? |
| IA e dashboard | Prompt, resposta, adapter, detalhe e Copiloto preservam limites, incerteza e origem da análise? Falha/ausência de IA e benchmark podem transmitir certeza indevida? |

Pontos de partida: `app/service/service.py`, `app/schema/schema.py`,
`app/service/prompts.py`, integração/rota de análise no backend e componentes
de resultado/Copiloto em `frontend/nexgestor-dashboard`. Localizar testes atuais.
As suspeitas acima são perguntas a provar ou refutar, não bugs já confirmados.

## 3. Método e evidências

1. Mapear entrada → métricas → cenários → nota/confiança → recomendação exibida.
   Para cada cenário, registrar pré-condições, contexto aplicável, fundamento e
   ao menos um controle positivo e negativo, reutilizando testes pertinentes.
2. Reproduzir casos direcionados: dados ausentes/zero, poucas conversões,
   valores imediatamente abaixo/no/acima dos limites, metas personalizadas,
   métricas conflitantes e troca de plataforma/objetivo com os mesmos números.
   Priorizar falsa segurança e recomendações indevidas de pausa/escala.
   Definir o esperado por requisito ou fundamento explícito, sem usar o próprio
   código como única referência. Registrar desacordos de produto separadamente.
3. Executar testes pertinentes e reproduções isoladas; registrar comandos,
   resultados e limitações. Não tratar muitos testes ou casos sintéticos como
   percentual de precisão real. Mocks validam integração, não qualidade da IA.
4. Conferir fundamentos externos necessários em documentação oficial ou estudos
   primários, citando URL, data e aplicabilidade. Ausência de fundamento não
   prova defeito; classificar como hipótese ou regra ainda não validada.
5. Se houver campanhas reais anonimizadas autorizadas, comparar uma amostra
   exploratória de 10–20 casos variados com avaliação independente de gestor,
   feita antes de ver o NexGestor. Registrar contexto, diagnóstico, ação,
   incerteza, divergências e sua adjudicação. Informar denominadores, falsos
   alertas, problemas omitidos e recomendações indevidas de pausa/escala.
   Concordância com gestor não prova efeito causal ou sucesso futuro.
   Sem dados/gestor, concluir a auditoria técnica e entregar esse protocolo como
   validação empírica pendente; não fabricar casos reais nem bloquear tudo.

## 4. Restrições de execução

Sem chamadas pagas ao Gemini, acesso ao VPS/produção, instalação de dependências,
leitura de `.env`/segredos ou uso de bancos reais. Usar configuração fictícia,
IA desligada e bancos temporários; conferir isolamento antes dos testes.
Reproduções/mutações somente em área temporária, sem copiar `.env` ou `data`.
Não alterar o worktree para fazer testes passarem. Sem commit, push ou deploy.
Pesquisa pública de referências é permitida, sem enviar dados de campanhas.

## 5. Entrega e aceite

Entregar relatório na sessão da data corrente, com checkpoint recuperável:

- Veredito separado para cálculos/regras, contexto, nota/confiança e IA/UI:
  sustentado pelas evidências, com ressalvas ou insuficientemente validado.
- Achados priorizados com arquivo/linha, entrada reproduzível, esperado e
  observado, impacto, evidência e correção recomendada, sem implementá-la.
- Distinguir bug, limitação deliberada, hipótese de domínio e lacuna de
  validação; incluir suspeitas refutadas e controles positivos.
- Indicar condições de uso confiável, situações em que o sistema deveria
  pedir mais dados e até cinco próximas ações ordenadas por impacto.
- Separar inspeção, testes executados e validação real; explicitar o que
  permanece desconhecido. Nenhuma taxa de acerto sem amostra e referência.

A auditoria técnica pode ser concluída com validação empírica pendente,
desde que essa distinção esteja explícita. Atualizar o roadmap somente se
uma frente mudar de fase; revisar o diff documental e registrar evidências
antes de declarar conclusão, conforme CLAUDE.md.
