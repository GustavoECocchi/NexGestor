# Avaliação de testes do NexGestor

> Documento preparado para revisão independente pelo Claude.
>
> Data: 2026-07-28 (America/Sao_Paulo)  
> Commit avaliado: `c2eb9ca1c6e849eb9daf9f97b773d806dac95cf4` (`main`)  
> Escopo: backend FastAPI, frontend Plasmo/React, integração local e navegação real da extensão.

## 1. Resultado executivo

**Situação geral: aprovado para continuar testes internos, mas com dois defeitos de alta prioridade que precisam ser discutidos antes de confiar nas recomendações do produto.**

As suítes existentes, o type-check, o build, o pacote da extensão e os fluxos ponta a ponta passaram. Foram validados 109 testes de backend, 99 de frontend, 2.000 payloads aleatórios válidos e 100 requisições concorrentes locais. A extensão real também foi carregada no Brave e navegada em viewport de side panel.

Os principais achados novos são:

1. **Alta — falso positivo de escala:** só CPA + meta de CPA já abre “Janela de Escala Vertical” e recomenda aumentar orçamento, mesmo sem ROAS, frequência e fase de aprendizado. A resposta testada tinha apenas 25% de cobertura.
2. **Alta — detalhe abre no fim da página:** ao entrar numa campanha, o usuário é levado automaticamente ao Copiloto, escondendo cabeçalho, score, métricas, diagnóstico e botão Voltar.
3. **Média — plataforma/objetivo inválidos são aceitos:** um typo na importação pode ser exibido silenciosamente como Meta Ads.
4. **Média — interface atribui resultados à IA quando são heurísticas locais/engine determinístico.**
5. **Baixa — valores numéricos extremos podem virar `null` na resposta em vez de serem rejeitados.**

Nenhuma mudança de código de produto foi feita nesta avaliação. Somente este relatório foi adicionado.

## 2. Ambiente e método

- Python `3.14.6`
- Node `20.20.2`
- npm `10.8.2`
- Brave headless com o build real carregado como extensão Manifest V3
- Viewport principal de navegação: `400 × 800`, compatível com side panel estreito
- Backend real em `http://127.0.0.1:8000`
- Gemini desativado explicitamente durante o teste ponta a ponta, para não consumir chave/cota nem introduzir rede externa
- A pasta não rastreada `knowledge-core/` foi preservada e não entrou no escopo

O primeiro `pytest` dentro do sandbox travou porque o isolamento bloqueava a criação de threads do Python. O endpoint usa `run_in_executor`. Repetido fora desse isolamento, o resultado real foi normal: 109 testes em 0,77 s. Isso é uma restrição do ambiente de teste, não falha do NexGestor.

## 3. Resultados objetivos

| Área | Comando/ensaio | Resultado |
|---|---|---|
| Backend | `python -m pytest -q` | **109 passed**, 1 warning de depreciação do SDK Google |
| Backend | `python -m compileall -q app` | Passou |
| Backend | Fuzz determinístico, 2.000 payloads válidos | Passou sem exceção; scores, cobertura, confiança, serialização e imutabilidade preservados |
| Backend | 100 POSTs concorrentes, IA desligada | **100/100 HTTP 200**; total 0,122 s; p50 63,2 ms; p95 100,7 ms; máximo 110,4 ms |
| API | `GET /` | HTTP 200, status `ok` |
| API | `GET /api/v1/campaign/scenarios` | HTTP 200, 11 cenários |
| API | POST válido completo | HTTP 200, score 30, status RED, cobertura 87%, 2 cenários |
| API | Nome vazio + gasto negativo | HTTP 422 com erros nos dois campos |
| CORS | Preflight `http://localhost:5173` | HTTP 200, origin permitida |
| Frontend | `npm test` | **99 passed** em 8 arquivos |
| Frontend | `npx tsc --noEmit -p tsconfig.check.json` | Passou |
| Frontend | `npm run build` | Passou e gerou o build MV3 |
| Frontend | `npm run package` | Passou; ZIP de 393.272 bytes |
| Pacote | `unzip -t build/chrome-mv3-prod.zip` | Nenhum erro |
| Navegador | Fluxo real da extensão | 2 POSTs reais HTTP 200; zero erro de console; zero falha de rede |

