"""
Persistência das campanhas analisadas — SQLite, arquivo único.

═══════════════════════════════════════════════════════════════════════════
⚠️  ESTADO TEMPORÁRIO — BASE COMPARTILHADA, DECIDIDO PARA O PERÍODO DE TESTES
    (14/08/2026). Não é o desenho final.

    Hoje: uma única base, sem login e sem dono. Todo mundo da equipe vê e
    apaga as campanhas de todo mundo. Foi uma decisão consciente do usuário —
    durante os testes, ver o diagnóstico do colega é útil, e não há dado
    sensível em jogo.

    Antes de abrir para usuários reais isto PRECISA virar dado por pessoa.
    Migração prevista (as duas primeiras já bastam para isolar):

      1. `ALTER TABLE campanhas ADD COLUMN dono TEXT` (SQLite aceita em
         tabela existente, sem recriar).
      2. Filtrar por `dono` no `listar`/`remover` e exigir o identificador
         nas rotas.
      3. Trocar o identificador por autenticação de verdade — enquanto for um
         texto que o cliente envia, quem souber o valor alheio lê os dados
         dele. Separação de visão, não segurança.

    Enquanto isso não acontece, tratar esta base como pública para a equipe.
═══════════════════════════════════════════════════════════════════════════

O `payload` é opaco para o backend: guarda o objeto que a extensão monta
(CampaignVM) sem interpretar. Isso evita acoplar o formato da UI ao banco —
mudança de campo na tela não exige migração aqui.
"""
from __future__ import annotations

import json
import logging
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Serializa a criação do schema. As escritas em si são protegidas pelo próprio
# SQLite (uma por vez); este lock existe só para não haver duas inicializações
# concorrendo na primeira requisição depois do boot.
_init_lock = threading.Lock()
_iniciado = False


class PersistenciaDesligada(RuntimeError):
    """DB_PATH vazio — o backend roda stateless, como antes desta feature."""


class PayloadGrandeDemais(ValueError):
    """Payload acima de DB_MAX_PAYLOAD_BYTES."""


class LimiteDeCampanhas(RuntimeError):
    """Base cheia (DB_MAX_CAMPANHAS)."""


def persistencia_ativa() -> bool:
    return bool(settings.DB_PATH)


def _agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def _conexao() -> Iterator[sqlite3.Connection]:
    """
    Conexão curta, uma por operação.

    `check_same_thread=False` porque o FastAPI executa rotas síncronas num
    threadpool — a conexão pode nascer numa thread e ser usada em outra.
    """
    if not persistencia_ativa():
        raise PersistenciaDesligada("DB_PATH vazio — persistência desligada.")

    caminho = Path(settings.DB_PATH)
    caminho.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(caminho, check_same_thread=False, timeout=10.0)
    try:
        conn.row_factory = sqlite3.Row
        # WAL: leitura não bloqueia escrita. Sem isso, duas pessoas analisando
        # ao mesmo tempo pegam "database is locked" com facilidade.
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        yield conn
    finally:
        conn.close()


def inicializar() -> None:
    """Cria o schema. Idempotente — pode rodar a cada boot."""
    global _iniciado
    if not persistencia_ativa():
        logger.info("Persistência desligada (DB_PATH vazio).")
        return

    with _init_lock:
        if _iniciado:
            return
        with _conexao() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS campanhas (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    payload      TEXT NOT NULL,
                    criado_em    TEXT NOT NULL,
                    atualizado_em TEXT NOT NULL
                )
                """
            )
            conn.commit()
        _iniciado = True
        logger.info("Persistência pronta em %s", settings.DB_PATH)


def listar() -> list[dict[str, Any]]:
    """Todas as campanhas, mais recentes primeiro."""
    inicializar()
    with _conexao() as conn:
        linhas = conn.execute(
            "SELECT id, payload, criado_em, atualizado_em"
            " FROM campanhas ORDER BY atualizado_em DESC, id DESC"
        ).fetchall()

    saida: list[dict[str, Any]] = []
    for l in linhas:
        try:
            payload = json.loads(l["payload"])
        except json.JSONDecodeError:
            # Linha corrompida não pode derrubar a listagem inteira: o resto
            # dos dados de todo mundo continua válido.
            logger.warning("Campanha %s tem payload inválido — ignorada.", l["id"])
            continue
        saida.append(
            {
                "id": l["id"],
                "payload": payload,
                "criado_em": l["criado_em"],
                "atualizado_em": l["atualizado_em"],
            }
        )
    return saida


def salvar(payload: dict[str, Any], campanha_id: Optional[int] = None) -> dict[str, Any]:
    """
    Insere (sem id) ou atualiza (com id). Devolve o registro gravado.

    Atualizar um id inexistente INSERE, em vez de falhar: a extensão pode ter
    o dado só no localStorage (analisado offline, ou base recriada) e perder
    isso seria pior que duplicar.
    """
    inicializar()

    bruto = json.dumps(payload, ensure_ascii=False)
    if len(bruto.encode("utf-8")) > settings.DB_MAX_PAYLOAD_BYTES:
        raise PayloadGrandeDemais(
            f"Payload acima do limite de {settings.DB_MAX_PAYLOAD_BYTES} bytes."
        )

    agora = _agora()
    with _conexao() as conn:
        if campanha_id is not None:
            atingidas = conn.execute(
                "UPDATE campanhas SET payload = ?, atualizado_em = ? WHERE id = ?",
                (bruto, agora, campanha_id),
            ).rowcount
            if atingidas:
                conn.commit()
                return {"id": campanha_id, "payload": payload, "atualizado_em": agora}

        total = conn.execute("SELECT COUNT(*) FROM campanhas").fetchone()[0]
        if total >= settings.DB_MAX_CAMPANHAS:
            raise LimiteDeCampanhas(
                f"Base cheia ({settings.DB_MAX_CAMPANHAS} campanhas). "
                "Apague alguma antes de salvar outra."
            )

        cur = conn.execute(
            "INSERT INTO campanhas (payload, criado_em, atualizado_em) VALUES (?, ?, ?)",
            (bruto, agora, agora),
        )
        conn.commit()
        return {"id": cur.lastrowid, "payload": payload, "atualizado_em": agora}


def remover(campanha_id: int) -> bool:
    """True se apagou; False se o id não existia."""
    inicializar()
    with _conexao() as conn:
        n = conn.execute("DELETE FROM campanhas WHERE id = ?", (campanha_id,)).rowcount
        conn.commit()
    return bool(n)
