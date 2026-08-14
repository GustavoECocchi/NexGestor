"""
Testes da persistência (SQLite) — base COMPARTILHADA, temporária.

O que estes testes travam, além do CRUD: os limites defensivos (a API é pública
e sem autenticação) e a degradação quando a persistência está desligada, que é o
estado padrão de quem roda local.
"""
import json
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.service import storage

client = TestClient(app)


@pytest.fixture
def base(tmp_path, monkeypatch):
    """Base isolada por teste, com o módulo reinicializado."""
    caminho = tmp_path / "teste.db"
    monkeypatch.setattr(settings, "DB_PATH", str(caminho))
    monkeypatch.setattr(storage, "_iniciado", False)
    yield caminho
    monkeypatch.setattr(storage, "_iniciado", False)


@pytest.fixture
def sem_base(monkeypatch):
    monkeypatch.setattr(settings, "DB_PATH", "")
    monkeypatch.setattr(storage, "_iniciado", False)


VM = {"id": 1000, "name": "Black Friday", "score": 72, "status": "YELLOW"}


# ─────────────────────────────────────────────────────────────────────────────
# Persistência desligada — o padrão de quem roda local
# ─────────────────────────────────────────────────────────────────────────────

class TestPersistenciaDesligada:
    def test_db_path_vazio_e_o_default(self):
        """Sem configurar nada, o backend segue stateless como sempre foi."""
        from app.core.config import Settings

        assert Settings(_env_file=None).DB_PATH == ""

    def test_rotas_respondem_501_e_nao_500(self, sem_base):
        # 501 diz "capacidade desligada"; 500 diria "quebrou". A extensão
        # distingue os dois: no primeiro caso ela cai para o armazenamento
        # local em silêncio, sem assustar o usuário.
        assert client.get("/api/v1/campaigns").status_code == 501
        assert client.post("/api/v1/campaigns", json={"payload": VM}).status_code == 501
        assert client.delete("/api/v1/campaigns/1").status_code == 501

    def test_funcoes_do_storage_recusam_explicitamente(self, sem_base):
        with pytest.raises(storage.PersistenciaDesligada):
            storage.listar()

    def test_analise_continua_funcionando_sem_banco(self, sem_base):
        """A persistência é acessório: sem ela o produto principal roda igual."""
        r = client.post(
            "/api/v1/campaign/analyze",
            json={
                "campaign": {"id": 1, "name": "t"},
                "metrics": {"spend": 100, "conversions": 5},
                "targets": {},
            },
        )
        assert r.status_code == 200
        assert "overall_score" in r.json()


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

class TestCrud:
    def test_salva_e_lista(self, base):
        r = client.post("/api/v1/campaigns", json={"payload": VM})
        assert r.status_code == 200
        novo_id = r.json()["id"]

        lista = client.get("/api/v1/campaigns").json()["campanhas"]
        assert len(lista) == 1
        assert lista[0]["id"] == novo_id
        assert lista[0]["payload"] == VM

    def test_payload_volta_intacto_com_acentos_e_aninhamento(self, base):
        complexo = {
            "name": "Campanha de Ação — Verão",
            "scenarios": [{"code": "A", "nota": "Hook Rate < 24,5%"}],
            "aninhado": {"lista": [1, 2, {"ok": True}]},
        }
        client.post("/api/v1/campaigns", json={"payload": complexo})
        assert client.get("/api/v1/campaigns").json()["campanhas"][0]["payload"] == complexo

    def test_atualiza_pelo_id_sem_duplicar(self, base):
        novo_id = client.post("/api/v1/campaigns", json={"payload": VM}).json()["id"]

        atualizado = {**VM, "score": 91}
        client.post("/api/v1/campaigns", json={"payload": atualizado, "id": novo_id})

        lista = client.get("/api/v1/campaigns").json()["campanhas"]
        assert len(lista) == 1
        assert lista[0]["payload"]["score"] == 91

    def test_atualizar_id_inexistente_insere_em_vez_de_falhar(self, base):
        # A extensão pode ter a campanha só no localStorage (analisada antes da
        # persistência existir, ou base recriada). Recusar perderia o dado.
        r = client.post("/api/v1/campaigns", json={"payload": VM, "id": 9999})
        assert r.status_code == 200
        assert r.json()["id"] != 9999
        assert len(client.get("/api/v1/campaigns").json()["campanhas"]) == 1

    def test_remove(self, base):
        novo_id = client.post("/api/v1/campaigns", json={"payload": VM}).json()["id"]
        assert client.delete(f"/api/v1/campaigns/{novo_id}").status_code == 200
        assert client.get("/api/v1/campaigns").json()["campanhas"] == []

    def test_remover_inexistente_e_404(self, base):
        assert client.delete("/api/v1/campaigns/4242").status_code == 404

    def test_lista_mais_recentes_primeiro(self, base):
        for nome in ["primeira", "segunda", "terceira"]:
            client.post("/api/v1/campaigns", json={"payload": {"name": nome}})

        nomes = [c["payload"]["name"] for c in client.get("/api/v1/campaigns").json()["campanhas"]]
        assert nomes[0] == "terceira"
        assert nomes[-1] == "primeira"


