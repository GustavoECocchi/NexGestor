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
USER appuser

EXPOSE 8000

# 2 workers cobre folgado o volume de um período de testes num VPS pequeno.
# Sem --reload (isso é só pra desenvolvimento).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
