# PRD — NexGestor
**Product Requirements Document retroativo, gerado a partir do código-fonte. Última verificação: 2026-08-25.**

> ## ⚠️ Leia isto primeiro — o frontend descrito aqui foi SUBSTITUÍDO
>
> Este PRD foi escrito lendo um checkout parado em 15/08/2026, sem saber que em
> **24/08 o produto migrou de extensão Chrome para dashboard web**
> (`frontend/nexgestor-dashboard`, Vite+React+TS+Tailwind). Corrigido em
> 26/08 sem reescrever o corpo do texto, porque o que ele descreve continua
> majoritariamente válido — o dashboard **reaproveita a extensão por cópia**
> (`types.ts`, todo o `lib/`, componentes e mock são idênticos byte-a-byte).
>
> **O que ler com ressalva:**
>
> | Onde o texto diz | Leia como |
> |---|---|
> | "extensão Chrome (side panel)", `sidepanel.html`, Plasmo, MV3 | `frontend/nexgestor-dashboard`, app web servida por Vite |
> | "base COMPARTILHADA, sem dono" (§2.5, §3.15) | **Superado em 24/08**: isolada por `dono` via header `X-Nex-Dono` (sem senha ainda) |
> | "decisão em aberto: extensão ou app web?" (§9) | **Decidida**: app web. `frontend/nexgestor-extension` está **congelada**, tag `extensao-estavel-2026-08` |
> | Contagens de teste | Backend **1457**, dashboard **331** (26/08) |
>
> **Continua válido sem ressalva:** todo o backend (§3.1–3.7, 3.16–3.17), as
> regras de negócio, o adapter, e a seção 10 de divergências de documentação.
> **Uma revisão completa deste PRD contra o dashboard é trabalho pendente.**
>
> ---
>
> Este documento descreve o que o código faz, não um plano futuro. Cada
> afirmação foi verificada lendo o arquivo correspondente ou rodando a suíte.
> Onde o código não deixa a intenção clara, está marcado como **"a confirmar"**.

---

## Fases

A partir de 26/08/2026 o projeto adota a hierarquia: este PRD grande
(guarda-chuva, estável) descreve o estado atual do produto; cada fase abaixo
é um PRD pequeno e temporário em `prds/`, cada um gerando no máximo 2 PRs.

| Fase | Nome | Status | PRD |
|---|---|---|---|
| 1 | Ajuda em linguagem simples no formulário "Criar campanha" | implementado | [`prds/fase-1-ajuda-formulario-campanha.md`](prds/fase-1-ajuda-formulario-campanha.md) |
| 2 | Dashboard: telas dedicadas e navegação intuitiva | planejado | [`prds/fase-2-dashboard-intuitividade.md`](prds/fase-2-dashboard-intuitividade.md) |

---

## 1. O que é o produto e qual problema resolve

**NexGestor** é um copiloto de diagnóstico para gestores de tráfego pago. Recebe as métricas de uma campanha (impressões, cliques, gasto, conversões…) e devolve um diagnóstico estruturado: quais problemas existem, **por que** existem (causa raiz com números reais), o impacto no funil, e qual ação executar.

**Problema que resolve:** um gestor olhando um painel de métricas precisa cruzar dezenas de números para diagnosticar uma campanha ruim. Sob pressão, tende a agir sobre sintomas (baixar orçamento, pausar) sem identificar a causa (criativo saturado? landing page quebrada? algoritmo ainda em aprendizado?). O produto substitui esse cruzamento manual por um motor de regras que já sabe quais combinações de métricas indicam qual problema, complementado por uma camada de IA opcional.

**Modelo de uso hoje:** uma campanha por vez, dados inseridos manualmente, por importação de JSON, ou (legado) por scraping do Ads Manager. O resultado é uma tela com score de saúde, cenários detectados, métricas semaforizadas e ação prioritária.

### 1.1 Limite conceitual importante: o produto é um **retrato**, não uma série temporal

**Não existe histórico no produto.** Cada análise é um instantâneo isolado:
- O backend não armazena série temporal — a tabela de persistência guarda apenas o objeto da UI mais recente.
- `lib/adapt.ts` preenche `spark: Array(7).fill(score)` (linha reta no valor do score) e `trend: 0` para toda campanha real. O mini-gráfico existe na UI mas **não representa evolução**.
- Só as **2 campanhas de exemplo** (`data/mock.ts`) têm série e tendência de verdade (valores fixos escritos à mão) — o que faz a demo parecer mais rica que o produto real.
- O rótulo **"últimos 7 dias"** no Resumo é **texto fixo** (`Summary.tsx`), não derivado de nenhum dado de período. O período real é o que o gestor digitou.

Consequência: qualquer roadmap de dashboard que envolva "evolução", "comparação temporal" ou "tendência" começa do zero — o dado não existe nem no schema, nem no banco, nem na UI.

---

## 2. Decisões de arquitetura já tomadas — e por quê

### 2.1 Motor de regras determinístico como núcleo; IA como camada opcional
O diagnóstico principal **nunca depende da IA**. `service.py` roda 15 detectores determinísticos (funções puras `_detect_*`); isso sempre acontece e leva <50ms. A IA roda **depois**, sobre o resultado do engine, e só complementa. **Por quê:** um produto que promete diagnóstico não pode ficar mudo quando uma API externa está fora do ar ou sem cota. Há inclusive um fallback (`_apply_minimal_fallback`) para nunca retornar resposta vazia se engine e IA falharem juntos.

### 2.2 IA em dois modos automáticos, nunca "livre"
`analyze_with_ai` opera em modo **complementar** (engine achou cenários → IA só acrescenta o que ele não viu) ou **principal** (engine vazio → IA assume), com um **Princípio 0 (NÃO INVENTE)** no prompt que proíbe benchmark de mercado não verificável e promessa de resultado. **Por quê:** a primeira versão do prompt tinha viés estrutural para inventar quando os dados eram magros ("NUNCA deixe o usuário sem resposta útil"). Foi revertido: "os dados não permitem afirmar X" passou a ser resposta válida.

### 2.3 Schema de entrada com validação agressiva contra dado "quase certo"
`Literal` fechado para `objective` e `platform` (não `str` livre) + validador `_FinitosApenas` rejeitando `NaN`/`Infinity` em qualquer campo via `field_validator("*")`. **Por quê:** um typo em `platform` passava com 200 e a UI atribuía a plataforma errada silenciosamente; `Infinity` em `spend` contaminava métricas derivadas e virava `null` numa resposta que ainda afirmava status RED.

