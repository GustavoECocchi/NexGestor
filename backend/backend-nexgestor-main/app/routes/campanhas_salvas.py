"""
Rotas de persistência das campanhas — /api/v1/campaigns

⚠️ ISOLAMENTO POR `dono` (25/08/2026), AINDA SEM LOGIN DE VERDADE: todo
   pedido precisa do header `X-Nex-Dono` — uma string simples, sem senha,
   que separa a visão de cada pessoa. Quem souber o valor alheio ainda lê os
   dados dele (separação de visão, não segurança). O caminho para
   autenticação de verdade está em `app/service/storage.py`.

A camada aqui só valida entrada e traduz exceção em status HTTP; a lógica de
banco mora no storage.
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
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


def obter_dono(x_nex_dono: str = Header(..., alias="X-Nex-Dono")) -> str:
    """
    Identificador simples de quem está chamando — sem senha, sem sessão.

    Normalizado (trim + lowercase) para "Ana", "ana " e "ANA" caírem no mesmo
    dono. Header ausente já vira 422 automático do FastAPI antes de chegar
    aqui; presente mas vazio/gigante é rejeitado explicitamente.
    """
    dono = x_nex_dono.strip().lower()
    if not dono or len(dono) > 120:
        raise HTTPException(
            status_code=422, detail="Identificador (header X-Nex-Dono) inválido."
        )
    return dono


def _exigir_persistencia() -> None:
    if not storage.persistencia_ativa():
        # 501 e não 500: não é falha, é uma capacidade desligada por
        # configuração (DB_PATH vazio). A extensão trata isso caindo de volta
        # para o armazenamento local, sem mostrar erro ao usuário.
        raise HTTPException(
            status_code=501,
            detail="Persistência desligada neste servidor (DB_PATH vazio).",
        )


@router.get("", summary="Listar campanhas salvas do dono")
def listar_campanhas(dono: str = Depends(obter_dono)):
    _exigir_persistencia()
    try:
        return {"campanhas": storage.listar(dono)}
    except Exception as e:
        logger.error("Falha ao listar campanhas: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível ler as campanhas.")


@router.post("", summary="Salvar campanha (cria ou atualiza)")
def salvar_campanha(entrada: CampanhaEntrada, dono: str = Depends(obter_dono)):
    _exigir_persistencia()
    try:
        return storage.salvar(entrada.payload, dono, entrada.id)
    except storage.PayloadGrandeDemais as e:
        raise HTTPException(status_code=413, detail=str(e))
    except storage.LimiteDeCampanhas as e:
        # 507 (Insufficient Storage) diz exatamente o que aconteceu: não é
        # erro do cliente nem falha do servidor, é a base cheia.
        raise HTTPException(status_code=507, detail=str(e))
    except Exception as e:
        logger.error("Falha ao salvar campanha: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível salvar a campanha.")


@router.delete("/{campanha_id}", summary="Apagar campanha do dono")
def apagar_campanha(campanha_id: int, dono: str = Depends(obter_dono)):
    _exigir_persistencia()
    try:
        if not storage.remover(campanha_id, dono):
            raise HTTPException(status_code=404, detail="Campanha não encontrada.")
        return {"removida": campanha_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Falha ao apagar campanha: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível apagar a campanha.")
