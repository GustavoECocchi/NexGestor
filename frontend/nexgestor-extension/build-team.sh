#!/usr/bin/env bash
#
# NexGestor — Gera o pacote da extensão para a equipe instalar.
#
# Uso:
#   ./build-team.sh https://api.seudominio.com.br
#   ./build-team.sh https://72.60.1.23.nip.io
#
# O que faz:
#   1. Grava a URL do backend na variável que a extensão usa (.env.production).
#   2. Roda o build de produção do Plasmo.
#   3. Empacota tudo num .zip pronto pra enviar pra equipe.
#
# A URL do backend NÃO é segredo (é só o endereço público da API), então pode
# passar direto no comando.

set -euo pipefail

# ── 1) Valida o argumento ────────────────────────────────
if [ $# -lt 1 ]; then
  echo "❌ Falta a URL do backend."
  echo "   Uso: ./build-team.sh https://api.seudominio.com.br"
  exit 1
fi

API_URL="${1%/}"   # remove barra final, se houver

if [[ ! "$API_URL" =~ ^https?:// ]]; then
  echo "❌ A URL precisa começar com http:// ou https:// — recebi: $API_URL"
  exit 1
fi

# ⚠️ Armadilha real: o painel da extensão é um "contexto seguro". O Chrome
# BLOQUEIA chamadas http:// para hosts que não sejam localhost (mixed content),
# e a falha é silenciosa — a extensão parece quebrada sem dizer por quê.
if [[ "$API_URL" =~ ^http:// ]] && [[ ! "$API_URL" =~ ^http://(localhost|127\.0\.0\.1) ]]; then
  echo "❌ URL http:// (sem S) num host remoto: $API_URL"
  echo "   O Chrome vai BLOQUEAR essas chamadas e a extensão não vai funcionar."
  echo "   Use https:// — o deploy do VPS (deploy/README.md) já entrega HTTPS."
  exit 1
fi

cd "$(dirname "$0")"

# ── Pré-requisitos ───────────────────────────────────────
if ! command -v zip >/dev/null 2>&1; then
  echo "❌ O utilitário 'zip' não está instalado."
  echo "   Fedora: sudo dnf install zip   |   Ubuntu/Debian: sudo apt install zip"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "▶ node_modules ausente — rodando npm install..."
  npm install
fi

echo "▶ Backend configurado: $API_URL"

# ── 1b) O host precisa estar em host_permissions ─────────
# Sem a URL declarada ali, o painel fica sujeito a CORS normal. Respostas
# geradas pelo BACKEND continuam funcionando (ele manda os cabeçalhos), mas
# tudo que o proxy responde sozinho — 429 do limite, 502 de backend fora do ar
# — vem sem CORS e é bloqueado pelo Chrome ANTES do código ler o status. A
# extensão então mostra "não foi possível falar com o servidor" em vez da causa
# real. Não quebra o uso normal, mas degrada o diagnóstico; por isso avisa.
API_HOST="$(printf '%s' "$API_URL" | sed -E 's#^https?://##; s#[:/].*$##')"
if ! grep -q "$API_HOST" package.json; then
  echo ""
  echo "⚠️  '$API_HOST' NÃO está em host_permissions (package.json)."
  echo "    O build funciona, mas erros gerados pelo proxy (429 de limite, 502"
  echo "    de servidor fora do ar) chegarão como 'Failed to fetch' e a extensão"
  echo "    não conseguirá explicar a causa certa ao usuário."
  echo "    Para corrigir, acrescente em package.json → manifest.host_permissions:"
  echo "        \"https://$API_HOST/*\""
  echo ""
fi

# ── 2) Grava a variável de ambiente do build ─────────────
echo "PLASMO_PUBLIC_API_BASE=$API_URL" > .env.production
echo "▶ .env.production gravado."

# ── 3) Build de produção ─────────────────────────────────
echo "▶ Buildando (plasmo build)..."
npm run build

BUILD_DIR="build/chrome-mv3-prod"
if [ ! -d "$BUILD_DIR" ]; then
  echo "❌ Build não encontrado em $BUILD_DIR — algo falhou acima."
  exit 1
fi

# ── 4) Empacota o .zip ───────────────────────────────────
STAMP="$(date +%Y%m%d)"
ZIP="nexgestor-extensao-$STAMP.zip"
rm -f "$ZIP"
( cd "$BUILD_DIR" && zip -qr "../../$ZIP" . )

# ── 5) Atualiza a cópia versionada em extensao-pronta/ ───
# Ela existe no repositório para quem prefere pegar a extensão de lá em vez do
# zip. Se não fosse regenerada aqui, continuaria apontando para o backend ANTIGO
# e falharia silenciosamente — por isso é sempre reescrita junto.
REPO_ROOT="../.."
if [ -d "$REPO_ROOT/extensao-pronta" ]; then
  rm -rf "$REPO_ROOT/extensao-pronta"
  cp -r "$BUILD_DIR" "$REPO_ROOT/extensao-pronta"
  echo "▶ extensao-pronta/ atualizada (aponta pro mesmo backend)."
fi

echo ""
echo "✅ Pronto!"
echo "   Pacote da equipe: frontend/nexgestor-extension/$ZIP"
echo "   Backend embutido: $API_URL"
echo ""
echo "   Envie esse .zip + o guia COMO-USAR.md pra equipe."
