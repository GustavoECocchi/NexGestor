# NexGestor

Copiloto de diagnóstico para tráfego pago (Meta Ads / Google Ads / TikTok Ads /
LinkedIn Ads). Recebe as métricas de uma campanha e devolve diagnóstico com
causa raiz, score de saúde e ação executável — combinando um engine de regras
determinístico com uma camada opcional de IA.

O repositório é um monorepo:

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise + integração Gemini
frontend/nexgestor-extension/      Extensão Chrome (side panel) — Plasmo + React + TypeScript
extensao-pronta/                   Extensão já compilada — carregue esta se só quer testar
deploy/                            Deploy do backend no VPS (Docker + HTTPS automático)
iniciar-backend.bat / .sh          Sobe o backend local — só para DESENVOLVIMENTO
```

---

## Caminho rápido — só usar a ferramenta

> 👉 **Vai apenas usar o NexGestor, sem mexer no código?**
> Siga o **[COMO-USAR.md](COMO-USAR.md)** — passo a passo, sem jargão, com a
> seção de problemas comuns.

O backend roda **num servidor compartilhado** (VPS), então quem só vai usar a
ferramenta **não instala nada além da extensão**: sem Python, sem Node, sem
deixar janela aberta. Basta um navegador Chromium (Chrome, Brave, Edge) e
internet.

1. Receber o `.zip` da extensão do time e **extrair** numa pasta fixa.
2. Abrir `chrome://extensions`, ativar o **Modo do desenvolvedor** e clicar em
   **Carregar sem compactação**, escolhendo a pasta extraída.
3. Abrir o side panel e clicar em **Nova campanha**. A análise é real.

Quem tiver o repositório em mãos pode carregar a pasta `extensao-pronta/` no
lugar do zip — é o mesmo build.

> **Gerando o pacote da equipe** (quem mantém o projeto): com o backend já no ar,
> rode `frontend/nexgestor-extension/build-team.sh https://SUA-URL` — ele grava a
> URL no build, gera o `.zip` e atualiza a `extensao-pronta/`.
> Para subir o backend, veja **[deploy/README.md](deploy/README.md)**.

---

## Rodando na sua máquina (desenvolvimento)

Use este caminho se for **alterar o código**. Você precisa das duas partes no
ar: o backend serve a análise, a extensão é a interface. Comece pelo backend.

### Pré-requisitos

- **Python 3.11+** (desenvolvido em 3.14)
- **Node.js 18+** e npm
- Um navegador baseado em Chromium (Chrome, Brave, Edge, Chromium)

### 1. Backend

```bash
cd backend/backend-nexgestor-main

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # veja "Configurando a chave da IA" abaixo

python -m uvicorn app.main:app --reload --port 8000
```

Confira em <http://localhost:8000> — deve responder `{"status":"ok"}`.
A documentação interativa da API fica em <http://localhost:8000/docs>.

### 2. Extensão

```bash
cd frontend/nexgestor-extension

npm install
npm run build                    # ou `npm run dev` para recarregar a cada alteração
```

Depois carregue a extensão no navegador (passo manual, uma vez só):

1. Abra `chrome://extensions` (ou `brave://extensions`).
2. Ative o **Modo do desenvolvedor** no canto superior direito.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `frontend/nexgestor-extension/build/chrome-mv3-prod`.

Abra o side panel da extensão e clique em **Nova campanha**. Com o backend no ar,
a análise é feita de verdade — não é mock.

> **`chrome-mv3-prod` e não `chrome-mv3-dev`.** O `npm run dev` gera a pasta
> `chrome-mv3-dev`, que depende do servidor do Plasmo rodando e quebra quando
> você fecha o terminal. Para uso normal, carregue sempre a `chrome-mv3-prod`,
> gerada pelo `npm run build`.

> A extensão aponta para `http://localhost:8000` por padrão. Para usar outro
> endereço, defina `PLASMO_PUBLIC_API_BASE` no `.env` do frontend e rode o build
> de novo.

### Gerando o pacote da equipe (e atualizando a `extensao-pronta/`)

A pasta `extensao-pronta/` é uma **cópia versionada** do build de produção, para
quem prefere carregá-la direto do repositório em vez do zip. Ela **não se
atualiza sozinha** — depois de mexer no frontend, regenere-a, senão a equipe
continua na versão antiga.