### 2.4 Persistência opcional; backend stateless por padrão
`DB_PATH` vazio (default) = SQLite desligado. Só o `docker-compose` liga. **Por quê:** rodar local sem infraestrutura, e a suíte nunca toca disco por acidente. Desligada, as rotas respondem **501 (não 500)** — é capacidade desligada, não falha — e a UI cai para `localStorage` sem mostrar erro.

### 2.5 Base COMPARTILHADA, sem login — decisão temporária explícita
A tabela `campanhas` tem 4 colunas (`id`, `payload`, `criado_em`, `atualizado_em`) — **sem coluna de dono**. Toda a equipe lê e apaga tudo. **Por quê:** decisão consciente para o período de testes (ver o diagnóstico do colega é útil, não há dado sensível). `storage.py` já descreve a migração obrigatória antes do lançamento.

### 2.6 Payload de persistência opaco ao backend
`POST /api/v1/campaigns` recebe `{payload: dict, id: int|None}` e nunca interpreta o conteúdo. **Por quê:** desacopla o formato da UI (`CampaignVM`) do banco — mudar um campo na tela não exige migração.

### 2.7 CORS por lista + regex, para ID de extensão variável
`CORS_ORIGINS` (lista) + `CORS_ORIGIN_REGEX` (default `chrome-extension://.*`). **Por quê:** o ID muda entre extensão unpacked e publicada. Documentado como algo a apertar em produção.

### 2.8 Camada de IA isolada em um módulo trocável
Toda comunicação com o Gemini passa por `call_gemini()`; nada mais importa o SDK. Comentário explícito: *"Se trocar de provedor no futuro, apenas este arquivo muda."*

### 2.9 View-Model (`CampaignVM`) como fronteira entre API e UI
`lib/adapt.ts` converte `CampaignAnalysisResponse` → `CampaignVM`, que adiciona conceitos só de apresentação (o status `BLUE`, que não existe no backend). **Por quê:** mantém o contrato do backend limpo de decisão de UI.

### 2.10 `null` explícito nunca vira zero fabricado
`roasNum`/`cpaNum`/`ctrNum`/`freqNum` são `number | null`, não `number` com `?? 0`. **Por quê:** com fallback a zero, o Copiloto afirmava *"o CPA atual é R$ 0,00"* e o comparador dava vitória de "CPA menor" a quem não tinha o dado.

### 2.11 `localStorage` puro no frontend, servidor como fonte de verdade
Sem biblioteca de storage. Quando o servidor responde, ele manda; o `localStorage` é cache. Campanha só-local (sem `serverId`) nunca é descartada e sobe sozinha na próxima abertura.

### 2.12 Sanitização por allowlist em todo HTML renderizado
`lib/sanitize.ts` escapa **tudo** primeiro e reativa só `b`, `strong`, `i`, `em`, `br` — **sem atributos**. Aplicado a todo `dangerouslySetInnerHTML` (resumo, causa raiz, veredito do comparador, respostas do Copiloto, textos da IA). **Por quê:** parte do texto exibido vem da IA e do backend; qualquer script, handler inline ou tag fora da lista chega ao DOM como texto puro.

---

## 3. Regras de negócio centrais implementadas no código

### 3.1 Os 15 cenários de diagnóstico
Cada cenário é uma função pura que recebe métricas + metas e devolve um `ScenarioDetail` (causa raiz, impacto no funil, ação, regra de execução, prioridade 1–3) ou `None`.

| Código | Nome | Gatilho (resumo) | Prioridade |
|---|---|---|---|
| A | Gancho Fraco | Hook Rate < ~70% da meta (meta default 35%) | 1 se <70%, senão 2 |
| B | Retenção Baixa | Hook ok, Hold Rate < meta (default 15%) | 1 se Hold <10%, senão 2 |
| C | Click-Bait | CTR Todos >3.5% **e** CTR Link <0.7% | 1 |
| D | LP Mismatch | CTR Link >1.5× meta **e** conversão LP < meta | 1 |
| E | Fadiga de Criativo | Frequência > teto de fadiga (default 2.8) | 1 se >80% do limite crítico, senão 2 |
| F | Lead Frio | CPA/CPL dentro da meta **e** conversão LP <50% do mínimo | 2 |
| G | Janela de Escala Vertical | CPA ≤ teto×0.75, freq <1.8, ROAS ok, fora do aprendizado **+ evidência mínima** (3.3) | 1 (oportunidade) |
| H | Escala Horizontal | Frequência >2.5, CPA ok, sem fadiga plena | 2 |
| I | Learning Phase Hell | `learning_phase=True` **ou** conv. semanais < mínimo (default 50) | 1 |
| J | Overspending | CPM > teto, LP saudável, CPA ainda estourado | 2 |
| K | Canibalização de Retargeting | ROAS >10× **e** frequência > crítica (default 6) | 1 |
| L | Gasto sem Retorno | Zero conversões com gasto relevante (acima do teto de CPA, ou 100+ cliques) | 1 |
| M | Amostra Insuficiente | 0 < conversões < 10 | 3 |
| N | Vazamento Clique→Página | LP views <70% dos cliques (mínimo 50 cliques) | 1 se <50%, senão 2 |
| O | Receita Abaixo da Meta | ROAS < meta **com** CPA dentro do teto | 1 se ROAS < metade da meta, senão 2 |

Reservados e não usados hoje: `HEALTHY` (enum de cenário) e `PAUSED` (status).

### 3.2 Métricas deriváveis pelo backend
O gestor pode enviar a taxa pronta **ou** os números brutos; a taxa enviada **tem prioridade** e nunca é sobrescrita (`_preprocess`). Derivações implementadas:

| Derivada | Fórmula | Requer |
|---|---|---|
| `hook_rate` | `video_views_3s / impressions × 100` | impressions > 0 |
| `hold_rate` | `thruplays / impressions × 100` | impressions > 0 |
| `ctr_link` | `link_clicks / impressions × 100` | impressions > 0 |
| `ctr_all` | `all_clicks / impressions × 100` | impressions > 0 |
| `frequency` | `impressions / reach` | reach > 0 |
| `cpm` | `spend / impressions × 1000` | impressions > 0 |
| `cpc` | `spend / link_clicks` | link_clicks > 0 |
| `cpa` | `spend / conversions` | conversions > 0 |
| `lp_conversion_rate` | `conversions / landing_page_views × 100` | landing_page_views > 0 |

