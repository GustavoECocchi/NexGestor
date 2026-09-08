# NexGestor

Copiloto de diagnóstico para tráfego pago: backend FastAPI com engine de
regras e Gemini opcional, mais dashboard Vite + React + TypeScript.

## Comece aqui

- [Como usar](COMO-USAR.md): fluxo do usuário.
- [Mapa da documentação](docs/README.md): onde encontrar regras, requisitos e evidências.
- [Roadmap](docs/roadmap.md): estados e pendências, com limites da verificação externa.
- Agentes: leia [AGENTS.md](AGENTS.md) e [CLAUDE.md](CLAUDE.md).

## Estrutura ativa

```text
backend/backend-nexgestor-main/  API, engine, integração Gemini e SQLite opcional
frontend/nexgestor-dashboard/    Dashboard web
deploy/                         Configurações e runbook do backend no VPS
docs/prds/                      Requisitos por frente
docs/sessions/                  Evidências e continuidade
```

A extensão Chrome foi descontinuada e removida do checkout em `01bfe1f`.
Sua documentação está em [histórico](docs/historico/nexgestor-extensao.md).

## Desenvolvimento local

Requisitos: Python 3.11+ (desenvolvimento registrado em 3.14), npm e Node
compatível com o Vite instalado. Vite 8.2.2 exige `^20.19.0 || >=22.12.0`
(conferido no pacote local). Use dois terminais.

Backend, a partir da raiz:

```powershell
cd backend/backend-nexgestor-main
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# Se .env não existir, copie .env.example para .env; preserve configuração existente.
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Dashboard, em outro terminal a partir da raiz:

```powershell
cd frontend/nexgestor-dashboard
npm ci
$env:VITE_API_BASE = 'http://127.0.0.1:8000'
npm run dev -- --host 127.0.0.1 --port 5173
```

Abra o endereço mostrado pelo Vite, normalmente <http://127.0.0.1:5173/>.
A variável pode também ficar no `.env` local do dashboard. Não é necessário
criar esse arquivo quando a variável já foi passada ao processo.

O engine funciona sem Gemini. Configure `GEMINI_API_KEY` somente no `.env`
do backend, em editor externo; nunca cole segredos em chat ou versionamento.
Com `DB_PATH` vazio, campanhas ficam no navegador; com banco habilitado,
as rotas usam `X-Nex-Dono`. Esse identificador **não é autenticação**.
Consulte <http://127.0.0.1:8000/api/v1/status> para capacidades da instância.

## Validação

```powershell
# No diretório do backend (UTF-8 evita falha ambiental de leitura no Windows):
python -X utf8 -m pytest -q

# No diretório do dashboard:
npm test
npx tsc -b
npm run lint
```

O build de produção (`npm run build`) exige `VITE_API_BASE` apontando ao
backend de destino; a configuração rejeita localhost nesse modo. Resultados
reais dos testes são registrados nas sessões, sem contagens duplicadas aqui.
A suíte do backend desliga IA por padrão em `conftest.py`.

## Distribuição

Configurações do backend: [deploy/README.md](deploy/README.md). Não confundir
código local com versão implantada: o último registro aponta VPS atrasado e
dashboard sem distribuição; confirme o ambiente antes de atualizar.
Coleta automática/OAuth segue adiada. O dashboard usa entrada manual ou JSON.
