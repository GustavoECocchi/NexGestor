# Melhorar a legibilidade e aumentar a escala do dashboard

Implemente uma revisão visual do frontend do NexGestor para facilitar a
leitura. O usuário recebeu este feedback de um professor do ITA: as letras
estão pequenas demais e exigem esforço para enxergar. A prioridade desta
rodada é texto visivelmente maior e uma interface proporcionalmente mais
espaçosa, confortável já no zoom padrão do navegador.

Execute a implementação e valide o resultado. As medidas abaixo são uma
direção de design inicial definida para esta tarefa, não uma declaração de
que qualquer tamanho garanta conforto para todas as pessoas. A confirmação
de conforto pelo usuário/professor ficará para avaliação humana posterior.

## Contexto e escopo

Leia AGENTS.md, CLAUDE.md e docs/roadmap.md antes de trabalhar. Confira
instruções locais, git status e os diffs. Preserve alterações preexistentes.

Trabalhe em frontend/nexgestor-dashboard, o frontend ativo. Preserve a fonte
Atkinson Hyperlegible Next, a identidade visual, os temas claro/escuro e a
hierarquia de informações. Mantenha as correções recentes de benchmark,
persistência e análise assíncrona. Não altere regras de negócio, contratos
de API, backend ou a extensão congelada para realizar esta tarefa.

Este prompt substitui a tarefa anterior de revisão de benchmark. Não retome
aquela auditoria como objetivo desta execução. Não faça commit, push, deploy
ou chamadas reais ao Gemini; use dados locais/demonstração e mocks para validar.

## Diagnóstico inicial a conferir no código

O style.css declara explicitamente que o dashboard herdou o sistema visual
da extensão de aproximadamente 400 px. A casca ganhou sidebar e grade, mas
muitos tamanhos pequenos permaneceram. Exemplos atuais:

- Selo de IA: 10 px; tags/atalhos: aproximadamente 8,5–10 px.
- Textos explicativos, avisos e ações: aproximadamente 11–13 px.
- Navegação e botões da sidebar: 13,5 px.
- Títulos de campanhas nos cards: 14,5 px; título do detalhe: 19 px.
- Botões de ícone: 32 × 32 px; botão de exclusão: 26 × 26 px.
- Sidebar: 240 px; cards com largura mínima de 300 px; modal desktop
  limitado a 640 px.
- Há fontSize inline em NewCampaignModal.tsx e CampaignDetail.tsx.

Esses são achados por leitura do CSS, não medições de tela já realizadas.
Inspecione os componentes e o estilo computado antes de alterar. Aumentar
apenas body/html não alcança os muitos tamanhos explícitos em px.

## Escala tipográfica desejada

Use como referência os seguintes tamanhos computados em um navegador com
fonte padrão de 16 px e zoom de 100%:

| Uso | Meta inicial |
| --- | --- |
| Texto principal, diagnóstico, explicações e orientações | 18 px |
| Navegação, botões, campos, labels, avisos e notas importantes | pelo menos 16 px |
| Metadados realmente auxiliares e atalhos | 14 px, piso excepcional |
| Títulos de cards e seções | 20–24 px |
| Títulos principais de página/modal | 28–32 px |
| Valores principais de métricas/score | 28–36 px, conforme hierarquia |

Texto necessário para decidir, entender um erro, preencher um campo ou
interpretar uma métrica não é metadado dispensável: mantenha pelo menos
16 px, com 18 px nas explicações. Não deixe os textos de apoio importantes
pequenos enquanto aumenta apenas os títulos.

Crie tokens tipográficos semânticos e reutilizáveis em rem. Por exemplo:
--text-caption, --text-label, --text-body, --text-section, --text-title,
--text-metric. Use html em 100% para respeitar a preferência do navegador;
1.125rem corresponde ao corpo de 18 px na referência acima. Padronize
tamanhos inline e overrides que impedem a aplicação da escala.

Use line-height sem unidade: aproximadamente 1.5–1.65 em parágrafos e
1.2–1.35 em títulos. Mantenha pesos legíveis e espaço entre parágrafos.
Evite longas frases em caixa alta ou espaçamento entre letras excessivo.
Limite largura de leitura de textos extensos, aproximadamente 60–75ch.

O novo tamanho deve ser o padrão para todos. Não esconda a melhoria em
um botão “A+” ou preferência desligada por padrão. Não crie um painel de
configurações nesta rodada.

## Aumentar os componentes junto com as letras

Adapte padding, gaps, altura mínima, largura e ícones ao texto maior:

- Campos e botões principais: altura mínima inicial de 44–48 px, com
  padding que permita crescimento e quebra de linha.
- Botões somente com ícone, fechar e excluir: área acionável de pelo menos
  44 × 44 px; ícone normalmente de 20–24 px. Preserve nomes acessíveis.
- Cards/painéis: padding inicial de 20–24 px e gaps de 16–24 px conforme
  o contexto, preservando agrupamentos visuais.
