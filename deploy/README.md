# Deploy do backend NexGestor no VPS

O backend **já está no ar**. Este arquivo descreve a montagem real, como ligar
a camada de IA e como manter tudo funcionando.

## Estado atual — verificado em 14/08/2026

| Item | Situação |
|---|---|
| URL | `https://gestor.nexgold.com.br` |
| Servidor | VPS Hostinger (`srv1884808.hstgr.cloud`) |
| DNS | Registro A criado, resolve normalmente |
| Certificado | Let's Encrypt, emitido 13/08/2026, válido até 11/11/2026 |
| Porta de entrada | **nginx** do próprio VPS (não o Caddy deste repositório) |
| `GET /api/v1/campaign/scenarios` | 200 — 15 cenários |
| `POST /api/v1/campaign/analyze` | 200 em ~0,2s, engine correto |
| CORS da extensão | Passa (`Origin: chrome-extension://…`) |
| `/docs` e `/openapi.json` | 404 — **do nginx**, não do app (ver abaixo) |
| Limite de requisições | **Ativo** — 11 chamadas simultâneas passam, a 12ª volta 429 |
| **Camada de IA** | **Desligada** — `ai_insights` volta `null` |

A renovação do certificado está coberta pelo Gabriel, que montou o servidor
(informado por ele; o mecanismo não foi verificado daqui).

### Campanhas salvas — base compartilhada (temporária)

Desde 14/08/2026 o servidor guarda as campanhas analisadas num SQLite
(`/dados/nexgestor.db`, volume `nexgestor-dados`). Endpoints:
`GET/POST /api/v1/campaigns` e `DELETE /api/v1/campaigns/{id}`.

> ⚠️ **Sem login e sem dono**: toda a equipe vê e pode apagar as campanhas de
> todo mundo. Foi decidido assim **para o período de testes**. Antes de abrir
> para usuários reais isto precisa virar dado por pessoa — o caminho de
> migração está escrito em `app/service/storage.py`.

O que já foi verificado com container real (podman), não presumido:

- O volume nasce pertencendo ao `appuser` (uid 10001) e o processo escreve —
  a pasta é criada com o dono certo **na imagem**, antes da montagem.
- **O dado sobrevive a destruir o container E a imagem** e subir de novo:
  duas campanhas continuaram lá, com os timestamps originais.
- Com a extensão real em dois perfis diferentes de navegador, os dois enxergam
  a mesma base, e uma campanha criada depois aparece para ambos.
- Uma campanha analisada com o servidor fora do ar fica só no navegador e
  **sobe sozinha** na próxima abertura (verificado ponta a ponta).

**Desligar a persistência:** `DB_PATH=` vazio no `.env`. O backend volta a ser
stateless e a extensão continua funcionando com o `localStorage` — as rotas
respondem 501, que ela trata em silêncio.

**Backup** (o arquivo mora num volume Docker, sem cópia automática):

```bash
docker compose stop api
docker run --rm -v nexgestor-dados:/d -v "$PWD":/b alpine \
  sh -c 'cp /d/nexgestor.db* /b/ 2>/dev/null || cp /d/nexgestor.db /b/'
docker compose start api
```

Parar o serviço antes evita copiar um `-wal` pela metade. Sem parar, copie
também os arquivos `nexgestor.db-wal` e `nexgestor.db-shm`.

---

### Sobre o 404 em `/docs` — não é hardening, é roteamento

O `app/main.py` **não** desabilita a documentação (não há `docs_url=None` nem
`openapi_url=None`), então não é o app que está recusando. O que acontece é que
o nginx só encaminha o caminho da API; a raiz serve conteúdo estático. Prova:

| Caminho | Resposta | Quem respondeu |
|---|---|---|
| `/docs` | 404 **HTML** com rodapé `nginx/1.24.0 (Ubuntu)` | nginx |
| `/api/v1/<inexistente>` | 404 **JSON** `{"detail":"Not Found"}` | FastAPI |

Duas consequências práticas:

1. **Não é sinal de que o backend no ar seja outro build.** A dúvida registrada
   mais abaixo ("não confirmado como o backend foi subido") continua de pé, mas
   o 404 do `/docs` não é evidência dela — o engine responde sob `/api` com os
   15 cenários deste repositório.
