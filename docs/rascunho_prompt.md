# Revisar a auditoria dos arquivos Markdown do NexGestor

Faça uma auditoria crítica, somente de leitura, de todos os arquivos `.md` deste
repositório. O objetivo desta etapa é decidir o que faremos com a documentação;
portanto, **não edite, mova, renomeie nem exclua nenhum arquivo** e não altere
código, configuração, dependências ou Git.

## Decisão definitiva de produto

Considere como premissa confirmada pelo responsável do projeto:

- o dashboard em `frontend/nexgestor-dashboard/` é o único frontend que terá
  continuidade;
- a extensão em `frontend/nexgestor-extension/` foi descontinuada e não receberá
  novas funcionalidades nem manutenção;
- `extensao-pronta/` é um artefato legado;
- integrações futuras com plataformas de anúncios devem ser planejadas para o
  dashboard, por API/OAuth, e não por extensão ou `chrome.tabs`.

Não reabra essa decisão. Avalie a documentação a partir dela.

## Avaliação anterior a ser verificada

Uma auditoria anterior chegou às conclusões abaixo. Não aceite essas conclusões
automaticamente: confira cada uma contra o conteúdo integral dos arquivos, a
estrutura atual e, quando necessário, o código/configurações reais.

1. `README.md` ainda apresenta backend + extensão como fluxo principal e deveria
   ser reescrito para dashboard + backend.
2. `CLAUDE.md` foi reduzido, mas a divisão hierárquica ficou incompleta porque não
   existem `CLAUDE.md` específicos para backend, dashboard e deploy; ele também
   contém estado volátil e detalhes específicos demais.
3. `COMO-USAR.md` ensina a instalar a extensão e ficou obsoleto após a decisão de
   descontinuação.
4. `frontend/nexgestor-dashboard/README.md` ainda é o texto genérico do template
   Vite e deveria ser substituído por documentação real do NexGestor.
5. `frontend/nexgestor-extension/README.md` e os comandos locais da extensão são
   documentação legada sem utilidade operacional futura.
6. Existem comandos `encerrar-sessao.md` duplicados e antigos no backend e na
   extensão que conflitam com `.claude/commands/encerrar-sessao.md` da raiz.
7. O comando de encerramento da raiz ainda valida a extensão em vez do dashboard
   e cria histórico documental em toda sessão.
8. `deploy/README.md` mistura instrução atual, estado remoto datado, arquitetura
   antiga de base compartilhada e distribuição da extensão, oferecendo risco de
   operação incorreta.
9. `docs/CONTRATO_API_FRONTEND.md` é uma fonte canônica importante, mas precisa
   ser conferido contra schemas e rotas atuais.
10. `docs/PRD.md` é importante, porém mistura requisito, documentação técnica,
    estado de produção e informações anteriores ao dashboard/isolamento por dono.
11. `docs/roadmap.md` ainda funciona como uma segunda memória extensa: mistura
    backlog, fatos históricos, incidentes de segurança, números de testes e
    estado remoto volátil.
12. Os PRDs de fases devem ser mantidos apenas quando ainda documentarem requisito
    ou decisão vigente; partes que relatam implementação ou experiências
    descartadas deveriam ser resumidas ou removidas.
13. `fase-3-graficos-campanha.md` mistura um gráfico descartado com uma proposta
    futura de histórico de campanhas; a parte futura poderia virar um PRD próprio.
14. `backend/backend-nexgestor-main/AUDITORIA.md` e `teste.md` são relatórios
    históricos, não documentação operacional atual.
15. `docs/sessions/*.md` são diários históricos. O Git já preserva o passado;
    decisões ainda vigentes e bugs ainda abertos deveriam existir em fontes
    atuais, não depender desses diários.
16. `docs/rascunho_prompt.md` é uma caixa de entrada temporária e deveria ser
    esvaziado ou marcado como concluído depois de cada execução.

## Trabalho obrigatório

1. Liste **todos** os `.md`, inclusive os que estiverem em diretórios ocultos
   como `.claude/`, excluindo apenas `.git`, dependências e artefatos externos.
2. Leia cada arquivo integralmente. Para cada um, explique em linguagem simples:
   - o que ele faz;
   - para quem ele serve;
   - se ainda corresponde ao projeto atual;
   - se repete ou contradiz outro documento;
   - qual ação recomenda.
3. Use exatamente uma recomendação principal por arquivo:
   - **MANTER** — atual e com função clara;
   - **ATUALIZAR** — função necessária, conteúdo parcialmente incorreto;
   - **CONSOLIDAR** — conteúdo válido deve ser incorporado em outra fonte;
   - **MOVER PARA HISTÓRICO** — útil apenas para auditoria/passado;
   - **EXCLUIR** — duplicado, obsoleto ou sem valor após consolidação.
4. Para toda recomendação de consolidar, mover ou excluir, diga:
   - qual informação ainda válida precisa ser preservada;
   - qual será o arquivo de destino;
   - que referência, comando ou link quebraria com a ação;
   - qual verificação deve ocorrer antes.
5. Procure referências entre Markdown, comandos Claude, READMEs e código para não
   recomendar exclusões que deixem links ou processos quebrados.
6. Confira especialmente estas possíveis divergências:
   - dashboard ativo versus extensão descontinuada;
   - base compartilhada versus isolamento por `X-Nex-Dono`;
   - identificação por dono versus autenticação real;
   - endpoints e prefixos da API;
   - estado local comprovável versus estado externo do VPS;
   - contagens congeladas de testes;
   - funcionalidades marcadas como pendentes que já estejam implementadas;
   - bugs descritos como abertos que talvez já tenham sido corrigidos.
7. Diferencie problema real de codificação UTF-8 de mojibake causado apenas pelo
   terminal. Não proponha regravar arquivos sem confirmar o problema nos bytes.

## Formato da resposta

Comece pelos achados de maior risco. Depois apresente uma tabela com uma linha por
arquivo e as colunas:

| Arquivo | Função | Situação atual | Recomendação | Destino/ação | Risco |

Em seguida, apresente:

1. pontos em que concorda com a auditoria anterior;
2. pontos em que discorda ou que precisam de ressalva, com evidência;
3. conjunto mínimo de documentos que deveria existir ao final;
4. plano seguro e ordenado para uma futura limpeza, dividido em etapas pequenas;
5. lista de decisões que ainda precisam ser tomadas pelo responsável antes de
   qualquer alteração.

Se recomendar excluir a documentação da extensão, avalie separadamente a
documentação e o código: esta tarefa autoriza avaliar `.md`, não autoriza apagar
`frontend/nexgestor-extension/` nem `extensao-pronta/`.

Nesta execução, entregue apenas a análise. **Não faça alterações e não crie
commit ou push.**
