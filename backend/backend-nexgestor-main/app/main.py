"""
NexGestor — Entry point da aplicação FastAPI.

Este arquivo monta a aplicação, configura CORS e registra as rotas.
Para subir o servidor em dev: `uvicorn app.main:app --reload`
"""
import math

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes import routes, campanhas_salvas, status
from app.core.config import settings


def _docs_urls(debug: bool) -> dict:
    """
    Auditoria de rede (2026-09-03), achado A6: `/docs`, `/redoc` e
    `/openapi.json` respondiam 200 mesmo sem `docs_url` explícito — é o
    default do FastAPI. Hoje isso fica mascarado porque o nginx do VPS serve
    conteúdo estático na raiz (só `/api/*` chega ao backend) — mas o
    dashboard vai ocupar esse mesmo slot (ver docs/roadmap.md, item 10), e a
    própria referência de nginx do repo avisa que trocar o `location /` sem
    restringir ao prefixo da API publicaria isso.
    Extraída em função pura para o teste não depender de reconstruir o `app`
    com settings diferentes — só chama isto duas vezes.
    """
    if debug:
        return {"docs_url": "/docs", "redoc_url": "/redoc", "openapi_url": "/openapi.json"}
    return {"docs_url": None, "redoc_url": None, "openapi_url": None}


# Instância principal do FastAPI — /docs, /redoc e /openapi.json só existem
# com DEBUG=True (default é False — ver app/core/config.py).
app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "NexGestor — Decision Engine para Tráfego Pago.\n\n"
        "Analisa métricas de campanhas Meta Ads/Google Ads, detecta cenários "
        "de performance e gera diagnósticos com causa raiz e ação executável. "
        "Combina engine de regras determinístico com camada de IA (Gemini)."
    ),
    version="1.0.0",
    **_docs_urls(settings.DEBUG),
)

# CORS — origens permitidas vêm do .env (CORS_ORIGINS) para facilitar
# trocar dev/staging/produção sem mexer em código.
#
# allow_origins        → lista explícita (localhost de dev, domínios de produção)
# allow_origin_regex   → casa chrome-extension://<id> sem precisar fixar o ID
#                        (o ID muda entre extensão unpacked e publicada)
# Uma origin é aceita se bater na LISTA *ou* no REGEX. Não usamos ["*"]
# porque é inválido em conjunto com allow_credentials=True.
_cors_kwargs = {
    "allow_origins": settings.CORS_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
# Só passa o regex se ele estiver preenchido (string vazia desliga o recurso).
if settings.CORS_ORIGIN_REGEX:
    _cors_kwargs["allow_origin_regex"] = settings.CORS_ORIGIN_REGEX

app.add_middleware(CORSMiddleware, **_cors_kwargs)


def _json_safe(obj):
    """
    Substitui floats não-finitos por texto antes de serializar.

    O handler padrão do FastAPI devolve, dentro do 422, o valor que o cliente
    mandou (`{"input": ...}`). Se esse valor for NaN ou -Infinity — literais que
    o parser JSON do Python aceita —, o `json.dumps` da resposta estoura
    `ValueError: Out of range float values are not JSON compliant`. O erro
    acontece DEPOIS do handler, na renderização, então nada o captura: o cliente
    recebe 500 sem corpo em vez do 422 que explica o campo errado.
    """
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else repr(obj)
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """422 com detalhe legível, à prova de valores não serializáveis no input."""
    return JSONResponse(
        status_code=422,
        content={"detail": _json_safe(jsonable_encoder(exc.errors()))},
    )


@app.get("/", tags=["Health"], summary="Health check")
def health_check():
    """Endpoint público para verificar se a aplicação está no ar."""
    return {"status": "ok", "app": settings.APP_NAME}


# Registra as rotas do módulo `campaign` sob o prefixo /api/v1.
app.include_router(routes.router, prefix=settings.API_V1_STR)

# Persistência das campanhas (base COMPARTILHADA — temporária, ver storage.py).
app.include_router(campanhas_salvas.router, prefix=settings.API_V1_STR)

# Estado das capacidades opcionais (IA, persistência) — lido pelo dashboard.
app.include_router(status.router, prefix=settings.API_V1_STR)