# ─────────────────────────────────────────────────────────────────────────────
# Base compartilhada — decisão TEMPORÁRIA do período de testes
# ─────────────────────────────────────────────────────────────────────────────

class TestBaseCompartilhada:
    def test_quem_salva_e_quem_le_nao_se_distinguem(self, base):
        """
        Hoje NÃO existe dono: qualquer cliente lê e apaga tudo. Este teste
        documenta a decisão do período de testes — se um dia ele começar a
        falhar porque alguém adicionou isolamento por pessoa, é sinal de que a
        migração descrita em storage.py aconteceu, e ele deve ser reescrito,
        não "consertado".
        """
        client.post("/api/v1/campaigns", json={"payload": {"name": "da Ana"}})
        client.post("/api/v1/campaigns", json={"payload": {"name": "do Bruno"}})

        nomes = {c["payload"]["name"] for c in client.get("/api/v1/campaigns").json()["campanhas"]}
        assert nomes == {"da Ana", "do Bruno"}

    def test_a_tabela_ainda_nao_tem_coluna_de_dono(self, base):
        storage.salvar({"name": "x"})
        with sqlite3.connect(base) as conn:
            colunas = {l[1] for l in conn.execute("PRAGMA table_info(campanhas)")}
        assert "dono" not in colunas
        assert colunas == {"id", "payload", "criado_em", "atualizado_em"}


# ─────────────────────────────────────────────────────────────────────────────
# Limites defensivos — a API é pública e sem autenticação
# ─────────────────────────────────────────────────────────────────────────────

class TestLimites:
    def test_payload_grande_demais_e_413(self, base, monkeypatch):
        monkeypatch.setattr(settings, "DB_MAX_PAYLOAD_BYTES", 200)
        r = client.post("/api/v1/campaigns", json={"payload": {"lixo": "x" * 500}})
        assert r.status_code == 413
        assert client.get("/api/v1/campaigns").json()["campanhas"] == []

    def test_base_cheia_e_507_e_nao_apaga_nada(self, base, monkeypatch):
        monkeypatch.setattr(settings, "DB_MAX_CAMPANHAS", 2)
        for i in range(2):
            assert client.post("/api/v1/campaigns", json={"payload": {"n": i}}).status_code == 200

        r = client.post("/api/v1/campaigns", json={"payload": {"n": 99}})
        assert r.status_code == 507
        # O limite não pode virar rotatividade silenciosa: o dado antigo fica.
        assert len(client.get("/api/v1/campaigns").json()["campanhas"]) == 2

    def test_limite_nao_impede_atualizar_o_que_ja_existe(self, base, monkeypatch):
        novo_id = client.post("/api/v1/campaigns", json={"payload": {"n": 1}}).json()["id"]
        monkeypatch.setattr(settings, "DB_MAX_CAMPANHAS", 1)

        r = client.post("/api/v1/campaigns", json={"payload": {"n": 2}, "id": novo_id})
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Robustez
# ─────────────────────────────────────────────────────────────────────────────