- Reavalie sidebar (por exemplo 260–280 px quando houver espaço), largura
  mínima dos cards e modal (por exemplo 720–800 px no desktop).
  Esses valores são pontos de partida, não larguras rígidas para celular.

Não aplique zoom CSS nem transform: scale ao contêiner da aplicação.
A escala deve existir nos tamanhos reais e no fluxo do layout. Transformações
já usadas para pequenas animações não precisam ser removidas.

Reduza o número de colunas quando necessário. Permita mais rolagem vertical
para manter leitura confortável. Não compacte novamente a fonte para fazer
o conteúdo caber nem esconda texto importante com line-clamp/ellipsis.
Nomes longos devem ter uma forma clara de leitura completa.

Revise alturas fixas, overflow:hidden, nowrap e posicionamentos absolutos,
sobretudo em header, cards, score, tooltips e rodapés de modal. Evite cortes
silenciosos, botões sobre texto ou conteúdo coberto por elementos fixos.
Modais devem manter título, fechamento e ações acessíveis em telas baixas.

## Cobertura obrigatória da interface

Aplique a escala de forma consistente em:

- Identificação inicial (DonoGate) e troca de usuário.
- Sidebar, cabeçalho, busca e popover do estado da IA.
- Home, resumo, filtros, cards, avisos de sincronização, exclusão e vazios.
- Detalhe, score/confiança, métricas, metas, diagnósticos, fontes de
  benchmark, ações prioritárias e textos do Copiloto.
- Nova campanha: modo manual, importação, prévia, rótulos, valores,
  dicas, validação, erros e progresso.
- Comparação de campanhas, paleta de comandos e Central de Ajuda.

Preserve texto completo e a distinção entre dados do gestor, defaults e
referências informativas de mercado. Não mude conteúdo funcional para
disfarçar um problema de espaço.

## Contraste e adaptação

Revise os usos de --txt-3 e --muted em texto importante nos dois temas.
Adote como meta de projeto contraste de pelo menos 4.5:1 para texto normal,
medido contra o fundo realmente composto, inclusive painéis translúcidos.
Não declare conformidade completa de acessibilidade só por tamanho/contraste.

Mantenha foco visível, navegação por teclado, rolagem utilizável e áreas de
clique distintas. Garanta fallback legível se a fonte externa não carregar.

Em telas estreitas, reorganize a navegação e empilhe blocos. Não simplesmente
oculte funções da sidebar. Preserve a escala de leitura e não imponha uma
largura mínima global que provoque rolagem horizontal da página.

## Validação visual e funcional

Antes e depois, abra a aplicação em navegador real e registre capturas das
mesmas telas com os mesmos dados, tema, viewport e zoom. Use os recursos de
navegador já disponíveis no ambiente. Não confunda jsdom com validação de
layout renderizado. Se faltar navegador, conclua as verificações possíveis
e registre precisamente a validação visual pendente.

Confira:
- 1366 × 768 e 1920 × 1080 no desktop; 768 px e 390 px de largura.
- Zoom real do navegador em 100% e 200%, quando a ferramenta permitir.
  deviceScaleFactor/DPR não substitui zoom; registre o método utilizado.
- Temas claro e escuro, nomes longos, textos extensos do Copiloto,
  valores grandes e avisos de erro, além do caminho feliz.
- Ausência de corte de texto, sobreposição, conteúdo inacessível e overflow
  horizontal da página. Comparação deve se adaptar ou ter rolagem local
  claramente acessível, se indispensável para sua estrutura.
- Estilo computado de exemplos de cada categoria tipográfica, incluindo
  descrições, labels e avisos; não verifique apenas os títulos.
- Criar/importar campanha com respostas mockadas, abrir detalhe, comparar,
  excluir, buscar, alternar tema e acessar Ajuda continuam funcionando.

Execute no dashboard: npm test, npm run lint e npm run build. Não acrescente
testes frágeis que apenas procuram valores literais de CSS; prefira checks
de comportamento e medidas no navegador. Ajuste testes somente quando uma
mudança intencional justificar; não enfraqueça as regressões funcionais.
Finalize com git diff --check e revisão dos arquivos alterados.

## Registro e entrega

Registre a implementação e as evidências em docs/sessions/AAAA-MM-DD.md
conforme CLAUDE.md. Atualize o roadmap somente se a frente mudar de fase.
Não reescreva sessões anteriores nem declare avaliação humana já realizada.

Na entrega, informe:
- tamanhos principais antes/depois e ajustes de layout;
- telas, resoluções e temas efetivamente conferidos, com capturas locais;
- resultados de testes/lint/build e limitações de verificação;
- estado real: implementado, validado, commitado, enviado e implantado.

A implementação deve demonstrar aumento perceptível em toda a interface.
Deixe claro que o usuário/professor ainda precisa experimentar a versão
para confirmar se o novo tamanho atende ao conforto de leitura esperado.
