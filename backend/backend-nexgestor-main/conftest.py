"""
Configuração compartilhada da suíte de testes.

A IA fica DESLIGADA por padrão em todos os testes. Sem isso, qualquer teste que
bata no endpoint (`client.post("/api/v1/campaign/analyze", ...)`) sem mockar a
camada de IA faz uma chamada REAL ao Gemini quando existe uma key válida no .env
local — o que significa cota paga queimada a cada `pytest`, testes não
determinísticos (dependentes de rede) e suíte lenta (medido: 9 chamadas reais por
execução, ~59s contra ~1s com a IA desligada).

Isto complementa a correção de 2026-07-16, que isolou apenas a classe
`TestIADesativada`. Os demais testes de endpoint continuavam expostos.

Como escrever um teste que EXERCITA a IA (nenhum deles depende do .env):
  • Comportamento de alto nível → `patch("app.service.ai_service.is_ai_available",
    return_value=True)` junto com um mock de `call_gemini`.
  • Camada do SDK → substituir `app.service.ai_service.settings` por um mock com
    `ai_available = True` e mockar `_get_client` (padrão de `TestGeminiSDKLayer`).
Ambos vencem esta fixture, porque trocam o alvo diretamente.
"""
import pytest

from app.core.config import settings


@pytest.fixture(autouse=True)
def _ia_desligada_por_padrao():
    """Desliga a IA durante cada teste e restaura o valor original ao final."""
    original = settings.GEMINI_ENABLED
    settings.GEMINI_ENABLED = False
    try:
        yield
    finally:
        settings.GEMINI_ENABLED = original
