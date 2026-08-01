#!/usr/bin/env bash
# NexGestor — sobe o backend (Linux / macOS).
# Equivalente ao iniciar-backend.bat usado no Windows.
set -euo pipefail

cd "$(dirname "$0")/backend/backend-nexgestor-main"

echo "=========================================="
echo "   NexGestor - iniciando o backend"
echo "=========================================="
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "[ERRO] Python 3 nao encontrado. Instale o Python 3.11 ou superior."
  exit 1
fi

if [ ! -d ".venv" ]; then
  echo "Criando ambiente virtual (so na primeira vez, demora um pouco)..."
  python3 -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "Conferindo dependencias..."
python -m pip install --disable-pip-version-check -q -r requirements.txt

if [ ! -f ".env" ]; then
  echo "Criando .env a partir do .env.example (IA desligada)..."
  cp .env.example .env
fi

echo
echo "=========================================="
echo "   Backend no ar: http://localhost:8000"
echo
echo "   DEIXE ESTE TERMINAL ABERTO enquanto"
echo "   usar a extensao. Para parar: Ctrl+C."
echo "=========================================="
echo

exec python -m uvicorn app.main:app --port 8000