O Plasmo imprimiu `ERROR Error fetching package information for "plasmo"` porque o ambiente não tinha acesso ao `registry.npmjs.org`. Apesar do texto “ERROR”, build e package terminaram com código 0, os artefatos foram gerados e o ZIP passou na verificação de integridade. Classifico como aviso ambiental da checagem de versão do Plasmo, não falha do produto.

## 4. Navegação e fluxo do usuário

### Fluxos que passaram

- Primeiro acesso:
  - mostrou “2 campanhas ativas”;
  - as duas estavam marcadas como `exemplo`;
  - exibiu a orientação de que o usuário ainda não criou campanha;
  - investimento dos exemplos não contaminou o resumo: `R$ 0`.
- Tema:
  - alternou claro/escuro;
  - atributo do DOM e `localStorage` ficaram sincronizados;
  - escolha persistiu.
- Filtros:
  - chip “Crítico” reduziu a lista de 2 para 1;
  - remover o filtro restaurou as 2 campanhas.
- Busca/Command Palette:
  - `Ctrl+K` abriu a busca;
  - busca por “Black Friday” filtrou corretamente;
  - Enter abriu o detalhe.
- Comparação:
  - modal abriu;
  - tabela e veredito foram renderizados.
- Criação manual:
  - formulário vazio exibiu mensagem orientativa;
  - números brasileiros com vírgula foram aceitos;
  - POST real retornou 200;
  - campanha foi salva como ID `1000`;
  - detalhe mostrou score 30, 2 cenários, 2 ações e cobertura/confiança;
  - campanha real ficou visualmente separada dos exemplos.
- Persistência:
  - ação marcada permaneceu concluída ao sair, voltar e recarregar a extensão;
  - tela e campanhas sobreviveram ao reload.
- Copiloto:
  - pergunta “Qual o CPA?” gerou resposta específica sobre CPA.
- Importação JSON:
  - pré-visualização obrigatória apareceu;
  - `metrics.typo_metric` foi avisada e ignorada;
  - `metrics.cpc` com string foi avisada e ignorada;
  - campanha Google Ads foi criada como ID `1001`;
  - POST real retornou 200;
  - resultado foi exibido como Google Ads e “Escalável”.
- Coleta automática fora do Ads Manager:
  - mostrou mensagem correta pedindo uma aba `facebook.com` com a tabela visível.
- Responsividade:
  - em 400 px, `scrollWidth` e `clientWidth` ficaram ambos em 400 px;
  - não houve overflow horizontal global.

### Fluxo não validado por decisão de escopo

A coleta automática **não foi testada contra uma conta real do Meta Ads Manager**. Só foram validados manifest, content script, mensageria e tratamento da aba errada. O `CLAUDE.md` registra que essa validação e a migração para Meta Marketing API estão fora desta rodada.

## 5. Achados novos

### NG-T01 — Alta — recomendação de escala com dados insuficientes

**Sintoma**

Um payload com apenas `cpa=40` e `max_cpa=80` retorna:

- `final_status: GREEN`;
- `score_coverage: 25`;
- `score_confidence: low`;
- Cenário G, “Janela de Escala Vertical”;
- ação primária para aumentar orçamento;
- no frontend, status “ESCALÁVEL”.

Payload de reprodução:

```json
{
  "campaign": {
    "id": 9903,
    "name": "Escala com poucos dados",
    "objective": "conversion",
    "platform": "meta_ads"
  },
  "metrics": {
    "cpa": 40
  },
  "targets": {
    "max_cpa": 80
  }
}
```

**Causa provável**

Em `backend/backend-nexgestor-main/app/service/service.py:405-407`, dados ausentes são tratados como condição favorável:

