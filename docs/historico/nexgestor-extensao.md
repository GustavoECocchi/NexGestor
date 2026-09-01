# NexGestor — Extensão Chrome (histórico)

> ⚠️ **Descontinuada em 2026-08-24.** O produto ativo é o **dashboard web**
> (`frontend/nexgestor-dashboard`). Este documento existe só como registro de
> como a extensão funcionava — não é mais um guia de uso corrente. Estado
> atual da decisão: `docs/roadmap.md` itens 3 e 4. Histórico completo de
> desenvolvimento, sessão a sessão: `docs/sessions/2026-07-24.md` até
> `docs/sessions/2026-08-14.md`.
>
> O código (`frontend/nexgestor-extension/`) e o build pré-compilado
> (`extensao-pronta/`) continuam no repositório, congelados — nada aqui
> autoriza apagá-los.

## Por que foi descontinuada

Decisão do usuário em 2026-08-24, motivada por feedback externo (professor):
o modelo de side panel de extensão limitava a experiência. O produto migrou
para um dashboard web full-screen, que reaproveita a maior parte da lógica
da extensão por cópia (`types.ts`, `lib/`, componentes).

## O que era — visão do usuário (conteúdo do antigo `COMO-USAR.md`)

A extensão era instalada como um `.zip` distribuído pela equipe:

1. **Extrair o zip** numa pasta fixa (a extensão "morava" ali — mover ou
   apagar a pasta quebrava a instalação).
2. **Instalar no navegador**: `chrome://extensions` (ou `brave://`/`edge://`)
   → Modo do desenvolvedor → Carregar sem compactação → selecionar a pasta
   extraída (sem entrar nela).
3. **Fixar o ícone** na barra do navegador.
4. **Usar**: clicar no ícone abria o painel lateral; "Nova campanha" →
   preencher métricas → "Analisar campanha".

Três formas de inserir uma campanha existiam: **manual** (recomendado, mais
confiável), **importar arquivo** (`.json`, bom para testar vários casos) e
**coletar automático** (experimental — scraping do Gerenciador de Anúncios,
nunca validado contra uma conta real).

### Modelo de dados — base compartilhada (válido até a descontinuação)

Enquanto ativa, as campanhas analisadas ficavam guardadas no servidor numa
**base única, sem login**: toda a equipe via e podia apagar as campanhas de
todo mundo. Era uma decisão consciente pro período de testes (ver o
diagnóstico do colega ajudava). Se o servidor estivesse fora do ar, a
extensão continuava funcionando com o `localStorage` do navegador — os dados
subiam sozinhos quando o servidor voltasse.

### Problemas comuns registrados na época

| O que aparecia | O que fazer |
|---|---|
| "Manifest file is missing or unreadable" | Pasta errada ao carregar — selecionar a pasta extraída sem entrar nela |
| "Não foi possível falar com o servidor" | Limite de requisições do servidor (todo o escritório saía pelo mesmo IP) |
| "O servidor está fora do ar" | Backend precisava ser religado por quem cuidava dele |
| Painel não abria ao clicar no ícone | Recarregar a extensão em `chrome://extensions` |
| Extensão sumiu do navegador | Pasta extraída foi movida/apagada — reinstalar |

## Estrutura técnica (conteúdo do antigo `frontend/nexgestor-extension/README.md`)

Side panel, **Plasmo + React + TypeScript**, abrindo ao lado da aba ativa
(ex.: Meta Ads Manager): feed de campanhas com resumo executivo, detalhe com
score de saúde, oportunidade detectada, diagnóstico por cenário, ações
prioritárias, sugestões e copiloto.

```
sidepanel.tsx          entrada do painel (renderiza <App/>)
background.ts          abre o painel ao clicar no ícone
style.css              design system (variáveis + classes + Tailwind)
types.ts               tipos que espelham app/schema/schema.py
lib/                   format, status (mapas de cor), api (cliente do /analyze)
data/mock.ts           campanhas mockadas (view-model), 2 exemplos didáticos
components/            App, Home, CampaignCard, CampaignDetail, modais, etc.
```

**Rodar em desenvolvimento** (Node 18+): `npm install` + `npm run dev` gera
`build/chrome-mv3-dev` com hot-reload; carregar via
`chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação.

**Testes**: `npm test` (Vitest + Testing Library, jsdom) — cobria o adapter
backend→VM, o sanitizador XSS, o store em `localStorage`, o hook de tema, e
o roteamento/parsing das funções exportadas de dentro dos componentes
(`Copilot.buildReply`, `NewCampaignModal.parseFileJSON`). Suite final: 167
testes passando. Alias `~*` do Plasmo resolvido via `vitest.config.ts`;
imports de imagem mockados em `test/__mocks__/asset.ts`.

**Build de produção**: `npm run build` (→ `build/chrome-mv3-prod`) e
`npm run package` (gera o `.zip` pra Web Store/distribuição da equipe). O
script `frontend/nexgestor-extension/build-team.sh <URL>` gravava a URL do
backend em build-time (`PLASMO_PUBLIC_API_BASE`), gerava o zip da equipe e
regenerava `extensao-pronta/`.

**Conectar ao backend**: `lib/api.ts` → `analyzeCampaign(input)` fazia
`POST /campaign/analyze` real (não mock) desde o commit inicial do monorepo
— apesar de uma versão antiga deste documento ter chegado a descrever isso
como "próximo passo", a integração real já estava plugada.

## Dívidas técnicas conhecidas, no momento do congelamento

- **Coleta automática nunca validada contra um Ads Manager real** — só a
  mecânica de mensageria/manifest foi testada; migração para a Meta
  Marketing API (OAuth) ficou adiada indefinidamente junto com a extensão.
- `lib/api.ts` da extensão **não manda o header `X-Nex-Dono`** — quando o
  backend passou a exigir isolamento por dono (2026-08-24), a extensão
  parou de conseguir sincronizar campanhas salvas (sem erro visível, cai
  pro `localStorage` local).
- `.env` apontava pra `http://localhost:8000` por padrão; produção exigia
  rodar `build-team.sh` com a URL certa, nunca um `npm run build` cru.
