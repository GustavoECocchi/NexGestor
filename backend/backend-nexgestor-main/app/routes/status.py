"""
Estado das capacidades opcionais do servidor — /api/v1/status

Existe para o dashboard poder dizer ao gestor o que está ligado ANTES de ele
analisar uma campanha. Sem isto a única forma de saber se a IA participou era
analisar e olhar se `ai_insights` veio preenchido — ou seja, descobrir depois
do fato, e sem distinguir "IA desligada" de "IA falhou nesta chamada".

O caso real que motivou o endpoint (25/08/2026): o servidor de produção estava
com `GEMINI_API_KEY` vazia havia semanas e ninguém notou, porque a ausência da
IA degrada em silêncio por desenho. A equipe avaliou o produto sem metade dele
achando que estava avaliando o todo.

⚠️ Este endpoint é público e sem autenticação, como o resto da API. Ele reporta
   apenas estado BINÁRIO de capacidade e o nome do modelo — nunca a chave, nem
   caminho de banco, nem qualquer outro valor de configuração.
"""
from fastapi import APIRouter

from app.core.config import settings
from app.service import storage
from app.service.ai_service import is_ai_available

router = APIRouter(prefix="/status", tags=["Status"])


@router.get(
    "",
    summary="Capacidades ligadas neste servidor",
    description=(
        "Diz se a camada de IA e a persistência estão ativas. "
        "Usado pelo dashboard para exibir o indicador de IA (on/off)."
    ),
)
def status():
    """
    Estado das capacidades opcionais.

    `enabled` x `available` são coisas diferentes e a distinção é útil para
    diagnosticar: `enabled=True, available=False` significa que o toggle está
    ligado mas falta a chave (ou o SDK) — que é exatamente o estado em que o
    servidor de produção passou semanas sem ninguém perceber.
    """
    return {
        "ai": {
            # Toggle de configuração (GEMINI_ENABLED).
            "enabled": settings.GEMINI_ENABLED,
            # Verdade operacional: toggle ligado E chave presente E SDK instalado.
            # É este que o dashboard usa para acender o indicador.
            "available": is_ai_available(),
            "model": settings.GEMINI_MODEL,
        },
        "persistence": {
            "enabled": storage.persistencia_ativa(),
        },
    }
