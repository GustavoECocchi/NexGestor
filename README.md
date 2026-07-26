# NexGestor

Copiloto de diagnóstico para tráfego pago (Meta Ads / Google Ads). Recebe as
métricas de uma campanha e devolve diagnóstico com causa raiz, score de saúde e
ação executável — combinando um engine de regras determinístico com uma camada
opcional de IA.

O repositório é um monorepo:

```
backend/backend-nexgestor-main/    API FastAPI — engine de análise + integração Gemini
frontend/nexgestor-extension/      Extensão Chrome (side panel) — Plasmo + React + TypeScript
```

---

## Rodando na sua máquina

Você precisa das duas partes no ar: o backend serve a análise, a extensão é a
interface. Comece pelo backend.

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

> A extensão aponta para `http://localhost:8000` por padrão. Para usar outro
> endereço, defina `PLASMO_PUBLIC_API_BASE` no `.env` do frontend e rode o build
> de novo.

---

## Configurando a chave da IA

A IA é **opcional**: sem chave configurada, o engine de regras funciona
normalmente e o campo `ai_insights` da resposta vem `null`. Nada quebra.

Para ligá-la, cada pessoa usa a **própria chave**, gerada no
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
# Backend — 109 testes
cd backend/backend-nexgestor-main && pytest

# Frontend — 99 testes
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
- **Não há persistência no servidor.** O backend é *stateless*; tudo que
  "sobrevive" está no `localStorage` do navegador. Limpar os dados do navegador
  apaga as campanhas, e não há sincronização entre dispositivos.
