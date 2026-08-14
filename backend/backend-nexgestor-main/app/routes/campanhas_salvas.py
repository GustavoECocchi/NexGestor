"""
Rotas de persistência das campanhas — /api/v1/campaigns

⚠️ BASE COMPARTILHADA, TEMPORÁRIA (período de testes, 14/08/2026): não há
   login nem dono, então estas rotas leem e apagam o dado de toda a equipe.
   O caminho de migração para dados por pessoa está em `app/service/storage.py`.

A camada aqui só valida entrada e traduz exceção em status HTTP; a lógica de
banco mora no storage.
"""
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.service import storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/campaigns", tags=["Campanhas salvas"])


class CampanhaEntrada(BaseModel):
    """O payload é opaco de propósito — quem define o formato é a extensão."""

    payload: dict = Field(..., description="Objeto da campanha como a UI o guarda.")
    id: int | None = Field(
        default=None,
        description="Informe para atualizar uma campanha existente; omita para criar.",
    )


def _exigir_persistencia() -> None:
    if not storage.persistencia_ativa():
        # 501 e não 500: não é falha, é uma capacidade desligada por
        # configuração (DB_PATH vazio). A extensão trata isso caindo de volta
        # para o armazenamento local, sem mostrar erro ao usuário.
        raise HTTPException(
            status_code=501,
            detail="Persistência desligada neste servidor (DB_PATH vazio).",
        )


@router.get("", summary="Listar campanhas salvas (base compartilhada)")
def listar_campanhas():
    _exigir_persistencia()
    try:
        return {"campanhas": storage.listar()}
    except Exception as e:
        logger.error("Falha ao listar campanhas: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível ler as campanhas.")


@router.post("", summary="Salvar campanha (cria ou atualiza)")
def salvar_campanha(entrada: CampanhaEntrada):
    _exigir_persistencia()
    try:
        return storage.salvar(entrada.payload, entrada.id)
    except storage.PayloadGrandeDemais as e:
        raise HTTPException(status_code=413, detail=str(e))
    except storage.LimiteDeCampanhas as e:
        # 507 (Insufficient Storage) diz exatamente o que aconteceu: não é
        # erro do cliente nem falha do servidor, é a base cheia.
        raise HTTPException(status_code=507, detail=str(e))
    except Exception as e:
        logger.error("Falha ao salvar campanha: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível salvar a campanha.")


@router.delete("/{campanha_id}", summary="Apagar campanha (afeta toda a equipe)")
def apagar_campanha(campanha_id: int):
    _exigir_persistencia()
    try:
        if not storage.remover(campanha_id):
            raise HTTPException(status_code=404, detail="Campanha não encontrada.")
        return {"removida": campanha_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Falha ao apagar campanha: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível apagar a campanha.")
