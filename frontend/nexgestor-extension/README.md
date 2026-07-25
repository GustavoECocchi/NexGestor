# NexGestor — Extensão (Side Panel)

Copiloto de diagnóstico inteligente para tráfego pago (Meta Ads / Google Ads),
construído como extensão Chrome em **Plasmo + React + TypeScript**.

A UI abre em um **side panel** ao lado da aba ativa (ex: Meta Ads Manager):
feed de campanhas com resumo executivo, detalhe com score de saúde, oportunidade
detectada, diagnóstico por cenário, ações prioritárias, sugestões e copiloto.

> Estado atual: modo manual já plugado no backend FastAPI real (`lib/api.ts` →
> `lib/adapt.ts`). `data/mock.ts` continua presente como 2 campanhas de
> exemplo, marcadas visualmente como "exemplo" ao lado das campanhas vivas
> analisadas pelo usuário. Coleta automática (scraping do Ads Manager) é
> provisória — ver `CLAUDE.md` na raiz do monorepo pro estado real e
> detalhado de cada frente.

## Estrutura

```
sidepanel.tsx          entrada do painel (renderiza <App/>)
background.ts          abre o painel ao clicar no ícone
style.css              design system (variáveis + classes + Tailwind)
types.ts               tipos que espelham app/schema/schema.py
lib/                   format, status (mapas de cor), api (stub do /analyze)
data/mock.ts           campanhas mockadas (view-model)
components/            App, Home, CampaignCard, CampaignDetail, modais, etc.
```

## Rodar em desenvolvimento

Requer Node 18+.

```bash
npm install        # ou pnpm install
npm run dev        # gera build/chrome-mv3-dev com hot-reload
```

Carregar no Brave/Chrome:

1. Acesse `brave://extensions` (ou `chrome://extensions`)
2. Ative o **Modo de desenvolvedor**
3. **Carregar sem compactação** → selecione a pasta `build/chrome-mv3-dev`
4. Clique no ícone do NexGestor na barra → o **painel lateral** abre

## Testes

```bash
npm test           # roda a suíte uma vez (Vitest)
npm run test:watch # modo watch
```

Vitest + `@testing-library/react`, ambiente jsdom. Cobre a lógica pura de
`lib/` (adapter backend→VM, sanitizador de HTML/XSS, store em localStorage,
hook de tema) e as funções de roteamento/parsing exportadas de dentro dos
componentes (`Copilot.buildReply`, `NewCampaignModal.parseFileJSON`), além
de um teste de regressão de `Summary.tsx` garantindo que o dinheiro das
campanhas de exemplo nunca entra nos totais financeiros. Alias `~*` do
Plasmo é resolvido via `vitest.config.ts`; imports de imagem (`~assets/*`)
são mockados em `test/__mocks__/asset.ts`.

## Build de produção

```bash
npm run build      # build/chrome-mv3-prod
npm run package    # gera o .zip para a Web Store
```

## Conectar ao backend (próximo passo — Fase E)

1. Copie `.env.example` para `.env` e ajuste `PLASMO_PUBLIC_API_BASE`.
2. Em `lib/api.ts`, `analyzeCampaign(input)` já faz `POST /campaign/analyze`.
3. Mapeie o `CampaignAnalysisResponse` retornado para o `CampaignVM` que a UI
   consome (ver comentários em `types.ts` e `data/mock.ts`), substituindo o mock.
4. A "coleta automática" (botão *Analisar página atual*) deve disparar um content
   script lendo o DOM do Ads Manager **ou** a Meta Marketing API via OAuth.