2. **A documentação da API ficaria pública se alguém encaminhasse a raiz** para
   o backend. O `nginx-gestor.conf.exemplo` faz exatamente isso no `location /`
   — por isso ele traz um aviso para não ser aplicado sem adaptar.

> Curiosidade medida junto: a raiz do domínio hoje devolve o **painel da própria
> extensão** compilado (HTML com `<div id="__plasmo">` e `sidepanel.*.js`).
> Alguém publicou o build do frontend ali. Não expõe segredo (o bundle é o mesmo
> que a equipe instala, e a chave da IA vive só no servidor), mas provavelmente
> não era intencional — vale confirmar com quem montou o servidor.

### 🔴 Um ajuste pendente no nginx: o 429 não chega à extensão

O limite de requisições funciona, mas a resposta 429 é gerada pelo **nginx**, e
sai **sem cabeçalho CORS** — ao contrário do 200, que vem do backend e sai com
ele. Medido na mesma requisição, só mudando o resultado:

| Resposta | Quem gera | `Access-Control-Allow-Origin` |
|---|---|---|
| 200 | backend | presente |
| 429 | nginx | **ausente** |

Sem esse cabeçalho o Chrome bloqueia a resposta antes do JavaScript ler o
status. Na extensão o erro chega como `Failed to fetch` — **idêntico a queda de
internet** —, então o tratamento de 429 que existe em `lib/api.ts` nunca roda e
o usuário lê uma mensagem sobre a conexão dele quando o servidor é que o estava
limitando.

Isso vai acontecer na prática: o limite é por IP de origem, e a equipe inteira
num mesmo escritório sai pelo **mesmo IP público** (NAT) — 11 análises
simultâneas já estouram.

**Há duas correções, e a do lado do cliente já foi aplicada:**

1. **Extensão (feito).** O host de produção entrou em `host_permissions`
   (`package.json`), o que isenta o painel de CORS e o faz enxergar as
   respostas do proxy. **Provado em navegador real** (Chromium 151, duas cópias
   do mesmo build diferindo só nessa linha, contra este servidor):

   | Build | Resultado de 14 chamadas simultâneas |
   |---|---|
   | com o host declarado | leu **5×200 e 9×429** — nenhuma bloqueada |
   | sem o host declarado | **14 de 14 bloqueadas** (`TypeError: Failed to fetch`) |

   Num pedido isolado, sem estourar o limite, **as duas leem 200** — o backend
   manda CORS normalmente. A diferença aparece só nos erros gerados pelo nginx.
   Vale por build: uma extensão apontada para outro endereço volta ao
   comportamento antigo (o `build-team.sh` avisa quando isso acontece).

2. **nginx (pendente, precisa de acesso ao servidor).** Correção de 5 linhas
   (`error_page 429` + um `location` com os cabeçalhos), pronta e **testada num
   nginx 1.24 real** em `nginx-gestor.conf.exemplo`. Continua valendo a pena:
   conserta a causa na origem, cobre o **preflight** (que também é contado pelo
   limite) e vale para qualquer cliente, não só para os hosts declarados no
   manifest.

---

## Como está montado

```
internet ──► nginx (80/443, VPS)  ──►  backend FastAPI (127.0.0.1:8000)
             HTTPS + certificado         engine + integração Gemini
```

O `docker-compose.yml` desta pasta reflete essa montagem: sobe **só** o
backend, escutando em `127.0.0.1:8000`. Ele não tenta ocupar 80/443, porque
essas portas já são do nginx.

**O que foi verificado e o que não foi.** Tudo na tabela acima foi medido de
fora (DNS, certificado, respostas da API, CORS). Duas coisas só dá pra saber
de dentro do VPS e seguem **não confirmadas**:

1. **Como o backend foi subido** — por este compose ou por uvicorn/systemd.
   Muda o comando de restart e o caminho do `.env` (ver a seção da IA).
2. **Se o nginx roda no host ou em container.** O `Server: nginx/1.24.0
   (Ubuntu)` é a cara do pacote da distribuição, que roda no host — e é o que
   este arquivo assume. Se estivesse num container, `proxy_pass` para
   `127.0.0.1:8000` apontaria para dentro do próprio container do nginx e não
   acharia o backend; o endereço teria que ser o nome do serviço na rede do
   Docker. Como a API responde hoje, o que está lá certamente está coerente —
   a ressalva vale só para quem for reconfigurar.