Uma derivação que resulte em valor não-finito é **descartada** (`_derivado`) em vez de virar `null` numa métrica que afirma ter sido avaliada.

### 3.3 Regra "0 não é ausência" e evidência mínima para escala
Todos os guards usam `is not None`, nunca truthiness — gasto 0, alcance 0 ou cliques 0 são medições válidas. `_evidencia_faltante_para_escala` exige **frequência, estado de aprendizado e ROAS** (quando há meta de ROAS) antes de abrir a janela do Cenário G, e recusa escala se o **CPM estiver acima do teto**. A mesma barreira é propagada ao fallback mínimo, ao prompt da IA e ao Copiloto — a recomendação de gastar mais é a única que exige evidência positiva, não apenas ausência de alarme.

### 3.4 Regras de conflito entre cenários (supressão)
| Suprime | Suprimido | Motivo |
|---|---|---|
| I (Learning Phase) | G, H | Não faz sentido escalar sem aprendizado estável |
| E (Fadiga plena) | H | H é fadiga iminente; E já é o estado crítico |
| D (LP Mismatch) | F | Não acusar "lead frio" quando o gargalo é a LP |
| A (Gancho Fraco) | B | Se não capta atenção, retenção é irrelevante |
| K (Canibalização) | G | ROAS alto de retargeting não é janela de escala real |
| G (Escala Vertical) | H | Vertical e horizontal são mutuamente exclusivas |

Após a supressão, os cenários são ordenados por prioridade (1 primeiro) e `primary_action` é a ação do primeiro.

### 3.5 Score de saúde: pesos, cobertura e confiança

**Pesos por métrica** (`_METRIC_WEIGHTS`, soma = 1.0) — define o que o produto considera importante:

| Métrica | Peso | | Métrica | Peso |
|---|---|---|---|---|
| CPA | 0.25 | | CPM | 0.05 |
| ROAS | 0.20 | | CPC | 0.03 |
| CTR Link | 0.12 | | CPL | 0.02 |
| Hook Rate | 0.10 | | CTR Todos | 0.00 (informativo) |
| Hold Rate | 0.08 | | Conversões/semana | 0.00 (informativo) |
| Conversão LP | 0.08 | | | |
| Frequência | 0.07 | | | |

- **`overall_score`** (0–100): média ponderada **só das métricas presentes**. Se nenhuma tem peso, retorna 50 (neutro).
- **`score_coverage`** (0–100): fração do peso total possível que foi de fato avaliada. Score 100 com cobertura 12 não é campanha perfeita — é campanha pouco medida.
- **`score_confidence`**: combina **duas leituras independentes e usa a mais fraca**:
  - por cobertura: `≥70` high · `≥40` medium · `<40` low
  - por amostra (conversões): `<10` low · `10–29` medium · `≥30` high (`_MIN_CONVERSOES_CONFIAVEL=10`, `_MIN_CONVERSOES_ESTAVEL=30`)

  Corrige um caso real: campanha com 2 conversões e todas as métricas preenchidas tinha cobertura 57% e era rotulada "Escalável".

### 3.6 `final_status`: o **pior** de duas fontes de evidência independentes
`_resolve_final_status` não olha só os cenários. Combina:

1. **Por cenários** (causa raiz confirmada): sem cenário (ignorando G) → GREEN; algum de prioridade 1 → RED; senão YELLOW. **Regra preservada: cenário G sozinho nunca é RED.**
2. **Por evidência métrica crua** (dano observado): RED se `overall_score < 40` **ou** ≥3 métricas RED com peso **ou** o **peso somado das métricas RED ≥ 0.20** (`_RED_WEIGHT_CRITICO`); YELLOW se score <60 ou existe qualquer RED/YELLOW; senão GREEN.

O resultado é o **pior dos dois**. **Por quê o limiar por peso:** contar métricas trata como iguais coisas que não são — CPA sozinho vale 0.25 e ROAS 0.20 (as métricas de resultado), enquanto CPC+CPL+CPM somam 0.10. Sem isso, CPA estourado sozinho saía como "Atenção" enquanto o próprio card dizia "campanha no vermelho".

**Consequência para a UI (regra documentada):** `final_status` e `overall_score` **podem divergir legitimamente** — status vem dos cenários, score é média ponderada. `final_status` manda na cor/severidade principal; o score é indicador secundário. Nunca tratar score alto como "tudo bem" havendo cenário crítico.

### 3.7 Textos honestos quando o engine não consegue afirmar
Três geradores de texto existem só para não deixar o silêncio parecer aprovação:
- **`_resumo_sem_cenario`**: não detectar cenário ≠ estar tudo bem. Com métricas RED sem causa raiz isolada, o texto diz exatamente isso, em vez do antigo "operando dentro dos parâmetros esperados".
- **`_partial_diagnosis_note`**: com cobertura <100% e métricas RED sem explicação, lista quais estão críticas sem causa **e quais dados enviar** (`_MISSING_DATA_HINTS`) para completar o diagnóstico.
- **`_nota_escala_bloqueada`**: CPA com folga mas sem evidência para confirmar escala → o engine diz "não posso afirmar" e lista o que falta, em vez de recomendar aumento de orçamento.

### 3.8 Regra do status `BLUE` (escalável) — **três** condições, não duas
`BLUE` é exclusivamente camada de apresentação; o backend nunca o retorna. `resolveUIStatus` (`adapt.ts`) exige:

1. `final_status === "GREEN"`, **e**
2. algum cenário com `code === "G"`, **e**
3. `score_confidence !== "low"`

A terceira condição é uma **segunda barreira deliberada**: "Escalável" é um convite a gastar mais, então o rótulo não aparece com confiança baixa mesmo que o engine tenha aberto a janela. *(Atenção: `CONTRATO_API_FRONTEND.md` documenta só as duas primeiras — ver seção 10.)* `PAUSED` é exibido como `YELLOW` até existir UI própria.

