"""
Configurações da aplicação carregadas do .env via pydantic-settings.

Adicione novas variáveis criando atributos tipados na classe `Settings`.
Os valores podem ser sobrescritos via .env ou variável de ambiente.
"""
from typing import Optional
from typing_extensions import Annotated
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict, NoDecode


class Settings(BaseSettings):
    """Schema central de configuração — todos os módulos importam `settings` daqui."""

    # ── App ──────────────────────────────────────────────
    APP_NAME: str = "NexGestor"
    # Default seguro: False. Ligue DEBUG=True no .env apenas em desenvolvimento.
    DEBUG: bool = False
    API_V1_STR: str = "/api/v1"

    # ── CORS ─────────────────────────────────────────────
    # Aceita no .env tanto JSON quanto vírgula-separada (o validator abaixo
    # normaliza). Exemplos equivalentes:
    #   CORS_ORIGINS=["http://localhost:5173","https://app.nexgestor.com"]
    #   CORS_ORIGINS=http://localhost:5173,https://app.nexgestor.com
    #
    # localhost:5173 já é o default do Vite (dashboard web novo, em
    # frontend/nexgestor-dashboard) e localhost:3000 cobre alternativas comuns.
    # Se o Vite subir noutra porta (5173 ocupada), acrescente-a aqui ou via
    # CORS_ORIGINS no .env — sem isso o navegador bloqueia a resposta antes do
    # JS do dashboard conseguir lê-la, mesmo com o backend respondendo 200.
    CORS_ORIGINS: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]

    # Duas partes, uma por origem de dev que muda de endereço sozinha:
    #
    # 1. chrome-extension://<EXTENSION_ID> — o ID muda entre a extensão
    #    carregada localmente (unpacked) e a publicada na store. A extensão
    #    em si está descontinuada (docs/roadmap.md item 3), mas a tag git
    #    `extensao-estavel-2026-08` ainda existe pra rodar a cópia congelada
    #    localmente se precisar — por isso o regex não foi removido.
    # 2. http://localhost:<qualquer porta> — o Vite sobe na primeira porta
    #    livre a partir de 5173; com ela ocupada (outro checkout, por
    #    exemplo) sobe em 5174, 5175... Sem isto TODA chamada falha como
    #    "Failed to fetch" (achado A7 da auditoria de rede de 2026-09-03,
    #    reproduzido ao vivo nesta mesma sessão: preflight de origem
    #    :5174 voltou 400 sem Access-Control-Allow-Origin porque só 5173 e
    #    3000 estavam na allowlist fixa acima). Casa só http (nunca https)
    #    porque produção sempre serve por trás de TLS — self-signed/mixed
    #    content não fazem parte do caminho local.
    #
    # Em produção, troque por uma origin fixa em CORS_ORIGINS e, se quiser
    # travar de vez, defina CORS_ORIGIN_REGEX="" no .env.
    CORS_ORIGIN_REGEX: str = r"chrome-extension://.*|http://localhost:\d+"

    # ── Persistência (SQLite) ────────────────────────────
    # ⚠️ Dados isolados por `dono` desde 25/08/2026, mas SEM login de verdade:
    # o dono é uma string que o cliente manda no header `X-Nex-Dono`. Separa a
    # visão de cada pessoa, não protege contra quem souber o valor alheio —
    # ver `app/service/storage.py`.
    #
    # Caminho do arquivo. Default VAZIO = persistência desligada, backend
    # stateless como sempre foi — quem roda local não precisa de banco nenhum e
    # a suíte de testes não toca em disco por acidente. Quem liga é o
    # docker-compose (DB_PATH=/dados/nexgestor.db, apontando para o volume).
    DB_PATH: str = ""
    # Tetos defensivos: a API é pública e sem autenticação, então sem limite
    # qualquer um enche o disco do VPS.
    #
    # São DOIS tetos, e os dois são necessários:
    #  - POR DONO: impede que uma pessoa sozinha consuma a base inteira e deixe
    #    o resto da equipe sem espaço.
    #  - GLOBAL: como o dono é só um texto que o cliente escolhe, sem o teto
    #    global bastaria inventar identificadores novos (`ana`, `ana2`, ...)
    #    para conseguir espaço infinito. É ele que limita o disco de fato.
    DB_MAX_CAMPANHAS: int = 500
    DB_MAX_CAMPANHAS_GLOBAL: int = 5000
    DB_MAX_PAYLOAD_BYTES: int = 64 * 1024

    # ── Gemini (IA) ──────────────────────────────────────
    # Sem chave configurada => IA fica desligada e o engine funciona normalmente.
    # repr=False: a key nunca aparece em repr(settings)/str(settings) — evita
    # vazamento via prints de debug ou em asserts de teste que falham (o pytest
    # imprime o repr dos dois lados da comparação).
    GEMINI_API_KEY: Optional[str] = Field(default=None, repr=False)
    GEMINI_MODEL: str = "gemini-flash-lite-latest"
    GEMINI_TIMEOUT_SECONDS: float = 8.0
    GEMINI_ENABLED: bool = True

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v):
        """
        Aceita CORS_ORIGINS no .env como JSON (["a","b"]) OU vírgula-separada
        (a,b). Usamos NoDecode no campo para o pydantic-settings NÃO tentar o
        json.loads automático (que derrubava o boot com vírgula simples) —
        este validator assume o parsing dos dois formatos.
        """
        if isinstance(v, str):
            s = v.strip()
            if s.startswith("["):
                import json
                return json.loads(s)  # formato JSON explícito
            return [item.strip() for item in s.split(",") if item.strip()]
        return v

    @property
    def ai_available(self) -> bool:
        """True se a IA tem chave configurada E está habilitada via toggle."""
        return self.GEMINI_ENABLED and bool(self.GEMINI_API_KEY)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


# Singleton — importe `settings` em qualquer módulo que precise.
settings = Settings()
