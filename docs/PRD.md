# PRD — NexGestor

> Este documento é o PRD guarda-chuva do projeto. Ainda não descreve as fases
> retroativamente (isso fica para um PR separado) — por ora reúne o índice de
> API e o índice de fases, cada uma com seu PRD pequeno em `prds/`.

## Fases

| Fase | Nome | Status | PRD |
|---|---|---|---|
| 1 | Ajuda em linguagem simples no formulário "Criar campanha" | implementado | [`prds/fase-1-ajuda-formulario-campanha.md`](prds/fase-1-ajuda-formulario-campanha.md) |
| 2 | Dashboard: telas dedicadas e navegação intuitiva | planejado | [`prds/fase-2-dashboard-intuitividade.md`](prds/fase-2-dashboard-intuitividade.md) |

## Índice de API

Referência geral de todas as rotas HTTP já existentes no backend
(`backend/backend-nexgestor-main`, prefixo base `/api/v1` definido em
`app/core/config.py`). Índice de leitura rápida — sem parâmetros, tipos ou
respostas detalhadas (ver `CONTRATO_API_FRONTEND.md` para o contrato completo).

### Campanha (`app/routes/routes.py`)

| Método | Caminho | O que faz |
|---|---|---|
| POST | `/api/v1/campaign/analyze` | Recebe métricas e metas de uma campanha e devolve o diagnóstico completo (cenários detectados, score, ação primária). |
| GET | `/api/v1/campaign/scenarios` | Lista o catálogo de cenários que o engine de diagnóstico sabe detectar. |
| GET | `/api/v1/campaign/health` | Health check interno do módulo de campanha. |

### Campanhas salvas (`app/routes/campanhas_salvas.py`)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/api/v1/campaigns` | Lista as campanhas salvas do dono identificado. |
| POST | `/api/v1/campaigns` | Salva uma campanha (cria nova ou atualiza uma existente). |
| DELETE | `/api/v1/campaigns/{campanha_id}` | Apaga uma campanha salva do dono. |

### Sistema (`app/main.py`)

| Método | Caminho | O que faz |
|---|---|---|
| GET | `/` | Health check geral da API. |