### 3.9 Rótulos da UI
| `UIStatus` | Rótulo | | Prioridade | Rótulo |
|---|---|---|---|---|
| RED | Crítico | | 1 | Crítico / Alta |
| YELLOW | Atenção | | 2 | Urgente / Média |
| GREEN | Saudável | | 3 | Monitorar / Baixa |
| BLUE | Escalável | | | |

### 3.10 Regras de derivação e exibição no adapter
- **Receita é derivada, não medida:** `revenue = spend × ROAS`, arredondado, e só quando ambos existem. Não há campo de receita real no schema.
- **Investimento** é `metrics.spend`; sem ele, não aparece tile.
- Métrica ausente exibe **`—`**, nunca `0`.
- **Truncamento de texto** (`primeiraFrase`, `tileNote`): ponto decimal não encerra frase (senão `R$39.90` virava "R$39"); marcador de lista numerada é removido antes (senão a regra de execução `"1. Conferir o pixel"` virava literalmente `"1"`); o corte respeita palavra inteira e marca com reticências.
- **Sugestões**: até 3 vindas dos cenários do engine + extras da IA, com teto total de 5; a ação da IA é truncada em 60 chars igual à do engine.

### 3.11 Regras do Resumo (Home)
- **Chips de status contam tudo na tela** (vivas + exemplos), porque filtram a lista abaixo — mudar isso quebraria a relação chip↔lista.
- **Totais financeiros somam só campanhas vivas** (`isLiveId`, id ≥ 1000) — dinheiro fake dos exemplos não infla o resumo real.
- **Médias (ROAS, CPA) só dividem por quem tem a métrica** — somar ausência como 0 puxava a média artificialmente.

### 3.12 Regras do Comparador
- Um confronto só é decidido quando **os dois lados têm o número**; ausência exibe `—` e nunca vence.
- O veredito exclui o cenário G da frase de problema (senão "aumentar orçamento agora" era descrito como "merece atenção antes de receber mais verba").
- Se o vencedor tem `confidence === "low"`, uma **ressalva vai junto do veredito**: pode ter vencido por falta de dado, não por performance.
- Nomes de coluna encurtados no travessão; se o encurtamento colidir, voltam inteiros.

### 3.13 Copiloto — roteamento local, não IA
`buildReply` roteia por regex sobre a pergunta (CPA, ROAS, CTR, frequência, escalar, ação, causa, oportunidade, sugestão) e responde **sempre a partir dos dados reais da campanha**. Não é NLU nem LLM — e o fallback diz isso explicitamente ("não tenho uma resposta específica pra essa pergunta ainda"). Regras notáveis:
- Métrica ausente → explica que não há o dado e **como enviá-lo**, nunca inventa 0.
- Veredito de frequência vem **do engine** (cenário E/H e cor do tile), não de um limiar fixo no componente.
- "Vale escalar?" com cobertura baixa e sem cenário → *"não dá para afirmar"*, não *"ainda não é o momento"* (que sugeriria problema medido onde há falta de dado).

### 3.14 Modos de entrada de dados
1. **Manual** — formulário. **Expõe um subconjunto dos campos** (ver 5.3).
2. **Importar arquivo (JSON)** — whitelist fechada por **nome exato** (`METRIC_KEYS`/`TARGET_KEYS`), enums validados contra lista fechada. Chave desconhecida, tipo errado ou valor fora da lista são **reportados na pré-visualização e ignorados**, nunca enviados. Array na raiz é rejeitado explicitamente.
3. **Coletar automático** *(legado congelado)* — scraping; sempre volta ao formulário manual para revisão humana, nunca envia direto.

Campos que o backend tipa como `int` são **arredondados e reescritos no formulário** antes do envio, para o gestor ver o que foi enviado (evita 422 "int_from_float" que chegava como "A análise falhou: 422").

### 3.15 Persistência: identidade e mesclagem
- Tabela `campanhas`: `id` (autoincrement), `payload` (JSON), `criado_em`, `atualizado_em`. SQLite em modo **WAL** (leitura não bloqueia escrita).
- **Faixas de id na UI:** exemplos (mock) `< 1000`; campanhas vivas `≥ 1000`. `idLocalDoServidor(serverId) = 1000 + serverId`.
- **O id local não é identidade** — é gerado por navegador, então duas pessoas criariam o mesmo `1000`. Quem identifica é o `serverId`.
- **Mesclagem:** o servidor manda no que já foi salvo lá; campanha só-local (sem `serverId`) nunca é descartada e **sobe sozinha** na próxima abertura.
- `salvar` com id inexistente **insere** em vez de falhar (a UI pode ter o dado só no `localStorage`).
- Linha com JSON corrompido é **ignorada individualmente**, não derruba a listagem inteira.
- **Apagar:** `404` conta como **sucesso** (outra pessoa já apagou); falha de servidor **não** remove o card da tela (sumir aqui e continuar lá faria a campanha ressuscitar); ids apagados na sessão ficam registrados para a sincronização em voo não trazê-los de volta.

### 3.16 Indicador de estado da IA (dashboard)
A ausência da IA degrada em silêncio por desenho (a análise responde 200 com `ai_insights: null`), e foi exatamente por isso que o servidor passou semanas sem chave sem ninguém notar. O dashboard agora expõe o estado no cabeçalho, em **três** estados:

| Estado | Quando | Cor |
|---|---|---|
| **IA on** | servidor diz `ai.available = true` e nada contradiz | verde, ponto sólido |
| **IA off** | servidor diz `ai.available = false` (toggle desligado ou sem chave) | neutro, ponto sólido |
| **IA falhando** | servidor **prometeu** a IA, mas a última análise voltou sem ela | âmbar |
| **IA ?** | não deu para saber — servidor fora do ar, ou versão anterior à rota `/status` | neutro, **ponto vazado** |

**Por que `falhando` precisa existir:** `/status` responde se a IA está *configurada* — toggle ligado, chave não-vazia, SDK instalado. **Nenhuma das três coisas prova que a chave autentica.** Verificado em 25/08/2026 subindo o backend com uma chave sintética inválida: `/status` respondeu `available: true` e a análise voltou `ai_insights: null`. Sem este estado, o selo mentiria exatamente no caso que este projeto já viveu (chave revogada em julho/2026, `401` na hora de usar).