```python
freq_controlada = m.frequency is None or ...
roas_ok = m.roas is None or t.min_roas is None or ...
nao_aprendendo = ... else True
```

Isso contradiz a descrição do cenário, que exige frequência controlada, ROAS adequado e ausência de aprendizado. “Desconhecido” está sendo tratado como “saudável”.

**Risco**

É uma recomendação financeira acionável baseada em evidência insuficiente. O aviso de confiança baixa não compensa um CTA que manda subir orçamento.

**Sugestão para o Claude avaliar**

- Exigir um conjunto mínimo de evidências para Cenário G, pelo menos CPA, frequência e estado de aprendizado.
- Se houver `min_roas`, exigir ROAS presente; se não houver meta, decidir explicitamente se ROAS é obrigatório ou se o cenário deve mudar de nome.
- Considerar bloquear status BLUE quando `score_confidence == "low"`.
- Adicionar regressões:
  - `test_escala_nao_dispara_so_com_cpa`;
  - `test_escala_nao_dispara_sem_frequencia`;
  - `test_escala_nao_dispara_com_learning_phase_desconhecida`;
  - `test_blue_exige_cobertura_minima`.

### NG-T02 — Alta — detalhe abre automaticamente no Copiloto

**Sintoma**

Ao abrir qualquer campanha, o detalhe não começa no topo. Após 700 ms, medi:

```text
scrollTop: 1976
scrollHeight: 2698
clientHeight: 721
```

Ou seja, a tela termina quase no fim do conteúdo, mostrando Sugestões e Copiloto. O usuário não vê inicialmente:

- botão Voltar;
- nome/status;
- score;
- cobertura/confiança;
- métricas;
- diagnóstico;
- ações prioritárias.

**Causa provável**

`frontend/nexgestor-extension/components/Copilot.tsx:89` chama:

```tsx
endRef.current?.scrollIntoView({ behavior: "smooth" })
```

O efeito roda também na montagem, porque `msgs` já contém a saudação inicial. Isso rola o ancestral `.scroll` até o final.

**Sugestão para o Claude avaliar**

- Não chamar `scrollIntoView` na primeira montagem; executar apenas depois de uma nova pergunta/resposta.
- Alternativamente, rolar somente um contêiner interno do chat.
- Ao trocar Home → detalhe, garantir explicitamente `scrollTop = 0`.
- Criar teste de navegador ou componente que confirme que abrir detalhe mantém o topo visível.

### NG-T03 — Média — enums documentados não são validados

**Sintoma**

O backend aceitou com HTTP 200:

```json
{
  "objective": "banana",
  "platform": "googel_ads"
}
```

Em `app/schema/schema.py:24-25`, os campos são `Optional[str]`; a lista válida existe apenas na descrição.

Na importação, `NewCampaignModal.tsx:114-115` aceita qualquer string. Depois, `lib/adapt.ts:159` considera apenas `google_ads`; todo outro valor é exibido como Meta Ads. Assim, um typo de Google Ads vira Meta Ads silenciosamente.

**Sugestão**

- Usar `Literal["conversion", "lead", "traffic"]` e `Literal["meta_ads", "google_ads"]` no backend e nos tipos do frontend.
- Validar e avisar valores inválidos na pré-visualização do JSON.
- Nunca usar fallback silencioso para Meta Ads quando uma string desconhecida foi enviada.

### NG-T04 — Média — atribuição enganosa à IA

Dois textos prometem IA mesmo quando nenhuma IA participou:

- `CampaignDetail.tsx:71`: “Diagnóstico IA”.
- `CompareModal.tsx:51`: “receba o veredito da IA”.

O diagnóstico principal vem do engine determinístico quando Gemini está desligado. O veredito da comparação é sempre a função local `verdict()`, baseada em score/CPA/ROAS/CTR, sem chamada à IA.

**Sugestão**