class TestRobustez:
    def test_linha_corrompida_nao_derruba_a_listagem(self, base):
        client.post("/api/v1/campaigns", json={"payload": {"name": "boa"}})
        with sqlite3.connect(base) as conn:
            conn.execute(
                "INSERT INTO campanhas (payload, criado_em, atualizado_em)"
                " VALUES ('{isso nao e json', '2026-01-01', '2026-01-01')"
            )
            conn.commit()

        lista = client.get("/api/v1/campaigns").json()["campanhas"]
        assert [c["payload"]["name"] for c in lista] == ["boa"]

    def test_wal_ligado(self, base):
        """Sem WAL, duas pessoas analisando juntas pegam 'database is locked'."""
        storage.salvar({"name": "x"})
        with sqlite3.connect(base) as conn:
            assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"

    def test_cria_o_diretorio_do_banco_se_faltar(self, tmp_path, monkeypatch):
        alvo = tmp_path / "sub" / "dir" / "b.db"
        monkeypatch.setattr(settings, "DB_PATH", str(alvo))
        monkeypatch.setattr(storage, "_iniciado", False)

        storage.salvar({"name": "x"})
        assert alvo.exists()

    def test_dados_sobrevivem_a_reabertura(self, base):
        """Prova que grava em disco, e não em memória."""
        storage.salvar({"name": "persistida"})
        storage._iniciado = False

        with sqlite3.connect(base) as conn:
            linhas = conn.execute("SELECT payload FROM campanhas").fetchall()
        assert json.loads(linhas[0][0])["name"] == "persistida"

    def test_payload_precisa_ser_objeto(self, base):
        assert client.post("/api/v1/campaigns", json={"payload": "texto"}).status_code == 422
        assert client.post("/api/v1/campaigns", json={"payload": 42}).status_code == 422
        assert client.post("/api/v1/campaigns", json={}).status_code == 422


class TestFalhaDeInfra:
    """
    Banco inacessível (disco cheio, permissão, volume não montado).

    Medido com uma pasta somente-leitura em 14/08/2026: o app SOBE normalmente,
    as rotas de persistência devolvem 500 com mensagem limpa (sem traceback no
    corpo) e a ANÁLISE continua respondendo 200 — o produto principal não pode
    cair junto com o acessório.
    """

    def test_erro_no_banco_vira_500_com_mensagem_limpa(self, base, monkeypatch):
        def explode(*_a, **_k):
            raise sqlite3.OperationalError("attempt to write a readonly database")

        monkeypatch.setattr(storage, "listar", explode)
        monkeypatch.setattr(storage, "salvar", explode)
        monkeypatch.setattr(storage, "remover", explode)

        for resp in (
            client.get("/api/v1/campaigns"),
            client.post("/api/v1/campaigns", json={"payload": VM}),
            client.delete("/api/v1/campaigns/1"),
        ):
            assert resp.status_code == 500
            corpo = resp.json()["detail"]
            # O detalhe técnico fica no log do servidor, não na resposta.
            assert "readonly" not in corpo
            assert "Traceback" not in corpo

    def test_analise_nao_cai_junto_com_a_persistencia(self, base, monkeypatch):
        monkeypatch.setattr(storage, "listar", lambda *_a, **_k: 1 / 0)

        r = client.post(
            "/api/v1/campaign/analyze",
            json={
                "campaign": {"id": 1, "name": "t"},
                "metrics": {"spend": 100, "conversions": 5},
                "targets": {},
            },
        )
        assert r.status_code == 200


class TestEntradaHostil:
    """Round-trip do payload — o backend não interpreta, então não pode alterar."""

    def test_conteudo_hostil_volta_identico_e_nao_executa_nada(self, base):
        payload = {
            "name": "<script>alert('xss')</script> & \"aspas\" 'simples'",
            "sql": "'; DROP TABLE campanhas; --",
            "emoji": "🚀 ação ñ",
            "quebras": "linha1\nlinha2\ttab",
            "aninhado": {"lista": [1, 2, {"profundo": None}]},
            "zero": 0,
            "falso": False,
        }
        client.post("/api/v1/campaigns", json={"payload": payload})

        lista = client.get("/api/v1/campaigns").json()["campanhas"]
        assert lista[0]["payload"] == payload
        # A tabela continua existindo: as queries são parametrizadas.
        assert len(lista) == 1

    def test_id_nao_numerico_no_delete_e_422_e_nao_500(self, base):
        assert client.delete("/api/v1/campaigns/abc").status_code == 422

    def test_entradas_invalidas_nunca_viram_500(self, base):
        for corpo in ({"payload": "texto"}, {"payload": 42}, {"payload": None}, {}, [1, 2, 3]):
            assert client.post("/api/v1/campaigns", json=corpo).status_code == 422