A verificação é de **custo zero**: em vez de o servidor testar a chave a cada abertura do painel (uma chamada paga por vez), o frontend observa o desfecho de cada análise — se a IA foi prometida e `ai_insights` não veio, isso é falha real, observada (`lib/aiHealth.ts`).

Regras deliberadas:
- **Observação vence declaração.** `falhando` tem precedência sobre o `available: true` do servidor.
- **`off` vence observação.** Servidor que declara a IA desligada nunca é "falhando" — não prometeu nada, então não descumpriu. O selo já diz "off".
- **A falha não gruda.** A análise seguinte que trouxer IA devolve o selo a "on" sozinho — validado ao vivo, sem recarregar a página.
- **Nada é acusado antes de sabermos o que o servidor oferece** — sem status, uma análise sem IA não vira falha.
- O estado vive **em memória**, não no `localStorage`: é um sinal ao vivo sobre o servidor agora, e persistir deixaria um aviso velho na tela depois de o problema ter sido resolvido.
- **`desconhecido` nunca é exibido como "off".** Servidor antigo e servidor fora do ar chegam idênticos ao cliente; afirmar "desligada" inventaria informação. O selo diz que não sabe.
- O selo **nasce em `desconhecido`**, não em `off` — senão piscaria uma afirmação não verificada durante a busca.
- O **modelo só aparece com a IA ligada**; exibi-lo com a IA off sugeriria que está em uso.
- O texto do estado `off` diz as duas coisas: que falta a IA **e** que o diagnóstico do engine continua completo e válido — senão o selo viraria alarme sobre o produto inteiro.
- O backend reporta `enabled` e `available` separados de propósito: `enabled=true, available=false` é "toggle ligado, falta a chave" — o estado exato em que a produção ficou.
- O endpoint é público e sem autenticação, então reporta apenas capacidade binária e o nome do modelo — **nunca a chave nem o caminho do banco** (coberto por teste).

### 3.17 Regras do prompt da IA
- **Princípio 0 (NÃO INVENTE):** métrica ausente é DESCONHECIDA, nunca "provavelmente boa"; proibido citar benchmark de mercado ou prometer resultado.
- **Limites de quantidade:** máx. 3 cenários extras, 3 insights contextuais, 2 alertas de risco — "se os dados não justificarem o máximo, retorne menos".
- **Bloco de cobertura:** a IA recebe `coverage`/`confidence`; com confiança `low`, recebe regra explícita de **não recomendar aumento de orçamento** nem afirmar que a campanha está saudável.
- **Origem de cada meta é declarada:** cada target vai marcado como *"definido pelo gestor"* ou *"padrão do sistema"* — para a IA não atribuir ao usuário uma decisão que foi default do produto.
- **A nota do engine acompanha cada métrica** no prompt (carrega a meta usada no julgamento), para a IA não justificar um vermelho com limiar inventado.
- **Aviso de plataforma:** para qualquer plataforma ≠ Meta, instrução explícita de não recomendar recurso exclusivo do Meta (Advantage+, LAL, Gerenciador de Eventos).

---

## 4. Stack tecnológica

### Backend — `backend/backend-nexgestor-main`
| Item | Escolha |
|---|---|
| Framework | FastAPI `0.136.1` + uvicorn `0.46.0` |
| Validação/config | Pydantic `2.13.3` + `pydantic-settings` `2.14.1` (`.env`) |
| IA | Google Gemini via `google-genai`, modelo `gemini-flash-lite-latest`, resposta com schema estruturado (classe Pydantic), timeout 8s |
| Persistência | SQLite (arquivo único, WAL), **sem ORM** — `sqlite3` com queries parametrizadas |
| Testes | pytest — **1400 testes**, ~1,5s, **zero chamadas de rede** (`conftest.py` desliga a IA por padrão em toda a suíte) |
| Container | Docker, `python:3.12-slim`, usuário sem privilégio `uid 10001`, `uvicorn --workers 2` |

### Frontend — `frontend/nexgestor-extension`
| Item | Escolha |
|---|---|
| Framework | Plasmo `0.90.5` + React `18.2` + TypeScript — extensão Chrome MV3 (side panel) |
| Estilo | Tailwind (utilitários) + `style.css` extenso com variáveis de tema via `color-mix()` |
| Testes | Vitest + Testing Library (jsdom) — **326 testes**, 18 arquivos |
| Estado/persistência | `localStorage` puro; servidor como fonte de verdade quando disponível |
| Build da equipe | `build-team.sh <URL>` grava a URL em build-time (`PLASMO_PUBLIC_API_BASE`), gera zip e regenera `extensao-pronta/` |

