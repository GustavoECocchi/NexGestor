# NexGestor — Imagem do backend (FastAPI + uvicorn)
#
# Build/run acontece via docker-compose (ver ../../deploy/docker-compose.yml),
# mas a imagem é autossuficiente: `docker build -t nexgestor-api .` também funciona.
FROM python:3.12-slim

# - PYTHONDONTWRITEBYTECODE: não gera .pyc dentro do container
# - PYTHONUNBUFFERED: logs saem na hora (importante pra ver o que acontece no VPS)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Instala dependências primeiro (camada cacheada — só reinstala se requirements mudar).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código da aplicação.
COPY app ./app

# Roda como usuário sem privilégio (boa prática — se o processo for comprometido,
# não tem root dentro do container).
RUN useradd --create-home --uid 10001 appuser

# Pasta do banco (SQLite). Precisa existir na imagem E pertencer ao appuser
# ANTES do volume ser montado: quando um volume nomeado nasce vazio, o Docker
# copia o conteúdo e o DONO do diretório da imagem. Sem isto o volume nasceria
# do root, o processo (uid 10001) não conseguiria escrever, e o sintoma seria
# um 500 na primeira campanha salva — não um erro no boot.
RUN mkdir -p /dados && chown appuser:appuser /dados
VOLUME ["/dados"]

USER appuser

EXPOSE 8000

# 2 workers cobre folgado o volume de um período de testes num VPS pequeno.
# Sem --reload (isso é só pra desenvolvimento).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