O bloco nginx correspondente está documentado em `nginx-gestor.conf.exemplo`
(referência — o arquivo em produção foi escrito pelo Gabriel).

> **Não usar o `docker-compose.caddy.yml` neste VPS.** Ele sobe um Caddy que
> tenta tomar 80/443 e conflitaria com o nginx. Aquele arquivo serve só para
> um servidor limpo, sem proxy próprio.

---

## Ligar a camada de IA

Hoje a IA está desligada porque `GEMINI_API_KEY` está vazia no servidor.
**Preencher essa variável é o único passo** — o resto já está pronto:

- o SDK (`google-genai`) já está no `requirements.txt`, então já foi instalado;
- `GEMINI_ENABLED` já é `True` por padrão no `config.py`;
- o modelo `gemini-flash-lite-latest` foi testado ao vivo em 14/08/2026 e
  respondeu em **~2,8s** (dentro do timeout de 8s), com resumo executivo,
  cenário extra, insight e aviso de risco preenchidos.

Nada no frontend muda: a URL é a mesma, então **não é preciso regerar nem
redistribuir a extensão** quando a IA for ligada.

### 🔒 Regra de segredo (vale sempre)

A chave é colada **no editor do servidor** (`nano`, ou o terminal do hPanel).
Nunca num chat — nem com o Claude, nem em grupo de mensagem. O `.env` fica só
no VPS e está no `.gitignore`.

### Se o backend roda via Docker (este `docker-compose.yml`)

```bash
cd NexGestor/deploy
nano .env                       # preencha GEMINI_API_KEY=
docker compose up -d            # relê o .env e recria o container
```

### Se o backend roda direto (uvicorn/systemd, sem Docker)

```bash
nano <pasta-do-backend>/.env    # preencha GEMINI_API_KEY=
systemctl restart <nome-do-servico>
```

> ⚠️ **Armadilha real, confirmada por teste.** O `config.py` declara
> `env_file=".env"` — caminho **relativo ao diretório de trabalho do
> processo**, não à pasta do código. Se o serviço não roda com
> `WorkingDirectory` na pasta do backend, o `.env` é **ignorado em silêncio**:
> a API sobe normal, responde 200, e a IA simplesmente não liga. Nenhum erro
> aparece em lugar nenhum.
>
> Medido aqui, mesmo código e mesmo `.env`, só mudando o diretório:
>
> | Diretório do processo | Chave carregada |
> |---|---|
> | pasta do backend | ✅ sim |
> | qualquer outro | ❌ não |
>
> **À prova disso:** passar a variável pelo próprio systemd, que não depende de
> diretório nenhum —
>
> ```ini
> [Service]
> WorkingDirectory=/caminho/do/backend
> EnvironmentFile=/caminho/do/backend/.env
> ```
>
> Depois: `systemctl daemon-reload && systemctl restart <servico>`.
>
> O modo Docker **não** tem esse problema: o `env_file:` do compose injeta as
> variáveis no ambiente do container, sem depender de diretório.

Se ainda não existir um `.env` no servidor, use o `deploy/.env.example` como
base — ele já vem com `GEMINI_MODEL`, `GEMINI_ENABLED` e o timeout corretos.

> **Reiniciar é obrigatório.** As configurações são lidas uma vez, na subida
> do processo. Editar o `.env` sem reiniciar não muda nada.

### Confirmar que ligou

De qualquer máquina:

```bash
curl -s --max-time 30 -X POST https://gestor.nexgold.com.br/api/v1/campaign/analyze \
  -H 'Content-Type: application/json' \
  -d '{"campaign":{"id":1,"name":"teste"},
       "metrics":{"spend":3200,"impressions":120000,"link_clicks":1900,
                  "conversions":78,"cpa":41,"roas":4.2,"frequency":1.6},
       "targets":{"max_cpa":60,"min_roas":3}}' \
  | python3 -c 'import sys,json
d=json.load(sys.stdin)
if "overall_score" not in d: raise SystemExit(f"RESPOSTA INVALIDA (nao eh uma analise): {str(d)[:200]}")
print("IA LIGADA" if d.get("ai_insights") else "IA DESLIGADA")'
```

