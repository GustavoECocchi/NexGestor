"""
Persistência das campanhas analisadas — SQLite, arquivo único.

═══════════════════════════════════════════════════════════════════════════
⚠️  ISOLAMENTO POR `dono` (25/08/2026) — AINDA NÃO É LOGIN DE VERDADE.

    Cada campanha pertence a um `dono`: uma string simples que o cliente
    manda no header `X-Nex-Dono` (ver `app/routes/campanhas_salvas.py`), sem
    senha nem sessão. `listar`/`salvar`/`remover` filtram por ela, então uma
    pessoa não vê nem apaga a campanha de outra — mas enquanto for só um
    texto que o próprio cliente informa, quem souber (ou adivinhar) o valor
    alheio lê os dados dele. **Separação de visão, não segurança.**

    Autenticação de verdade (senha, sessão/token) é o próximo passo, fora do
    escopo desta mudança.

    Até 24/08/2026 a base era COMPARTILHADA (sem `dono`, todo mundo via tudo)
    — decisão temporária do período de testes. Bases locais criadas antes
    disso não tinham a coluna `dono`; `inicializar()` adiciona via
    `ALTER TABLE` na primeira vez que rodam com este código, e as linhas
    antigas (sem dono) ficam órfãs — invisíveis, não deletadas.
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
                    dono         TEXT,
                    criado_em    TEXT NOT NULL,
                    atualizado_em TEXT NOT NULL
                )
                """
            )
            # Base criada antes de 25/08/2026 não tem a coluna `dono` — soma
            # em cima sem recriar a tabela. Idempotente: quando a coluna já
            # existe o SQLite responde "duplicate column name", que é o único
            # erro esperado aqui. Qualquer outro (disco cheio, base somente
            # leitura, base travada) precisa subir, e não ser engolido.
            try:
                conn.execute("ALTER TABLE campanhas ADD COLUMN dono TEXT")
            except sqlite3.OperationalError as e:
                if "duplicate column" not in str(e).lower():
                    raise
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_campanhas_dono ON campanhas(dono)"
            )
            conn.commit()
        _iniciado = True
        logger.info("Persistência pronta em %s", settings.DB_PATH)


def listar(dono: str) -> list[dict[str, Any]]:
    """Campanhas do `dono` informado, mais recentes primeiro."""
    inicializar()
    with _conexao() as conn:
        linhas = conn.execute(
            "SELECT id, payload, criado_em, atualizado_em"
            " FROM campanhas WHERE dono = ? ORDER BY atualizado_em DESC, id DESC",
            (dono,),
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


def salvar(
    payload: dict[str, Any], dono: str, campanha_id: Optional[int] = None
) -> dict[str, Any]:
    """
    Insere (sem id) ou atualiza (com id) uma campanha do `dono`. Devolve o
    registro gravado.

    Atualizar um id inexistente — ou que existe mas pertence a outro dono —
    INSERE, em vez de falhar: a extensão pode ter o dado só no localStorage
    (analisado offline, ou base recriada) e perder isso seria pior que
    duplicar. Como efeito colateral, isso também impede que o id de outra
    pessoa seja sequestrado por engano: a linha alheia nunca é tocada, e o
    cliente ganha uma campanha nova.
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
                "UPDATE campanhas SET payload = ?, atualizado_em = ?"
                " WHERE id = ? AND dono = ?",
                (bruto, agora, campanha_id, dono),
            ).rowcount
            if atingidas:
                conn.commit()
                return {"id": campanha_id, "payload": payload, "atualizado_em": agora}

        do_dono = conn.execute(
            "SELECT COUNT(*) FROM campanhas WHERE dono = ?", (dono,)
        ).fetchone()[0]
        if do_dono >= settings.DB_MAX_CAMPANHAS:
            raise LimiteDeCampanhas(
                f"Você atingiu o limite de {settings.DB_MAX_CAMPANHAS} campanhas. "
                "Apague alguma antes de salvar outra."
            )

        # Teto global: sem ele, o teto por dono não limita nada — o dono é um
        # texto escolhido pelo cliente, então bastaria inventar identificadores
        # novos para conseguir espaço infinito no disco do VPS.
        total = conn.execute("SELECT COUNT(*) FROM campanhas").fetchone()[0]
        if total >= settings.DB_MAX_CAMPANHAS_GLOBAL:
            raise LimiteDeCampanhas(
                f"Base cheia ({settings.DB_MAX_CAMPANHAS_GLOBAL} campanhas no "
                "servidor). Fale com quem administra o servidor."
            )

        cur = conn.execute(
            "INSERT INTO campanhas (payload, dono, criado_em, atualizado_em)"
            " VALUES (?, ?, ?, ?)",
            (bruto, dono, agora, agora),
        )
        conn.commit()
        return {"id": cur.lastrowid, "payload": payload, "atualizado_em": agora}


def remover(campanha_id: int, dono: str) -> bool:
    """True se apagou uma campanha do `dono`; False se não existia (dele)."""
    inicializar()
    with _conexao() as conn:
        n = conn.execute(
            "DELETE FROM campanhas WHERE id = ? AND dono = ?", (campanha_id, dono)
        ).rowcount
        conn.commit()
    return bool(n)
