"""
Rota de benchmark de mercado — POST /api/v1/benchmark/mercado (fase-2b).

Ver docs/prds/fase-2b-benchmark-mercado.md §4 e a revisão crítica em
docs/sessions/2026-09-04.md ("(parte 4)") para o histórico das correções.
Sem autenticação, como o resto da API pública — NÃO aprovada para busca
paga em produção sem controle de custo/autenticação real (ver
`benchmark_status_block`); `X-Nex-Dono` (usado em `/campaigns`) não é
segurança e não cobre esta rota.

A rota só valida entrada e traduz exceção em status HTTP; a orquestração
cache→Gemini→cache mora em `benchmark_service.py`. `response_model` garante
que um resultado interno inválido (bug em `benchmark_service`) vira 500 de
validação em vez de escapar como 200 com dado incoerente.
"""
import logging
import math
import re
from typing import Annotated, Literal, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings
from app.schema.schema import CampaignNiche, CampaignObjective, CampaignPlatform
from app.service import benchmark_service, storage
from app.service.ai_service import is_ai_available

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/benchmark", tags=["Benchmark de mercado"])


class BenchmarkEntrada(BaseModel):
    """
    `extra="forbid"` (revisão Opus): um campo digitado errado no corpo era
    ignorado em silêncio antes — o cliente achava que tinha mandado algo que
    nunca chegou ao servidor.
    """

    model_config = ConfigDict(extra="forbid")

    niche: CampaignNiche
    platform: CampaignPlatform
    objective: CampaignObjective
    metrics: list[benchmark_service.BenchmarkMetric] = Field(
        ...,
        min_length=1,
        max_length=len(benchmark_service.METRICAS_VALIDAS),
        description="Lista fechada: ctr_link | cpa | cpl | cpm | roas | hook_rate",
    )

    @field_validator("metrics")
    @classmethod
    def _sem_duplicata(cls, v: list[str]) -> list[str]:
        """
        Normaliza duplicatas preservando a ordem de primeira aparição — uma
        métrica repetida na entrada nunca deve gerar duas chamadas nem duas
        linhas no resultado (achado da revisão Opus).
        """
        vistas: dict[str, None] = {}
        for m in v:
            vistas.setdefault(m, None)
        return list(vistas.keys())


class BenchmarkEncontrado(BaseModel):
    """
    Invariantes de `encontrado=True` — todas checadas de verdade (revisão
    Opus, 2026-09-05: antes passavam `value=999`, fonte só com espaço,
    `https://` sem host e `capturado_em` vazio).
    """

    model_config = ConfigDict(extra="forbid")

    metric: benchmark_service.BenchmarkMetric
    encontrado: Literal[True] = True
    value: float
    fonte: str = Field(min_length=1)
    fonte_url: str
    capturado_em: str

    @field_validator("value")
    @classmethod
    def _valor_plausivel(cls, v: float, info) -> float:
        metric = info.data.get("metric")
        if metric and not benchmark_service.valor_plausivel(metric, v):
            raise ValueError(f"value fora da faixa plausível para {metric}")
        return v

    @field_validator("fonte")
    @classmethod
    def _fonte_nao_vazia(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("fonte não pode ser só espaço em branco")
        return v.strip()

    @field_validator("fonte_url")
    @classmethod
    def _url_com_host(cls, v: str) -> str:
        if not benchmark_service.url_publica_valida(v):
            raise ValueError("fonte_url precisa ser http(s) com host válido")
        return v.strip()

    @field_validator("capturado_em")
    @classmethod
    def _data_valida(cls, v: str) -> str:
        if not benchmark_service.data_iso_valida(v):
            raise ValueError("capturado_em precisa ser uma data ISO válida")
        return v


class BenchmarkNaoEncontrado(BaseModel):
    """
    Invariante: `encontrado=False` sempre tem motivo E o tipo do motivo —
    nunca carrega valor/fonte enganosa (`extra="forbid"` garante isso).

    `motivo_tipo` distingue "não buscamos" de "buscamos e não achou"
    (revisão Opus, 2026-09-05): antes os dois usavam o mesmo texto genérico
    de inexistência, afirmando uma conclusão que a busca nunca tirou.
    """

    model_config = ConfigDict(extra="forbid")

    metric: benchmark_service.BenchmarkMetric
    encontrado: Literal[False] = False
    motivo: str = Field(min_length=1)
    motivo_tipo: Literal["nao_elegivel", "nao_encontrado"]


BenchmarkResultadoResponse = Annotated[
    Union[BenchmarkEncontrado, BenchmarkNaoEncontrado],
    Field(discriminator="encontrado"),
]


class BenchmarkResposta(BaseModel):
    resultados: list[BenchmarkResultadoResponse]


def _exigir_benchmark_ligado() -> None:
    if not settings.BENCHMARK_ENABLED:
        raise HTTPException(
            status_code=501,
            detail="Benchmark de mercado desligado neste servidor (BENCHMARK_ENABLED=False).",
        )


@router.post(
    "/mercado",
    response_model=BenchmarkResposta,
    summary="Buscar benchmark de mercado por nicho/plataforma/objetivo",
    description=(
        "Busca benchmark público (só CTR Link, em Meta/Google Ads) para "
        "métricas sem meta definida pelo gestor. CPA/CPL/CPM (sem contrato de "
        "país/moeda ainda), ROAS, Hook Rate e demais combinações devolvem "
        "`encontrado: false` explicitamente — nunca um número inventado nem "
        "convertido de moeda estrangeira sem prova."
    ),
)
async def buscar_benchmark_mercado(entrada: BenchmarkEntrada):
    _exigir_benchmark_ligado()

    try:
        resultados = await benchmark_service.buscar_benchmarks(
            niche=entrada.niche, platform=entrada.platform,
            objective=entrada.objective, metrics=entrada.metrics,
        )
    except benchmark_service.BenchmarkIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))
    except benchmark_service.BenchmarkFalhaTransitoria as e:
        # Falha real de busca — nunca disfarçada de "não encontrado" (200).
        raise HTTPException(
            status_code=503,
            detail=f"Não foi possível verificar a fonte de mercado agora: {e}. Tente de novo em instantes.",
        )
    except Exception as e:
        logger.error("Falha inesperada no benchmark de mercado: %s", e)
        raise HTTPException(status_code=500, detail="Não foi possível buscar o benchmark.")

    return {"resultados": [r.to_dict() for r in resultados]}


def benchmark_status_block() -> dict:
    """
    Bloco `"benchmark"` do GET /status.

    `available` (revisão Opus) exige as TRÊS dependências reais — toggle,
    IA/SDK/chave E persistência/cache — não só toggle+IA. Antes disso,
    `available=true` prometia uma capacidade que devolvia 503 em 100% das
    buscas reais quando a persistência estava desligada.
    """
    return {
        "enabled": settings.BENCHMARK_ENABLED,
        "available": (
            settings.BENCHMARK_ENABLED
            and is_ai_available()
            and storage.persistencia_ativa()
        ),
    }
