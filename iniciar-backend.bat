@echo off
chcp 65001 >nul
title NexGestor - Backend
cd /d "%~dp0backend\backend-nexgestor-main"

echo ==========================================
echo    NexGestor - iniciando o backend
echo ==========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Python nao encontrado.
  echo.
  echo Instale o Python 3.11 ou superior em:
  echo    https://www.python.org/downloads/
  echo.
  echo IMPORTANTE: marque "Add Python to PATH" durante a instalacao,
  echo feche esta janela e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist ".venv" (
  echo Criando ambiente virtual ^(so na primeira vez, demora um pouco^)...
  python -m venv .venv
  if errorlevel 1 goto erro
)

call ".venv\Scripts\activate.bat"

echo Conferindo dependencias...
python -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 goto erro

if not exist ".env" (
  echo Criando .env a partir do .env.example ^(IA desligada^)...
  copy ".env.example" ".env" >nul
)

echo.
echo ==========================================
echo    Backend no ar: http://localhost:8000
echo.
echo    DEIXE ESTA JANELA ABERTA enquanto usar
echo    a extensao. Para parar: Ctrl+C.
echo ==========================================
echo.

python -m uvicorn app.main:app --port 8000
goto fim

:erro
echo.
echo [ERRO] Alguma etapa acima falhou. Copie a mensagem inteira
echo        desta janela e envie para o time.

:fim
echo.
pause