Se responder **IA LIGADA**, está funcionando de verdade — `ai_insights` só vem
preenchido quando o Gemini respondeu de fato.

> **Por que a checagem do `overall_score` está aí.** Sem ela o comando responde
> "IA DESLIGADA" para *qualquer* resposta que não seja uma análise — um 422 por
> payload malformado, um 500, um 429 de limite de requisições. Ou seja: daria
> um diagnóstico errado, mandando você caçar problema na chave do Gemini quando
> o problema é outro. Testado nos três casos (análise ok, erro 422, servidor
> inalcançável).

### Se a chave estiver preenchida e mesmo assim vier `null`

A IA falha **em silêncio, de propósito**: se o Gemini não responde, a análise
continua sendo entregue sem a camada de IA, em vez de derrubar a requisição.
Então o diagnóstico está nos logs do servidor:

```bash
docker compose logs --tail=50 api        # ou: journalctl -u <servico> -n 50
```

Causas em ordem de probabilidade:

1. **Chave revogada ou inválida** → `401 UNAUTHENTICATED`. Já aconteceu duas
   vezes neste projeto.
2. **Limite de gasto atingido** — a chave tem teto de **R$15**, dividido pela
   equipe inteira.
3. **Modelo aposentado** → `404 ... no longer available`. O Google faz isso sem
   aviso; foi o que derrubou `gemini-2.5-flash` e `gemini-flash-latest`.
4. **Reinício esquecido** depois de editar o `.env`.

As chaves nunca aparecem nos logs em texto puro — são redigidas antes de
qualquer escrita.

---

## Atenção: a API é pública e não tem autenticação

Qualquer pessoa que descubra a URL pode chamar a análise (confirmado em
14/08/2026: chamadas seguidas sem `Origin`, todas 200, sem rate limit).

Com a IA **desligada**, o custo de abuso é só CPU. Com a IA **ligada**, cada
chamada de terceiros consome a chave compartilhada de R$15. Vale subir um
limite de requisições junto com a chave — há um `limit_req` pronto e comentado
em `nginx-gestor.conf.exemplo`.

---

## Manutenção do dia a dia

| Ação | Comando (em `NexGestor/deploy`) |
|---|---|
| Ver logs | `docker compose logs -f` |
| Reiniciar | `docker compose restart` |
| Atualizar após mudança no código | `git pull && docker compose up -d --build` |
| Parar | `docker compose down` |
| Ligar/trocar a chave do Gemini | `nano .env` → `docker compose up -d` |

`restart: unless-stopped` faz o backend voltar sozinho se o VPS reiniciar.

---

## Gerar o pacote da equipe

No **seu computador** (não no VPS), na pasta do projeto:

```bash
frontend/nexgestor-extension/build-team.sh https://gestor.nexgold.com.br
```

Produz:

- `frontend/nexgestor-extension/nexgestor-extensao-<data>.zip` → é isso que vai
  pra equipe, junto do `COMO-USAR.md` da raiz;
- a pasta `extensao-pronta/` atualizada.

A URL precisa ser `https://` — o script recusa `http://` remoto de propósito,
porque o Chrome bloqueia essas chamadas e a extensão falharia sem mensagem
clara.

Rode de novo e redistribua sempre que mexer no frontend. **Ligar a IA não
exige isso** — é configuração de servidor, a URL não muda.

---

## Anexo — montar do zero num servidor sem proxy

Só para um VPS limpo, onde 80/443 estejam livres. O Caddy vira a porta de
entrada e emite o certificado sozinho.

```bash
curl -fsSL https://get.docker.com | sh          # instala Docker
git clone <repo> && cd NexGestor/deploy
cp .env.example .env && nano .env               # DOMAIN + GEMINI_API_KEY
docker compose -f docker-compose.caddy.yml up -d --build
```

Requisitos: registro A do domínio já apontando pro IP **antes** de subir (o
Let's Encrypt não emite certificado para nome que não resolve), e portas 80 e
443 liberadas no firewall do hPanel.