### Infraestrutura (produção)
- VPS Hostinger, `https://gestor.nexgold.com.br`, HTTPS válido (Let's Encrypt).
- **Quem atende 80/443 é o nginx do próprio VPS**, não o Caddy deste repositório. O `docker-compose.yml` sobe **só o backend em `127.0.0.1:8000`** (invisível para a internet); `docker-compose.caddy.yml` é a variante para servidor sem proxy próprio.
- Rate limit no nginx (60r/m + burst 10 → 429). Volume Docker `nexgestor-dados` para o SQLite.

### Limites operacionais configurados
| Limite | Valor | Onde |
|---|---|---|
| Campanhas na base | 500 (→ HTTP 507) | `DB_MAX_CAMPANHAS` |
| Tamanho do payload | 64 KB (→ HTTP 413) | `DB_MAX_PAYLOAD_BYTES` |
| Timeout da IA | 8s | `GEMINI_TIMEOUT_SECONDS` |
| Timeout do fetch (cliente) | 30s | `TIMEOUT_MS` em `lib/api.ts` |
| Rate limit | 60r/m + burst 10 | nginx do VPS |
| Workers | 2 | `Dockerfile` |
| Gasto da chave Gemini | R$ 15, **dividido por toda a equipe** | Google Cloud |

### Contrato HTTP completo (Índice de API)
| Rota | Método | O que faz | Códigos |
|---|---|---|---|
| `/api/v1/campaign/analyze` | POST | Recebe métricas e metas de uma campanha e devolve o diagnóstico completo (cenários detectados, score, ação primária). | 200 · 400 (validação de domínio) · 422 (payload) · 500 |
| `/api/v1/campaign/scenarios` | GET | Lista o catálogo de cenários que o engine de diagnóstico sabe detectar. | 200 (catálogo dos 15) |
| `/api/v1/campaign/health` | GET | Health check interno do módulo de campanha. | 200 (oculto do Swagger) |
| `/api/v1/status` | GET | Diz quais capacidades opcionais (IA, persistência) estão ativas neste servidor — usado pelo dashboard para o selo de estado da IA (§3.16). | 200 — capacidades ligadas (IA, persistência) |
| `/` | GET | Health check geral da API. | 200 (health check) |
| `/api/v1/campaigns` | GET | Lista as campanhas salvas do dono identificado (header `X-Nex-Dono`). | 200 · **501** (persistência desligada) · 500 |
| `/api/v1/campaigns` | POST | Salva uma campanha (cria nova ou atualiza uma existente). | 200 · 501 · **413** (payload) · **507** (base cheia) · 500 |
| `/api/v1/campaigns/{id}` | DELETE | Apaga uma campanha salva do dono. | 200 · 501 · **404** · 500 |

Tratados no cliente como mensagem própria: **429/503** (limite de requisições), **502/504** (servidor fora do ar/travado), abort por timeout. Demais códigos ficam crus de propósito — o número é o que permite diagnosticar.

---

## 5. O que está funcional vs. incompleto/pendente

### ✅ Funcional e validado
- **Engine completo**: 15 cenários, supressão de conflitos, score ponderado com cobertura+amostra, textos honestos de incerteza. **1400 testes** passando.
- **`POST /analyze` e `GET /scenarios`**: contrato estável, validação robusta (enums fechados, rejeição de não-finitos, handler que nunca deixa 500 sem corpo).
- **Integração Gemini**: funcional ponta a ponta, sempre opcional, com redação de chave em logs/erros e recriação do client em rotação de chave.
- **Persistência compartilhada**: listar/salvar/apagar, com tratamento de erro que nunca derruba a UI. Validada com container real (sobrevive a destruir container e imagem), dois perfis de navegador na mesma base, e campanha só-local subindo sozinha.
- **Dashboard (side panel)**: Home com resumo + chips-filtro, cards, detalhe com score animado, comparador, Copiloto, tema claro/escuro (WCAG conferido), `prefers-reduced-motion`, atalho ⌘K/Ctrl+K, acessibilidade de teclado, lixeira com confirmação "Apagar para todo o time?".
- **Modos manual e importação JSON**, com whitelist fechada e pré-visualização de avisos.
- **Indicador de estado da IA** no cabeçalho (§3.16), com `GET /api/v1/status` no backend e detecção de falha real por observação (`lib/aiHealth.ts`). Validado ao vivo nos quatro estados — incluindo o ciclo completo `IA on → chave inválida → IA falhando → chave válida → IA on`, sem recarregar a página. Contraste WCAG AA medido nos dois temas (pior caso 5,02:1) e geometria conferida na largura real do side panel (420px).
- **Suítes**: backend **1400**, frontend **326** — ambas rodadas nesta revisão.

### 🟡 Incompleto / temporário por decisão explícita
- **Base COMPARTILHADA sem login/dono.** Qualquer pessoa vê e apaga tudo. Válido só para o período de testes; migração descrita em `storage.py` mas **não implementada**. **Pré-requisito obrigatório antes de usuários reais.**
- **Sem histórico/série temporal** (ver 1.1). O gráfico da UI é decorativo para dados reais.
- **Coleta automática (scraping)** — legado congelado. Além da fragilidade conhecida, **lê apenas a primeira linha de dados** da tabela (uma campanha, não a tabela toda) e cobre só rótulos PT/EN.
- **Formulário manual não expõe todos os campos** (ver 5.3) — alguns cenários e ajustes só são alcançáveis por importação de JSON.
- **Piso de 50 conversões/semana (Cenário I)** não é ajustável no formulário manual — para anunciante pequeno, quase toda campanha sai como crítica. Observação de produto registrada, não corrigida.
- **Cenário de "leilão caro"** (CPM travando escala) não tem card de causa raiz próprio — aparece só como métrica CPM vermelha. Decisão de produto em aberto desde 2026-07-28.

### 5.3 Campos do schema **não** expostos no formulário manual
Só alcançáveis por importação de JSON:

**Métricas:** `reach`, `video_views_3s`, `video_views_50pct`, `thruplays`, `all_clicks`, `lp_conversion_rate`
**Metas:** `min_hold_rate`, `max_ctr_all_ratio`, `max_cpc`, `min_lp_conversion_rate`, `max_frequency_fatigue`, `max_frequency_critical`, `max_frequency_horizontal`, `min_weekly_conversions`, `scale_cpa_margin`, `scale_frequency_ceiling`

*(Contexto: até 2026-08-01 faltavam também `cpl`, `link_clicks`, `landing_page_views`, `max_cpl` e `max_cpm`, o que tornava os cenários **D, F, J e N inalcançáveis** por quem usasse o formulário. Foram adicionados. A lista acima é o que ainda falta — vale reavaliar caso a caso se o dashboard passar a ser a interface principal.)*

### 🔴 Estado de PRODUÇÃO — medido em 2026-08-25 (não presumido)

Quatro requisições contra `https://gestor.nexgold.com.br` nesta revisão:

| Verificação | Resultado | Significado |
|---|---|---|
| `GET /api/v1/campaign/scenarios` | **200**, `total: 15` | O engine no ar tem os 15 cenários (código de 2026-07-28) |
| `GET /api/v1/campaigns` | **404** | **A persistência NÃO está no ar.** O código de 2026-08-14 (base compartilhada + lixeira) nunca foi implantado |
| `POST /api/v1/campaign/analyze` | 200, `ai_insights: null` | **A IA está DESLIGADA em produção** — `GEMINI_API_KEY` vazia no servidor |
| `GET /docs` | 404 (do nginx) | Swagger não alcançável hoje, por roteamento e não por hardening da app |
| `GET /` | HTML do `sidepanel` | A raiz serve o painel da extensão compilado |

**Duas conclusões que mudam o entendimento do projeto:**

1. **A equipe está testando sem a camada de IA.** `README.md` e `CLAUDE.md` afirmam que a IA está ligada com chave compartilhada; `deploy/.env.example` dizia que a chave estava vazia — **o `.env.example` estava certo**. Todo feedback da equipe sobre qualidade de diagnóstico até aqui reflete **apenas o engine determinístico**. O limite de R$15 provavelmente não foi tocado.

   > **Endereçado em parte (25/08/2026):** o dashboard passou a exibir o estado da IA no cabeçalho (§3.16), para que esse tipo de ausência nunca mais dependa de alguém desconfiar. Isso torna o problema **visível**, não o resolve: ligar a IA ainda exige preencher `GEMINI_API_KEY` no `.env` do VPS, o que depende de acesso ao servidor.
2. **A equipe não tem persistência nem lixeira.** As campanhas vivem só no `localStorage` de cada navegador — ou seja, o comportamento descrito no trecho "desatualizado" de `COMO-USAR.md` (§10) é, por acidente, o que está de fato acontecendo em produção. Nada é compartilhado hoje.

**Consequência prática:** subir o código novo no VPS (`git pull && docker compose up -d --build` em `deploy/`) muda **duas** coisas de uma vez para a equipe: liga a persistência compartilhada **e**, se a chave for preenchida, liga a IA. Vale decidir se as duas devem entrar juntas ou em etapas.

### 📋 Pendente — como colocar produção em dia (guardado a pedido do usuário, 2026-08-25)

Precisa de acesso SSH ao VPS. **Não é para executar agora** — o usuário decidiu fazer depois.

```bash
# 1. Atualizar o código (traz persistência, lixeira e /api/v1/status)
cd <pasta do repo no VPS>/deploy
git pull
docker compose up -d --build

# 2. Ligar a IA — EDITAR NO SERVIDOR, nunca colar a chave em chat
nano .env            # preencher GEMINI_API_KEY=
docker compose up -d # recarrega com a variável nova
```

**Conferir de fora depois, sem precisar de SSH:**
```bash
curl https://gestor.nexgold.com.br/api/v1/status
# esperado: {"ai":{"enabled":true,"available":true,...},"persistence":{"enabled":true}}
curl https://gestor.nexgold.com.br/api/v1/campaigns   # esperado: 200, não 404
```

**Confirmar que subiu pelo compose.** Se o backend estiver rodando por
uvicorn/systemd direto, o volume `nexgestor-dados` e o `DB_PATH` não se aplicam:
a persistência fica desligada e as rotas respondem **501 em vez de 404**. Essa
diferença (501 vs 404) é o jeito mais rápido de saber o que aconteceu.

**Só depois do passo 1**, gerar o pacote da equipe:
`frontend/nexgestor-extension/build-team.sh https://gestor.nexgold.com.br` —
antes disso, distribuiria uma extensão falando com um backend sem as rotas.

**Também pendente no servidor, não bloqueante:** aplicar o bloco `error_page 429`
+ `location @limite` de `deploy/nginx-gestor.conf.exemplo` (testado em nginx 1.24
real). O `host_permissions` já contorna pelo lado da extensão, mas isso corrige a
causa e cobre o preflight.

> Depois do passo 1, o próprio selo de IA do dashboard (§3.16) passa a dizer em
> qual dos três casos o servidor está: desligada, configurada-mas-falhando, ou no
> ar — sem precisar de `curl`.

### ⬜ A confirmar
- **Como o backend está rodando no VPS** (compose, uvicorn direto ou systemd). Se não for pelo compose, o volume `nexgestor-dados` e o `DB_PATH` não entram e a persistência ficaria desligada mesmo após o deploy — respondendo 501 em vez de 404. Só verificável de dentro do servidor.
- **`/docs` deve ficar exposto?** `main.py` **não** desabilita a documentação interativa; hoje o 404 vem do roteamento do nginx. Mudar o `location /` do nginx exporia o Swagger sem que ninguém percebesse. Vale decidir explicitamente na aplicação.
- **Por que a raiz do domínio serve o painel da extensão compilado.** Não vaza segredo, mas provavelmente não é intencional — perguntar a quem montou o servidor.
- **Sincronia entre repositórios** pessoal (`origin`) e da empresa (`empresa`). Conferir com `git rev-list --count empresa/main..main` (deve ser 0).
- **Alerta de secret scanning #1** (falso positivo, "Used in tests") já foi fechado manualmente? Nenhuma chave real vazou — verificado comparando a chave do `.env` contra todos os blobs de todos os commits.

---

## 6. Cobertura de testes (o que está protegido contra regressão)

### Backend (1400 testes)
`test_engine.py` (engine e correções de auditoria) · `test_cenarios_novos.py` (L–O) · `test_regressao_20260728.py` (achados do relatório externo + próprios) · `test_status_escalation.py` (escalonamento de status) · `test_ai_integration.py` (camada de IA e SDK, sempre mockada) · `test_storage.py` (persistência) · `test_status_endpoint.py` (capacidades e não-vazamento de segredo) · `conftest.py` (IA desligada globalmente).

Método usado historicamente e que vale manter: **fuzz de payloads válidos** (60.000 combinações — qualquer exceção é bug do engine) e **teste de mutação** (reverter a correção e confirmar que o teste falha) antes de considerar um bug fechado.

### Frontend (326 testes, 18 arquivos)
`lib/sanitize` (XSS por allowlist, incluindo caso adversarial) · `lib/adapt` (o adapter mais complexo: BLUE, ausência vs zero, truncamentos, fallbacks) · `lib/store` (ids, upsert, mesclagem, localStorage corrompido) · `lib/api` (timeout cobrindo a leitura do corpo, 429/502, detecção de abort) · `lib/theme` (regressão: mudança de tema do SO não sobrescreve escolha explícita) · `lib/countup` · `lib/format` · `lib/sync` · `components/Copilot` (roteamento grounded) · `components/NewCampaignModal` (whitelist da importação) · `components/Summary` (regressão do dinheiro fake) · `components/CampaignCard` · `components/AIExtras` · `components/App.apagar` · `components/AIStatusBadge` (quatro estados + acessibilidade + reação a falha real) · `lib/status` (leitura de capacidades) · `lib/aiHealth` (só acusa falha quando houve promessa) · `regressao-20260728`.

**Lacuna conhecida:** jsdom não tem layout nem scroll real — bugs de rolagem, hover e animação **não são pegos** pela suíte. Três bugs reais dessa natureza só apareceram em validação ao vivo no navegador. Para efeito de transform/animação, medir geometria (`getBoundingClientRect`/`getComputedStyle`), porque captura de tela não prova que funcionou.

---

## 7. Segurança e tratamento de segredos

- **Regra fixada:** segredo (API key, senha, token) **só** é configurado editando o arquivo num editor/terminal **fora da sessão de chat**. O prefixo `!` do Claude Code **não** esconde o comando do modelo — ele só pula a confirmação de permissão. O fluxo correto: o usuário edita o `.env` externamente → avisa "pronto" → a verificação é por **contagem de caracteres** (`grep -c`/`wc -c`), nunca exibindo o valor.
- **Nunca escrever exemplo de segredo como literal**, nem em código nem em documentação. Em código, montar em runtime; em documentação, descrever o formato. *(Um alerta de secret scanning do GitHub foi disparado justamente por um placeholder falso citado por extenso na documentação.)*
- `GEMINI_API_KEY` tem `repr=False` — não aparece em `repr(settings)` (o pytest imprime o repr dos dois lados de um assert que falha).
- `_redact_key` cobre o formato antigo (`AIza`+35) **e** a chave exata configurada em runtime; aplicada a tracebacks antes de qualquer log.
- `.env` no `.gitignore`; `.dockerignore` impede o `.env` de entrar no contexto de build; verificado que a chave não aparece em nenhuma camada da imagem.
- Container roda como `uid 10001`, sem privilégio. Queries SQL parametrizadas (payload hostil validado: volta idêntico, tabela intacta).
- Banco em pasta sem permissão de escrita: o app **sobe**, a persistência devolve 500 limpo (sem traceback no corpo, sem chave no log) e **a análise continua respondendo 200** — o produto principal não cai junto com o acessório.

---

## 8. Decisões de produto em aberto

1. **Nomear ou não um "Cenário de leilão caro"** para quando o CPM acima do teto bloqueia a escala vertical (hoje só métrica vermelha, sem causa raiz nomeada). Oferecido em 2026-07-28, sem resposta.
2. **Piso de conversões semanais do Cenário I** (default 50, regra do Meta) torna quase toda campanha de anunciante pequeno crítica, e o formulário manual não permite ajustar.
3. **Migração da base compartilhada para dado por pessoa** — obrigatória antes de usuários reais; caminho descrito, prazo não definido.
4. **Exposição de `/docs`** — decidir explicitamente se fica pública.

---

## 9. Escopo confirmado daqui em diante

Por instrução do usuário (2026-08-25): **o foco passa a ser exclusivamente o dashboard** — a experiência do side panel (UI, lógica de apresentação, adapter) e o backend que a alimenta (engine, IA, persistência).

**Congelado (não receber trabalho ativo):** manifest e permissões da extensão, `contents/ads-manager.ts` (scraping), `background.ts`, mecânica de `chrome.tabs`, empacotamento (`build-team.sh`, `extensao-pronta/`), e a migração para a Meta Marketing API.

**Implicação prática a considerar no planejamento:** hoje o dashboard **só existe dentro da extensão** (é uma página `sidepanel.html` empacotada em MV3). Se o dashboard passar a ser o produto principal, a decisão de continuar dentro da extensão ou servi-lo como aplicação web separada ainda **não foi tomada** — e ela afeta CORS, `host_permissions`, autenticação e distribuição. **A confirmar com o usuário.**

---

## 10. Divergências encontradas entre a documentação existente e o código

Levantadas nesta revisão lendo cada documento contra o código. **Nenhuma foi corrigida** — estão registradas aqui para decisão.

| Documento | O que afirma | O que o código faz |
|---|---|---|
| `COMO-USAR.md` §"O que esperar" | *"Seus dados ficam só no seu navegador. Não há conta nem servidor guardando suas campanhas… cada pessoa vê só as próprias campanhas."* | **Contradiz a própria seção anterior do mesmo arquivo** (§"as campanhas são de todo mundo") e o código: desde 14/08/2026 há base compartilhada no servidor. Resquício não atualizado. **É a divergência mais grave** — diz ao usuário o oposto sobre privacidade. |
| `CONTRATO_API_FRONTEND.md` | `platform` ∈ `meta_ads \| google_ads` | São **4** valores desde 2026-07-29 (+ `tiktok_ads`, `linkedin_ads`) |
| `CONTRATO_API_FRONTEND.md` | `code` ∈ `A..K` | São **A..O** (15 cenários) — o próprio doc diz "15 cenários" no topo, contradizendo-se |
| `CONTRATO_API_FRONTEND.md` | `score_confidence` "derivada do coverage" | Combina **cobertura E volume de amostra**, usando a mais fraca |
| `CONTRATO_API_FRONTEND.md` | `ai_insights` "null nesta fase (IA desligada)" | A IA está implementada e funcional; vem preenchida quando há chave |
| `CONTRATO_API_FRONTEND.md` | Regra BLUE = GREEN + cenário G | O frontend exige uma **terceira** condição: `confidence !== "low"` |
| `CONTRATO_API_FRONTEND.md` | Documenta só `/analyze` e `/scenarios`; erros 200/400/422/500 | Faltam as **3 rotas de persistência** (`/campaigns`) e os códigos **501, 413, 507, 404** |
| `README.md` §Testes | "Backend — 1354 testes / Frontend — 167 testes" | **1393** e **283** (medidos nesta revisão) |
| `README.md` e `CLAUDE.md` | IA **ligada** em produção com chave compartilhada; limite de R$15 dividido pela equipe | **Falso, medido em 2026-08-25:** `ai_insights` vem `null` de produção. O `deploy/.env.example` estava certo (chave vazia). A equipe testa só o engine determinístico |
| `README.md` / `CLAUDE.md` (roadmap) | Persistência compartilhada disponível para a equipe | **Não está no ar:** `GET /api/v1/campaigns` → 404 em produção. O código existe e está testado, mas nunca foi implantado |
| `AUDITORIA.md` | Documento histórico (9 itens, todos ✅ resolvidos), "74 testes passando" | Continua válido como registro; a contagem é de julho e não reflete o estado atual |

---

## 11. Como manter este documento

Ao encerrar uma sessão que mude comportamento de produto, atualizar aqui: seção **3** se mudou regra de negócio, **5** se mudou o que funciona, **8** se uma decisão em aberto foi resolvida, **10** se uma divergência foi corrigida. As contagens de teste devem vir de execução real, não do último registro escrito — foi assim que a divergência do `README.md` passou despercebida.