- Renomear para “Diagnóstico inteligente”/“Diagnóstico do engine” e “Veredito comparativo”.
- Mostrar selo “Complementado por IA” somente quando `ai_insights` estiver realmente presente.
- Manter transparência equivalente no Copiloto, que hoje é roteamento heurístico local.

### NG-T05 — Baixa — extremo numérico vira `null`

Payload válido segundo o schema:

```json
{
  "campaign": {"id": 9902, "name": "Limite numérico"},
  "metrics": {"impressions": 1, "spend": 1e308},
  "targets": {}
}
```

Retornou HTTP 200, mas o CPM derivado transbordou e apareceu assim:

```json
{
  "metric": "CPM",
  "value": null,
  "status": "RED",
  "score": 0
}
```

O caso é irrealista, mas o contrato aceita o valor e a resposta perde o número silenciosamente. Sugestão: rejeitar números não finitos e definir máximos de domínio razoáveis.

## 6. Limitações conhecidas, não classificadas como regressão desta rodada

- Backend é stateless, sem contas e sem banco.
- Campanhas, tema, tela e checkmarks vivem apenas no `localStorage`.
- Limpar dados do navegador apaga tudo.
- Não existe sincronização entre usuários/dispositivos.
- Scraping do Ads Manager é provisório e não foi calibrado numa conta real.
- Gemini ao vivo não foi retestado nesta avaliação; foi desligado para evitar gasto e uso de segredo.
- Não foi feito teste humano externo seguindo o README do zero.
- Não foi feito teste de publicação na Chrome Web Store.

Esses itens são aceitáveis apenas no período interno controlado já decidido pelo projeto. Persistência server-side, autenticação e substituição do scraping continuam bloqueantes para lançamento.

## 7. Pontos positivos observados

- Suítes rápidas, determinísticas e sem chamadas reais ao Gemini.
- Engine resistiu a 2.000 combinações aleatórias válidas sem exceção.
- API manteve estabilidade no teste concorrente leve.
- Validação Pydantic rejeitou nome vazio e métrica negativa com detalhes úteis.
- Mensagens de erro do frontend foram claras.
- Importação JSON usa whitelist por nome e informa campos ignorados.
- Dados dos exemplos não contaminam totais financeiros reais.
- Persistência local de campanhas, tela, tema e ações funcionou.
- Build Manifest V3 contém side panel, background e content script esperados.
- Nenhum erro de console ou falha de rede nos dois fluxos ponta a ponta.
- Layout estreito não gerou overflow horizontal.

## 8. Ordem de correção sugerida

1. Corrigir NG-T01 e criar regressões de evidência mínima para escala.
2. Corrigir NG-T02 e adicionar teste de posição inicial do detalhe.
3. Corrigir validação de plataforma/objetivo (NG-T03).
4. Ajustar transparência dos rótulos de IA (NG-T04).
5. Definir limites numéricos de domínio (NG-T05).
6. Reexecutar:

```bash
cd backend/backend-nexgestor-main
python -m pytest -q

cd ../../frontend/nexgestor-extension
npm test
npx tsc --noEmit -p tsconfig.check.json
npm run build
```

Depois, repetir o fluxo de navegador em side panel estreito e confirmar:

- detalhe começa em `scrollTop = 0`;
- Cenário G não aparece com apenas CPA;
- typo de plataforma é bloqueado/avisado;
- rótulos não alegam uso de IA quando `ai_insights` é `null`.

## 9. Veredito para o período de testes

O NexGestor está tecnicamente estável e pode continuar em teste interno controlado. Porém, **os testadores não devem seguir automaticamente recomendações de aumento de orçamento até NG-T01 ser corrigido ou explicitamente aceito pelo responsável de produto**. O bug de rolagem NG-T02 também deve ser corrigido cedo, porque faz o usuário pular toda a proposta central da tela de diagnóstico.

Peço ao Claude que audite os cinco achados diretamente no código e reproduza NG-T01/NG-T02 antes de aceitar ou rejeitar esta avaliação.