Use sempre o script, passando a URL do backend em produção:

```bash
frontend/nexgestor-extension/build-team.sh https://SUA-URL-DO-BACKEND
```

Ele grava a URL no build, gera o `.zip` para distribuir e reescreve a
`extensao-pronta/` com o mesmo build.

> ⚠️ **Não** regenere a pasta com um `npm run build` cru: sem a URL de produção
> o build aponta para `http://localhost:8000` e a extensão falha na máquina de
> quem não roda o backend local — sem mensagem de erro clara.

---

## Configurando a chave da IA

A IA é **opcional**: sem chave configurada, o engine de regras funciona
normalmente e o campo `ai_insights` da resposta vem `null`. Nada quebra.

**Em produção (servidor compartilhado):** a chave é **uma só**, no `.env` do
VPS — quem usa a extensão não configura nada. O limite de gasto da chave é
dividido por toda a equipe. Ver [deploy/README.md](deploy/README.md).

**Em desenvolvimento local:** use a **sua própria** chave, gerada no
[Google AI Studio](https://aistudio.google.com/apikey), preenchendo
`GEMINI_API_KEY` no `.env` do backend.

> ### ⚠️ Regras da chave — leia antes de configurar
>
> - O `.env` está no `.gitignore` e **nunca** deve ser commitado.
> - Edite o `.env` **num editor de texto normal**. Não cole a chave em terminal
>   compartilhado, chat, issue, print de tela ou ferramenta de IA — qualquer um
>   desses caminhos deve fazer você considerar a chave queimada e rotacioná-la.
> - Restrinja a chave à *Generative Language API* no Google Cloud Console e
>   defina um limite de gasto.
>
> Este projeto já teve chaves expostas por descuido; por isso as regras acima
> são explícitas em vez de subentendidas.

Modelo em uso: `gemini-flash-lite-latest`. Modelos mais antigos como
`gemini-2.5-flash` retornam 404 para chaves novas.

---

## Testes

```bash
# Backend — 1354 testes
cd backend/backend-nexgestor-main && pytest

# Frontend — 167 testes
cd frontend/nexgestor-extension && npm test
```

A suíte do backend **não faz chamadas de rede**: o `conftest.py` desliga a IA
durante os testes. Isso é proposital — sem ele, cada `pytest` consumiria cota
paga da API do Gemini. Se você escrever um teste que exercita a IA, mocke-a
explicitamente (há exemplos em `test_ai_integration.py`).

---

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `COMO-USAR.md` (raiz) | Guia da equipe — instalar a extensão e usar o **backend compartilhado** (sem instalar nada) |
| `deploy/README.md` | Runbook do **backend compartilhado no VPS** (Docker + HTTPS automático) |
| `CLAUDE.md` (raiz) | Estado do projeto, decisões de arquitetura e histórico das sessões |
| `backend/.../CONTRATO_API_FRONTEND.md` | Contrato completo da API — payloads de entrada e resposta |
| `backend/.../AUDITORIA.md` | Auditoria de segurança e qualidade do backend |
| `frontend/.../README.md` | Detalhes da extensão (estrutura, componentes, testes) |

---

## Estado atual

Em período de testes internos. Dois pontos que a equipe deve conhecer antes de
avaliar o produto:

- **A coleta automática é provisória.** Ela faz *scraping* do DOM do Ads Manager
  e quebra sem aviso quando a Meta muda a página. Nunca foi validada contra uma
  conta real. Será substituída pela Meta Marketing API (OAuth) antes do
  lançamento.
- **A base de campanhas é COMPARTILHADA e isso é temporário.** Desde 14/08/2026
  o servidor guarda as campanhas analisadas (SQLite), mas **sem login e sem
  dono**: toda a equipe vê — e pode apagar — as campanhas de todo mundo. Foi
  uma decisão consciente para o período de testes, em que ver o diagnóstico do
  colega ajuda. **Antes de abrir para usuários reais isto precisa virar dado por
  pessoa**; o caminho de migração está documentado em
  `backend/backend-nexgestor-main/app/service/storage.py`. Não guardar nada
  sensível ali enquanto for assim.
- **Sem persistência, a extensão continua funcionando.** Se o servidor estiver
  fora do ar ou com `DB_PATH` vazio, ela volta a usar só o `localStorage` do
  navegador — nenhuma campanha some por causa disso.
