"""
P5 — consistência entre métricas brutas e taxas informadas.

Matriz de regras, fundamento e limites: docs/sessions/2026-09-09.md, seção
"Continuidade — P5 corrigido: matriz revisada".

  R1 — a taxa declarada não pode ser um arredondamento da implícita pelos brutos.
  R2 — denominador informado como zero, com evento ou taxa acima de zero.

Não existe regra de teto (numerador ≤ denominador / taxa ≤ 100%): a versão
anterior tinha uma e ela foi removida por falta de fundamento verificável.
Os testes de `TestSemTetoNaoFundamentado` fixam essa decisão para que ela seja
revisável — não são "casos aceitos por engano".
"""
import json
import re
import sqlite3
import sys
from decimal import Decimal, getcontext
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, ".")

from app.core.config import settings
from app.main import app
from app.schema.schema import AnalyzeInput, Campaign, Metrics, Targets
from app.service import storage
from app.service.campaign_payload import _CHAVES_CONHECIDAS
from app.service.metric_consistency import (
    MetricasInconsistentes,
    _fmt_pct,
    casas_decimais,
    meia_unidade_pp,
    validar_consistencia_metricas,
)
from app.service.service import analyze_campaign

client = TestClient(app)


def _campos(erros):
    return [tuple(e.campos) for e in erros]


def analisar_http(metrics: dict):
    return client.post(
        "/api/v1/campaign/analyze",
        json={"campaign": {"id": 1, "name": "t"}, "metrics": metrics, "targets": {}},
    )


# ─────────────────────────────────────────────────────────────────────────────
# R1 — taxa declarada × taxa implícita nos brutos
# ─────────────────────────────────────────────────────────────────────────────

class TestR1Contradicao:
    def test_caso_aprovado_ctr_link(self):
        """100 impressões, 50 cliques, mas CTR 0,4% — exemplo aprovado pelo usuário."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=100, link_clicks=50, ctr_link=0.4)
        )
        assert len(erros) == 1
        assert erros[0].campos == ["impressions", "link_clicks", "ctr_link"]
        msg = erros[0].mensagem
        # Números reais, a taxa correta, a taxa errada E as duas traduzidas em
        # quantidade — sem jargão interno.
        assert "50 cliques no link a cada 100 vezes que o anúncio apareceu" in msg
        assert "uma taxa de 50%" in msg
        assert "0,4%" in msg
        assert "apenas 4 cliques no link a cada 1.000" in msg
        for jargao in ("payload", "denominador", "violação", "base é zero", "ctr link não"):
            assert jargao not in msg.lower()

    def test_declarada_maior_nao_usa_a_palavra_apenas(self):
        """'apenas' só cabe quando a taxa declarada é MENOR que a real."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=4, ctr_link=0.9)
        )
        msg = erros[0].mensagem
        assert "significaria" in msg
        assert "apenas" not in msg
        assert "mais do que os números que você informou" in msg

    def test_hold_rate_aponta_o_campo_sem_afirmar_limiar_nao_conferido(self):
        """
        Duas rodadas de revisão sobre a mesma frase:

        1. (08/09) citava "ThruPlays" sem dizer o que é — jargão puro.
        2. (09/09) passou a dizer "reproduções quase completas do vídeo ...
           pelo menos 15 segundos, ou até 97% dele". A própria frase se
           contradizia: 15s de um vídeo de 2 minutos atendem ao primeiro ramo
           e não são "quase completas". E o limiar não tem fonte conferida —
           o repositório se contradiz e a página primária da Meta não abriu.

        Agora a mensagem aponta o campo do relatório e diz que é uma contagem
        de reproduções com duração mínima definida pela plataforma, sem
        afirmar qual é essa duração.
        """
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, thruplays=100, hold_rate=25.0)
        )
        msg = erros[0].mensagem
        assert "ThruPlays" in msg                      # a pessoa sabe qual campo conferir
        assert "reproduções de vídeo" in msg           # e o que ele conta, em palavras comuns
        # Nenhuma das explicações que o repositório não sustenta:
        for nao_afirmar in ("97%", "15 segundos", "metade", "quase completas", "quase inteiro"):
            assert nao_afirmar not in msg, nao_afirmar

    @pytest.mark.parametrize("campos", [
        ("hook_rate", "video_views_3s"),
        ("hold_rate", "thruplays"),
        ("ctr_link", "link_clicks"),
        ("ctr_all", "all_clicks"),
    ])
    def test_todos_os_pares_baseados_em_impressoes(self, campos):
        taxa, bruto = campos
        erros = validar_consistencia_metricas(
            Metrics(**{"impressions": 1000, bruto: 100, taxa: 50.0})
        )
        assert _campos(erros) == [("impressions", bruto, taxa)]

    def test_par_da_pagina(self):
        erros = validar_consistencia_metricas(
            Metrics(landing_page_views=500, conversions=100, lp_conversion_rate=1.0)
        )
        assert _campos(erros) == [("landing_page_views", "conversions", "lp_conversion_rate")]


# ─────────────────────────────────────────────────────────────────────────────
# Quando a diferença é arredondamento — achado 3 do Codex (2026-09-08 e 09).
#
# Critério, sem constante escolhida a dedo: um número escrito com k casas
# decimais afirma a medição a menos de meia unidade da última casa, e sobre
# isso há o piso de 0,005pp que é a precisão que `_preprocess` produz
# (`round(x, 2)`). Fundamento e limites: metric_consistency.py e a matriz.
# ─────────────────────────────────────────────────────────────────────────────

class TestPrecisaoDeclarada:
    @pytest.mark.parametrize("declarada, casas, meia", [
        (0.4, 1, "0.05"),
        (5.2, 1, "0.05"),
        (0.35, 2, "0.005"),
        (1.64, 2, "0.005"),
        (35.0, 0, "0.5"),      # o JSON entrega um `35` inteiro como float 35.0
        (0.0, 0, "0.5"),
        (14.2857, 4, "0.005"),  # o piso da precisão do produto segura aqui
    ])
    def test_meia_unidade_sai_da_precisao_escrita(self, declarada, casas, meia):
        assert casas_decimais(declarada) == casas
        assert meia_unidade_pp(declarada) == Decimal(meia)

    def test_reproducao_do_codex_uma_casa_decimal(self):
        """1.000 impressões e 50 cliques dão 5% exatos; "5,2" afirma [5,15; 5,25)."""
        assert len(validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=50, ctr_link=5.2)
        )) == 1
        assert validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=50, ctr_link=5.0)
        ) == []

    @pytest.mark.parametrize("declarada", [0.35, 0.45])
    def test_fronteira_simetrica_nos_dois_lados(self, declarada):
        """
        Achado do Codex: 0,35 dava 422 e 0,45 dava 200, ambos a 0,05pp de 0,4.
        A assimetria era do float (|0,35−0,4| = 0,050000000000000003 e
        |0,45−0,4| = 0,049999999999999996); com `Decimal` os dois casos são o
        mesmo caso — e os dois bloqueiam, porque "0,35" afirma [0,345; 0,355).
        """
        assert len(validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=4, ctr_link=declarada)
        )) == 1

    @pytest.mark.parametrize("declarada, bloqueia", [
        (0.4, False),    # exata
        (0.404, False),  # dentro do piso de 0,005pp (precisão do próprio engine)
        (0.406, True),   # fora do piso
        (0.42, True),    # "0,42" afirma [0,415; 0,425): 0,4 está fora
        (0.9, True),     # reprodução original
    ])
    def test_fronteiras_em_taxa_pequena(self, declarada, bloqueia):
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=4, ctr_link=declarada)
        )
        assert bool(erros) is bloqueia

    @pytest.mark.parametrize("declarada, bloqueia", [
        (50.0, False),
        (50.004, False),  # dentro do piso de 0,005pp (precisão do próprio engine)
        (50.5, True),    # "50,5" afirma [50,45; 50,55): 50 está fora
        (55.0, True),
    ])
    def test_fronteiras_em_taxa_grande(self, declarada, bloqueia):
        """500 cliques em 1.000 impressões = 50% exatos."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=500, ctr_link=declarada)
        )
        assert bool(erros) is bloqueia

    def test_numero_inteiro_admite_meia_unidade_inteira(self):
        """
        Referência independente do produto: uma taxa relatada sem casas
        decimais ("35%") não contradiz 35,3% medido — 35 afirma [34,5; 35,5).
        Bloquear isso seria rejeitar arredondamento legítimo de plataforma.
        """
        assert validar_consistencia_metricas(
            Metrics(impressions=1000, thruplays=353, hold_rate=35)
        ) == []
        assert len(validar_consistencia_metricas(
            Metrics(impressions=1000, thruplays=360, hold_rate=35)
        )) == 1

    def test_arredondamento_legitimo_de_uma_casa_passa(self):
        """1,64% (4.100/250.000) declarado como 1,6% é a mesma medição."""
        assert validar_consistencia_metricas(
            Metrics(impressions=250_000, link_clicks=4100, ctr_link=1.6)
        ) == []

    @pytest.mark.parametrize("den", [3, 7, 11, 13, 17, 23, 29, 31, 37, 41, 43, 47, 53, 61, 97])
    def test_a_saida_do_proprio_engine_nunca_e_acusada(self, den):
        """
        Contraprova do piso: para dízimas, a taxa que `_preprocess` derivaria
        (`round(x, 2)`) tem que passar. Se não passasse, a regra estaria
        acusando o número que o próprio produto exibe.
        """
        derivada = round(1 / den * 100, 2)
        assert validar_consistencia_metricas(
            Metrics(impressions=den, link_clicks=1, ctr_link=derivada)
        ) == []

    def test_mensagem_nao_arredonda_a_ponto_de_esconder_a_contradicao(self):
        """Taxa real minúscula não pode virar "0%" justamente na explicação."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=100_000, link_clicks=4, ctr_link=1.0)
        )
        assert "0,004%" in erros[0].mensagem


# ─────────────────────────────────────────────────────────────────────────────
# Precisão da explicação — achado 3 da segunda revisão
# ─────────────────────────────────────────────────────────────────────────────

class TestPrecisaoDaMensagem:
    @pytest.mark.parametrize("taxa", [1e25, 1e26, 1e30, sys.float_info.max])
    @pytest.mark.parametrize("impressions", [0, 100000])
    def test_taxa_grande_rejeitada_com_explicacao_sem_500(self, taxa, impressions):
        # Exercita a mesma formatação em R1 e R2, até o maior float finito.
        contexto = getcontext().copy()
        resposta = analisar_http({
            "impressions": impressions, "link_clicks": 0, "ctr_link": taxa,
        })
        assert resposta.status_code == 422
        mensagem = resposta.json()["detail"]["field_errors"][0]["message"]
        assert "Confira os campos" in mensagem
        assert "Infinity" not in mensagem and "NaN" not in mensagem
        assert len(mensagem) < 2500
        assert getcontext().prec == contexto.prec
        assert getcontext().rounding == contexto.rounding

    def test_formatacao_grande_preserva_valor_e_contexto(self):
        contexto = getcontext().copy()
        assert _fmt_pct(1e30) == "1" + "0" * 30
        assert _fmt_pct(100, 0) == "100"
        assert getcontext().prec == contexto.prec

    """
    A comparação de R1 estava certa e a frase, não: com duas casas fixas,
    1,234% (implícita) e 1,228% (declarada) saíam as duas como "1,23%" — a
    mensagem rejeitava e, na mesma linha, mostrava os dois valores em conflito
    com o mesmo número, além de trocar o valor que a pessoa escreveu por outro.
    Nada aqui muda a REGRA; muda o que a explicação mostra.
    """

    def test_reproducao_do_codex_os_dois_percentuais_aparecem_diferentes(self):
        erros = validar_consistencia_metricas(
            Metrics(impressions=100_000, link_clicks=1234, ctr_link=1.228)
        )
        assert len(erros) == 1
        msg = erros[0].mensagem
        assert "uma taxa de 1,234%" in msg          # a implícita, sem arredondar por cima
        assert "preenchido com 1,228%" in msg       # o declarado, como foi escrito
        assert "1,23%" not in msg                   # o número que confundia os dois

    def test_a_mesma_entrada_continua_sendo_rejeitada_pela_rota(self):
        r = analisar_http({"impressions": 100_000, "link_clicks": 1234, "ctr_link": 1.228})
        assert r.status_code == 422
        detalhe = r.json()["detail"]["field_errors"][0]["message"]
        assert "1,234%" in detalhe and "1,228%" in detalhe

    @pytest.mark.parametrize("declarada", [1.228, 0.4, 35.0, 1.5, 2.25])
    def test_o_valor_declarado_nunca_e_trocado_por_outro(self, declarada):
        """
        A frase pede para conferir o campo e cita o que está nele. Citar um
        número diferente do que a pessoa escreveu inutiliza a orientação.
        """
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=900, ctr_link=declarada)
        )
        escrito = _fmt_pct(declarada, casas_decimais(declarada))
        assert f"preenchido com {escrito}%" in erros[0].mensagem

    def test_taxa_minuscula_nao_vira_zero_na_explicacao(self):
        erros = validar_consistencia_metricas(
            Metrics(impressions=100_000, link_clicks=4, ctr_link=1.0)
        )
        assert "uma taxa de 0,004%" in erros[0].mensagem
        assert "preenchido com 1%" in erros[0].mensagem

    def test_dizima_nao_vira_texto_sem_fim(self):
        """1/3 é dízima; a mensagem mostra o suficiente e para."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=3, link_clicks=1, ctr_link=30.0)
        )
        msg = erros[0].mensagem
        assert "uma taxa de 33,33%" in msg
        assert "33,333" not in msg

    def test_residuo_de_float_nao_vaza_para_a_frase(self):
        """
        Um valor com sujeira de ponto flutuante (o que um arquivo importado
        pode trazer) não pode virar uma tira de dígitos no meio do texto.
        """
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=900, ctr_link=1.1000000000000001)
        )
        msg = erros[0].mensagem
        assert "preenchido com 1,1%" in msg
        assert not re.search(r"\d,\d{11,}", msg)

    @pytest.mark.parametrize("metrics", [
        {"impressions": 100_000, "link_clicks": 1234, "ctr_link": 1.228},
        {"impressions": 1000, "link_clicks": 4, "ctr_link": 0.35},
        {"impressions": 3, "link_clicks": 1, "ctr_link": 30.0},
        {"impressions": 100, "link_clicks": 50, "ctr_link": 0.4},
    ])
    def test_a_frase_nunca_apresenta_os_dois_valores_como_iguais(self, metrics):
        msg = validar_consistencia_metricas(Metrics(**metrics))[0].mensagem
        implicita = re.search(r"uma taxa de ([\d.,]+)%", msg).group(1)
        declarada = re.search(r"preenchido com ([\d.,]+)%", msg).group(1)
        assert implicita != declarada, msg


# ─────────────────────────────────────────────────────────────────────────────
# R2 — entrega zero (a correção do "zero escapa", achado 2 do Codex)
# ─────────────────────────────────────────────────────────────────────────────

class TestR2EntregaZero:
    def test_evento_sem_nenhuma_impressao(self):
        erros = validar_consistencia_metricas(Metrics(impressions=0, video_views_3s=300))
        assert _campos(erros) == [("impressions", "video_views_3s")]
        assert "o anúncio não apareceu nenhuma vez" in erros[0].mensagem

    def test_taxa_sem_nenhuma_impressao(self):
        erros = validar_consistencia_metricas(Metrics(impressions=0, ctr_link=5.0))
        assert _campos(erros) == [("impressions", "ctr_link")]
        assert "base é zero" not in erros[0].mensagem  # linguagem revisada

    def test_taxa_da_pagina_sem_nenhuma_visita(self):
        erros = validar_consistencia_metricas(
            Metrics(landing_page_views=0, lp_conversion_rate=5.0)
        )
        assert _campos(erros) == [("landing_page_views", "lp_conversion_rate")]

    def test_presenca_da_taxa_nao_desativa_a_regra_de_entrega_zero(self):
        """
        O achado 2 do Codex: com o `continue` antigo, acrescentar uma taxa
        concordante fazia a verificação dos brutos ser pulada.
        """
        erros = validar_consistencia_metricas(
            Metrics(impressions=0, video_views_3s=300, hook_rate=0.0)
        )
        assert _campos(erros) == [("impressions", "video_views_3s")]

    def test_zero_com_tudo_zerado_e_valido(self):
        assert validar_consistencia_metricas(
            Metrics(impressions=0, link_clicks=0, ctr_link=0.0)
        ) == []

    def test_conversoes_sem_visita_registrada_nao_e_contradicao(self):
        """
        Atribuição: uma conversão pode ser creditada sem uma visita à página
        registrada na mesma janela. Sem fonte que descarte isso, não bloqueia.
        """
        assert validar_consistencia_metricas(
            Metrics(landing_page_views=0, conversions=5)
        ) == []


# ─────────────────────────────────────────────────────────────────────────────
# Ausência de teto — decisão registrada, não descuido.
#
# A versão anterior bloqueava numerador > denominador alegando que as quatro
# plataformas contam no máximo um evento por impressão. Isso não se sustenta:
# a contagem de cliques/plays não é deduplicada por impressão (o mesmo
# espectador pode clicar duas vezes a partir de uma entrega). Sem fonte que
# garanta o contrário, bloquear seria inventar restrição.
# ─────────────────────────────────────────────────────────────────────────────

class TestSemTetoNaoFundamentado:
    def test_numerador_maior_que_denominador_nao_bloqueia(self):
        assert validar_consistencia_metricas(
            Metrics(impressions=100_000, link_clicks=150_000)
        ) == []

    def test_taxa_acima_de_cem_por_cento_isolada_nao_bloqueia(self):
        assert validar_consistencia_metricas(Metrics(hook_rate=300.0)) == []

    def test_taxa_acima_de_cem_coerente_com_os_brutos_nao_bloqueia(self):
        assert validar_consistencia_metricas(
            Metrics(impressions=100, video_views_3s=300, hook_rate=300.0)
        ) == []

    def test_mas_a_mesma_taxa_incoerente_com_os_brutos_bloqueia(self):
        """A ausência de teto não enfraquece R1: a comparação continua valendo."""
        assert len(validar_consistencia_metricas(
            Metrics(impressions=100, video_views_3s=300, hook_rate=10.0)
        )) == 1


# ─────────────────────────────────────────────────────────────────────────────
# Controles — ausência não é inconsistência
# ─────────────────────────────────────────────────────────────────────────────

class TestControles:
    def test_metrics_vazio(self):
        assert validar_consistencia_metricas(Metrics()) == []

    def test_so_brutos_sem_taxa(self):
        assert validar_consistencia_metricas(
            Metrics(impressions=100_000, link_clicks=50_000)
        ) == []

    def test_so_taxa_sem_brutos(self):
        assert validar_consistencia_metricas(Metrics(ctr_link=1.5)) == []

    def test_campanha_plausivel_sem_falso_positivo(self):
        m = Metrics(
            impressions=250_000, reach=180_000, spend=4200.0,
            video_views_3s=95_000, thruplays=42_000, hook_rate=38.0, hold_rate=16.8,
            link_clicks=4100, ctr_link=1.64, all_clicks=5600, ctr_all=2.24,
            landing_page_views=3800, conversions=112, lp_conversion_rate=2.95,
        )
        assert validar_consistencia_metricas(m) == []

    def test_varios_problemas_saem_juntos(self):
        """Com vários erros, nenhum é escondido — a UI precisa listar todos."""
        erros = validar_consistencia_metricas(
            Metrics(impressions=1000, link_clicks=500, ctr_link=1.0,
                    landing_page_views=200, conversions=100, lp_conversion_rate=1.0)
        )
        assert len(erros) == 2


# ─────────────────────────────────────────────────────────────────────────────
# Integração — análise e rota HTTP
# ─────────────────────────────────────────────────────────────────────────────

class TestBloqueioNaAnalise:
    def test_analyze_campaign_levanta(self):
        with pytest.raises(MetricasInconsistentes):
            analyze_campaign(AnalyzeInput(
                campaign=Campaign(id=1, name="Teste"),
                metrics=Metrics(impressions=100, link_clicks=50, ctr_link=0.4),
                targets=Targets(),
            ))

    def test_rota_responde_422_estruturado_e_nao_chama_a_ia(self):
        with patch("app.service.ai_service.analyze_with_ai") as ia:
            r = analisar_http({"impressions": 100, "link_clicks": 50, "ctr_link": 0.4})
            ia.assert_not_called()

        assert r.status_code == 422
        detail = r.json()["detail"]
        assert "contradições" in detail["message"]
        erro = detail["field_errors"][0]
        assert erro["fields"] == ["impressions", "link_clicks", "ctr_link"]
        assert "uma taxa de 50%" in erro["message"]

    def test_reproducoes_do_codex_pela_rota(self):
        """Os cinco casos citados na revisão, com o comportamento revisado."""
        assert analisar_http({"impressions": 0, "video_views_3s": 300}).status_code == 422
        assert analisar_http({"impressions": 0, "ctr_link": 5}).status_code == 422
        assert analisar_http(
            {"impressions": 1000, "link_clicks": 4, "ctr_link": 0.9}
        ).status_code == 422
        # Sem teto fundamentado, estes dois passam — por decisão registrada.
        assert analisar_http({"impressions": 100, "video_views_3s": 300}).status_code == 200
        assert analisar_http({"hook_rate": 300}).status_code == 200

    def test_dados_validos_continuam_200(self):
        r = analisar_http({"impressions": 100_000, "link_clicks": 1500, "ctr_link": 1.5})
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# Fronteira de GRAVAÇÃO — achado 1 do Codex (persistência contornava P5) e
# achado 2 (validação estourando 500 com valor não hashable).
#
# Contrato, fundamento e limites: app/service/campaign_payload.py.
# ─────────────────────────────────────────────────────────────────────────────

# `CampaignVM` como `responseToVM` (lib/adapt.ts) o produz: receita é
# `Math.round(invest × roasNum)` = round(1500 × 3) = 4500.
VM_VALIDA = {
    "id": 1000, "name": "Campanha real", "platform": "Meta Ads",
    "status": "GREEN", "score": 88, "invest": 1500.0, "revenue": 4500,
    "roasNum": 3.0, "cpaNum": 42.5, "ctrNum": 1.64, "freqNum": 1.39,
    "maxFrequencyFatigue": 2.8,
    "m1": {"k": "CPA", "v": "R$ 42,50"}, "m2": {"k": "CTR Link", "v": "1,64%"},
    "spark": [88, 88, 88, 88, 88, 88, 88], "trend": 0,
    "ai": "", "summary": "resumo", "opportunity": "op", "primaryAction": "ação",
    "tiles": [], "scenarios": [], "actions": [], "sugg": [],
    "coverage": 80, "confidence": "high", "hasAI": False,
    "aiInsights": [], "aiRisks": [],
}

# Sentinela para "esta chave não vem no payload" — `None` é valor legítimo em
# roasNum/cpaNum/ctrNum/freqNum, então não serve para pedir remoção.
SEM = object()


def vm(**mudancas) -> dict:
    """`VM_VALIDA` com alterações; `SEM` remove a chave."""
    saida = {**VM_VALIDA, **mudancas}
    return {k: v for k, v in saida.items() if v is not SEM}


class TestContratoDeGravacao:
    @pytest.fixture
    def base(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "DB_PATH", str(tmp_path / "p5.db"))
        monkeypatch.setattr(storage, "_iniciado", False)
        yield tmp_path / "p5.db"
        monkeypatch.setattr(storage, "_iniciado", False)

    DONO = {"X-Nex-Dono": "review-p5"}

    def gravar(self, payload, **extra):
        return client.post(
            "/api/v1/campaigns", json={"payload": payload, **extra}, headers=self.DONO
        )

    def salvas(self):
        return client.get("/api/v1/campaigns", headers=self.DONO).json()["campanhas"]

    # ── o contorno reproduzido pelo Codex, nas duas versões ───────────────

    def test_reproducao_de_2026_09_08_e_rejeitada_sem_gravar_nada(self, base):
        """Métricas contraditórias embrulhadas num objeto que não é campanha."""
        r = self.gravar({"name": "Revisao P5", "input": {
            "campaign": {"id": 1, "name": "Revisao P5"},
            "metrics": {"impressions": 100, "link_clicks": 50, "ctr_link": 0.4},
            "targets": {},
        }})
        assert r.status_code == 422
        assert self.salvas() == []

    def test_reproducao_de_2026_09_09_e_rejeitada_sem_gravar_nada(self, base):
        """
        A mesma coisa com `name`/`status`/`score` por cima — o corpo que
        passava pela primeira correção, que só olhava esses três campos.
        """
        r = self.gravar({"name": "Review", "status": "GREEN", "score": 88, "input": {
            "campaign": {"id": 1, "name": "Review"},
            "metrics": {"impressions": 100, "link_clicks": 50, "ctr_link": 0.4},
            "targets": {},
        }})
        assert r.status_code == 422
        assert "'input'" in r.json()["detail"]
        assert self.salvas() == []

    def test_aparencia_de_analise_nao_basta(self, base):
        """Os três campos da correção anterior, sozinhos, não são uma campanha."""
        r = self.gravar({"name": "Review", "status": "GREEN", "score": 88})
        assert r.status_code == 422
        assert self.salvas() == []

    # ── fluxo legítimo, criação e atualização ─────────────────────────────

    def test_campanha_do_dashboard_grava(self, base):
        assert self.gravar(VM_VALIDA).status_code == 200
        assert len(self.salvas()) == 1

    def test_campos_de_sincronizacao_do_dashboard_sao_aceitos(self, base):
        """
        Reenvio/sincronização: o VM que sobe pelo laço de sync carrega
        `clientId`, `serverId`, `benchmarks` e avisos — todos parte do formato.
        """
        r = self.gravar(
            vm(clientId="cli-1", serverId=7, syncAviso="tentando de novo",
               benchmarks=[{
                   "metric": "CTR Link", "value": 1.2, "fonte": "Relatório X",
                   "fonte_url": "https://exemplo.invalid/ctr",
                   "capturado_em": "2026-09-01T00:00:00Z",
               }]),
            client_id="cli-1",
        )
        assert r.status_code == 200

    def test_atualizacao_tambem_passa_pelo_contrato(self, base):
        criada = self.gravar(VM_VALIDA).json()["id"]
        r = self.gravar({"name": "so isso"}, id=criada)
        assert r.status_code == 422
        # A campanha original continua intacta: rejeição não é gravação parcial.
        assert self.salvas()[0]["payload"]["name"] == "Campanha real"

    def test_reenvio_com_o_mesmo_client_id_continua_atualizando(self, base):
        primeiro = self.gravar(vm(clientId="c-1"), client_id="c-1").json()["id"]
        segundo = self.gravar(vm(clientId="c-1", score=91), client_id="c-1").json()["id"]
        assert primeiro == segundo
        assert len(self.salvas()) == 1

    # ── contornos por omissão e por deformação ────────────────────────────

    @pytest.mark.parametrize("payload", [
        vm(id=SEM),                        # obrigatório ausente
        vm(name=SEM),
        vm(platform=SEM),
        vm(status=SEM),
        vm(score=SEM),
        vm(invest=SEM),
        vm(revenue=SEM),
        vm(name="   "),                    # texto vazio
        vm(status="INVENTADO"),
        vm(score=101),
        vm(score=-1),
        vm(score="alto"),
        vm(score=True),                    # bool não é número
        vm(id=True),
        vm(id=0),
        vm(invest=-1),
        vm(coverage=101),
        vm(confidence="altíssima"),
        vm(spark=[88, "oito"]),
        vm(m1={"k": "CPA"}),
        vm(roasNum="três"),
        vm(tiles={"nao": "e lista"}),
        vm(extra_inventado=1),             # chave fora do formato
    ])
    def test_omissao_ou_deformacao_e_rejeicao_nao_contorno(self, base, payload):
        assert self.gravar(payload).status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("payload", [
        vm(revenue=999999),                         # receita que não vem de invest × roas
        vm(revenue=5000, invest=0.0, roasNum=None),  # receita sem investimento
        vm(revenue=5000, roasNum=None),              # receita sem ROAS que a produza
        vm(revenue=5000, roasNum=SEM),               # ... e sem o campo, que é o contorno
    ])
    def test_receita_incoerente_com_investimento_e_roas_e_rejeitada(self, base, payload):
        """
        A derivação que o formato guarda: `revenue = round(invest × roasNum)`
        (lib/adapt.ts; o tile mostra "spend × ROAS"). Omitir `roasNum` para
        declarar receita à vontade é contorno, não ausência legítima.
        """
        r = self.gravar(payload)
        assert r.status_code == 422
        assert "revenue" in r.json()["detail"]
        assert self.salvas() == []

    @pytest.mark.parametrize("payload", [
        vm(revenue=0, invest=0.0, roasNum=None),   # sem gasto, sem receita
        vm(revenue=0, invest=10.0, roasNum=0.04),  # round(0,4) = 0
        vm(revenue=4500, invest=1500.0, roasNum=3.0),
        vm(revenue=4500, invest=1499.9, roasNum=3.0),  # folga do arredondamento
    ])
    def test_receita_coerente_continua_passando(self, base, payload):
        assert self.gravar(payload).status_code == 200

    # ── achado 2: nunca 500 ───────────────────────────────────────────────

    @pytest.mark.parametrize("status", [[], {}, 0, None, True])
    def test_status_de_outro_tipo_da_422_e_nao_500(self, base, status):
        """
        `status not in {...}` estourava com lista/dict (não hashable) e virava
        HTTP 500. Tipo é conferido antes de qualquer comparação de valor.
        """
        cliente = TestClient(app, raise_server_exceptions=False)
        r = cliente.post(
            "/api/v1/campaigns", json={"payload": {**VM_VALIDA, "status": status}},
            headers=self.DONO,
        )
        assert r.status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("campo", ["m1", "spark", "tiles", "confidence", "roasNum",
                                       "id", "score", "invest", "revenue", "clientId"])
    def test_nenhum_campo_deformado_derruba_o_servidor(self, base, campo):
        cliente = TestClient(app, raise_server_exceptions=False)
        for valor in ([], {}, "texto", 0, True, None, [1, 2], {"k": 1}):
            r = cliente.post(
                "/api/v1/campaigns", json={"payload": {**VM_VALIDA, campo: valor}},
                headers=self.DONO,
            )
            assert r.status_code in (200, 422), (campo, valor, r.status_code)

    # ── compatibilidade ───────────────────────────────────────────────────

    def test_leitura_de_campanha_legada_e_preservada(self, base):
        """
        Linhas gravadas ANTES deste contrato continuam sendo devolvidas por
        GET — a regra vale para escrita nova, não reescreve, migra nem esconde
        o que já está na base.
        """
        self.gravar(VM_VALIDA)
        legada = json.dumps({"name": "legada sem formato", "qualquer": [1, 2]})
        with sqlite3.connect(base) as conn:
            conn.execute(
                "INSERT INTO campanhas (payload, dono, criado_em, atualizado_em)"
                " VALUES (?, 'review-p5', '2026-01-01', '2026-01-01')",
                (legada,),
            )
            conn.commit()

        nomes = {c["payload"]["name"] for c in self.salvas()}
        assert nomes == {"Campanha real", "legada sem formato"}

    def test_toda_chave_do_campaign_vm_e_conhecida(self):
        """
        A lista fechada do backend tem que ser exatamente a interface do
        dashboard. Sem esta conferência, um campo novo no VM viraria 422 na
        gravação (ou, pior, um campo removido continuaria aceito) sem ninguém
        perceber até alguém perder uma campanha.
        """
        types_ts = Path("../../frontend/nexgestor-dashboard/src/types.ts")
        if not types_ts.exists():
            pytest.skip("checkout sem o dashboard")
        corpo = re.search(
            r"export interface CampaignVM \{(.*?)\n\}",
            types_ts.read_text(encoding="utf-8"), re.S,
        )
        assert corpo, "interface CampaignVM não encontrada em types.ts"
        do_vm = set(re.findall(r"^  ([A-Za-z0-9_]+)\??:", corpo.group(1), re.M))
        assert do_vm == _CHAVES_CONHECIDAS

# ─────────────────────────────────────────────────────────────────────────────
# Forma dos blocos e números impossíveis — achados 1 e 2 da segunda revisão
# ─────────────────────────────────────────────────────────────────────────────

# O MESMO objeto que o dashboard usa em
# `src/test/components/CampaignVM.contrato.test.tsx`, onde um teste confere que
# ele é exatamente o que `responseToVM` produz e que ele renderiza. Aqui prova o
# outro lado: esse VM real, com todos os blocos preenchidos, grava e relê. Uma
# fixture de listas vazias não provaria nada sobre a validação de itens.
_FIXTURE_VM_REAL = Path(
    "../../frontend/nexgestor-dashboard/src/test/fixtures/campaignVMReal.json"
)


def vm_real() -> dict:
    if not _FIXTURE_VM_REAL.exists():
        pytest.skip("checkout sem o dashboard")
    return json.loads(_FIXTURE_VM_REAL.read_text(encoding="utf-8"))


class TestFormaDosBlocos:
    """
    Conferir só "é uma lista" não fechava a fronteira: `tiles: [null]` era
    gravado, devolvido pelo GET e derrubava a tela da campanha
    (`MetricFeed.tsx` faz `c.tiles.map(canonico)`, e `canonico` lê `t[0]`).
    """

    @pytest.fixture
    def base(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "DB_PATH", str(tmp_path / "p5.db"))
        monkeypatch.setattr(storage, "_iniciado", False)
        yield tmp_path / "p5.db"
        monkeypatch.setattr(storage, "_iniciado", False)

    DONO = {"X-Nex-Dono": "review-p5"}

    def gravar(self, payload, **extra):
        return client.post(
            "/api/v1/campaigns", json={"payload": payload, **extra}, headers=self.DONO
        )

    def salvas(self):
        return client.get("/api/v1/campaigns", headers=self.DONO).json()["campanhas"]

    def test_vm_real_completo_salva_e_rele_identico(self, base):
        vm = vm_real()
        assert self.gravar(vm).status_code == 200
        salvas = self.salvas()
        assert len(salvas) == 1
        assert salvas[0]["payload"] == vm

    @pytest.mark.parametrize("chave", [
        "id", "name", "platform", "status", "score", "invest", "revenue",
        "roasNum", "cpaNum", "ctrNum", "freqNum", "m1", "m2", "spark",
        "trend", "ai", "summary", "opportunity", "primaryAction", "tiles",
        "scenarios", "actions", "sugg",
    ])
    def test_omitir_obrigatorio_do_vm_real_nao_grava(self, base, chave):
        payload = vm_real()
        payload.pop(chave)
        resposta = self.gravar(payload)
        assert resposta.status_code == 422
        assert chave in resposta.json()["detail"]
        assert self.salvas() == []

    def test_opcionais_ausentes_e_metricas_nulas_continuam_validos(self, base):
        payload = vm_real()
        for chave in ("maxFrequencyFatigue", "coverage", "confidence", "hasAI",
                      "aiInsights", "aiRisks", "benchmarks", "serverId",
                      "clientId", "syncFalhouPermanente", "syncAviso"):
            payload.pop(chave, None)
        payload.update(roasNum=None, cpaNum=None, ctrNum=None, freqNum=None, revenue=0)
        assert self.gravar(payload).status_code == 200
        assert self.salvas()[0]["payload"] == payload

    def test_reproducao_do_tile_null(self, base):
        """O corpo exato da revisão: 200 e `tiles:[null]` de volta no GET."""
        r = self.gravar({**VM_VALIDA, "tiles": [None]})
        assert r.status_code == 422
        assert "tiles[0]" in r.json()["detail"]
        assert self.salvas() == []

    @pytest.mark.parametrize("tiles", [
        [None],
        ["texto no lugar do tile"],
        [{"label": "CPA"}],
        [[]],                                                  # curto demais
        [["CPA", "R$ 1", "cor"]],                              # 3 posições
        [["CPA", "R$ 1", "cor", "nota", "gestor", 30, "extra"]],  # 7 posições
        [[1, "R$ 1", "cor", "nota"]],                          # rótulo não é texto
        [["CPA", "R$ 1", "cor", None]],                        # nota não é texto
        [["CPA", "R$ 1", "cor", "nota", "inventada"]],         # origem fora da lista
        [["CPA", "R$ 1", "cor", "nota", []]],                  # origem não hashable
        [["CPA", "R$ 1", "cor", "nota", "gestor", "alto"]],    # score não numérico
        [["CPA", "R$ 1", "cor", "nota", "gestor", 101]],       # score fora de 0–100
        [["CPA", "R$ 1", "cor", "nota", "gestor", True]],      # bool não é score
    ])
    def test_tile_deformado_e_rejeitado_sem_gravar(self, base, tiles):
        assert self.gravar({**VM_VALIDA, "tiles": tiles}).status_code == 422
        assert self.salvas() == []

    _CENARIO = {"code": "A", "title": "t", "root_cause": "c",
                "funnel_impact": "f", "action": "a", "priority": 1}
    _ACAO = {"title": "t", "prio": "Alta", "why": "p", "impact": "i"}
    _SUGESTAO = {"name": "n", "impact": "i", "effort": "Imediato", "urgency": "Baixa"}
    _INSIGHT = {"title": "t", "explanation": "e"}
    _RISCO = {"title": "t", "explanation": "e", "timeframe": "48h"}
    _BENCHMARK = {"metric": "CTR Link", "value": 1.2, "fonte": "F",
                  "fonte_url": "https://exemplo.invalid", "capturado_em": "2026-09-01"}

    @pytest.mark.parametrize("bloco, item", [
        # item que não é objeto
        ("scenarios", None),
        ("scenarios", "texto"),
        ("actions", None),
        ("sugg", None),
        ("aiInsights", None),
        ("aiRisks", None),
        ("benchmarks", None),
        # campo obrigatório ausente
        ("scenarios", {k: v for k, v in _CENARIO.items() if k != "priority"}),
        ("scenarios", {k: v for k, v in _CENARIO.items() if k != "code"}),
        ("actions", {k: v for k, v in _ACAO.items() if k != "prio"}),
        ("sugg", {k: v for k, v in _SUGESTAO.items() if k != "name"}),
        ("aiInsights", {"title": "só o título"}),
        ("aiRisks", {k: v for k, v in _RISCO.items() if k != "timeframe"}),
        ("benchmarks", {k: v for k, v in _BENCHMARK.items() if k != "value"}),
        # campo que não existe no bloco (contorno por formato)
        ("scenarios", {**_CENARIO, "metrics": {"impressions": 100, "ctr_link": 0.4}}),
        ("aiInsights", {**_INSIGHT, "input": {"metrics": {}}}),
        # tipo/faixa errados no que a UI consome sem defesa
        ("scenarios", {**_CENARIO, "priority": 9}),      # PRIO[9] é undefined → TypeError
        ("scenarios", {**_CENARIO, "priority": "Alta"}),
        ("scenarios", {**_CENARIO, "priority": []}),     # não hashable
        ("scenarios", {**_CENARIO, "title": 42}),
        ("actions", {**_ACAO, "prio": "Urgentíssima"}),  # PA_COLOR[...] → TypeError
        ("actions", {**_ACAO, "prio": {}}),
        ("sugg", {**_SUGESTAO, "urgency": "qualquer"}),
        ("aiRisks", {**_RISCO, "timeframe": 48}),
        ("benchmarks", {**_BENCHMARK, "value": "1,2"}),
    ])
    def test_item_de_bloco_deformado_e_rejeitado_sem_gravar(self, base, bloco, item):
        assert self.gravar({**VM_VALIDA, bloco: [item]}).status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("bloco, item", [
        ("scenarios", _CENARIO),
        ("actions", _ACAO),
        ("sugg", _SUGESTAO),
        ("aiInsights", _INSIGHT),
        ("aiRisks", _RISCO),
        ("benchmarks", _BENCHMARK),
    ])
    def test_item_bem_formado_continua_passando(self, base, bloco, item):
        assert self.gravar({**VM_VALIDA, bloco: [item]}).status_code == 200

    @pytest.mark.parametrize("tiles", [
        [["Investimento", "R$ 4.200", "var(--txt)", "período informado"]],   # 4 posições
        [["ROAS", "2,4x", "var(--txt-3)", "Sem meta.", "ausente"]],          # 5 posições
        [["CTR Link", "1,6%", "var(--green)", "Saudável.", "sistema", 90]],  # 6 posições
        [["CPA", "R$ 1", "cor", "nota", "gestor", 0]],                       # score no piso
        [["CPA", "R$ 1", "cor", "nota", "gestor", 100]],                     # score no teto
    ])
    def test_as_tres_formas_reais_de_tile_continuam_passando(self, base, tiles):
        assert self.gravar({**VM_VALIDA, "tiles": tiles}).status_code == 200

    def test_leitura_de_legado_fora_do_formato_continua_intacta(self, base):
        """
        A regra é de ESCRITA. Uma linha antiga com `tiles:[null]` — gravada
        quando isso passava — continua sendo devolvida pelo GET; nada é
        migrado nem apagado. Quem consome dado assim é o cliente, e o
        dashboard trata 422 no reenvio como falha permanente, com aviso, em
        vez de retentar em silêncio (`salvarCampanha`, lib/api.ts).
        """
        self.gravar(VM_VALIDA)
        with sqlite3.connect(base) as conn:
            conn.execute(
                "INSERT INTO campanhas (payload, dono, criado_em, atualizado_em)"
                " VALUES (?, 'review-p5', '2026-01-01', '2026-01-01')",
                (json.dumps({"name": "legada com tile null", "tiles": [None]}),),
            )
            conn.commit()
        payloads = [c["payload"] for c in self.salvas()]
        assert {"name": "legada com tile null", "tiles": [None]} in payloads


class TestNumeroImpossivel:
    """
    Achado 2: `math.isfinite` sobre um int arbitrário do JSON converte para
    float e estoura. `score = 10**400` — 401 dígitos, corpo de poucas centenas
    de bytes — virava HTTP 500. Nada disso é carga grande ou esgotamento de
    recurso: é um valor que o formato não representa.
    """

    @pytest.fixture
    def base(self, tmp_path, monkeypatch):
        monkeypatch.setattr(settings, "DB_PATH", str(tmp_path / "p5.db"))
        monkeypatch.setattr(storage, "_iniciado", False)
        yield tmp_path / "p5.db"
        monkeypatch.setattr(storage, "_iniciado", False)

    DONO = {"X-Nex-Dono": "review-p5"}
    ENORME = 10 ** 400

    def gravar(self, payload):
        cliente = TestClient(app, raise_server_exceptions=False)
        return cliente.post(
            "/api/v1/campaigns", json={"payload": payload}, headers=self.DONO
        )

    def salvas(self):
        return client.get("/api/v1/campaigns", headers=self.DONO).json()["campanhas"]

    def test_reproducao_do_codex_score_com_401_digitos(self, base):
        r = self.gravar({**VM_VALIDA, "score": self.ENORME, "tiles": []})
        assert r.status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("campo", [
        "id", "score", "invest", "revenue", "roasNum", "cpaNum", "ctrNum",
        "freqNum", "maxFrequencyFatigue", "coverage", "trend", "serverId",
    ])
    def test_todo_campo_numerico_rejeita_o_inteiro_enorme(self, base, campo):
        """`id`/`serverId` param em 2^53−1 (identidade no cliente); os demais,
        no maior número que o formato representa. Ver campaign_payload.py."""
        for valor in (self.ENORME, -self.ENORME):
            r = self.gravar({**VM_VALIDA, campo: valor})
            assert r.status_code == 422, (campo, r.status_code)
        assert self.salvas() == []

    @pytest.mark.parametrize("payload", [
        {"spark": [10 ** 400]},
        {"tiles": [["CPA", "R$ 1", "cor", "nota", "gestor", 10 ** 400]]},
        {"benchmarks": [{"metric": "CTR Link", "value": 10 ** 400, "fonte": "F",
                         "fonte_url": "https://exemplo.invalid", "capturado_em": "2026-09-01"}]},
    ])
    def test_inteiro_enorme_dentro_dos_blocos_tambem_da_422(self, base, payload):
        assert self.gravar({**VM_VALIDA, **payload}).status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("token", ["Infinity", "-Infinity", "NaN"])
    def test_nao_finito_continua_rejeitado(self, base, token):
        """
        `Infinity`/`NaN` não são JSON válido, mas o parser do Python os aceita
        — então eles CHEGAM, e o corpo precisa ser montado cru (o encoder do
        cliente de teste se recusa a produzi-los).
        """
        corpo = json.dumps({"payload": VM_VALIDA}).replace('"invest": 1500.0', f'"invest": {token}')
        assert token in corpo
        cliente = TestClient(app, raise_server_exceptions=False)
        r = cliente.post(
            "/api/v1/campaigns", content=corpo,
            headers={**self.DONO, "Content-Type": "application/json"},
        )
        assert r.status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("campo", ["score", "invest", "revenue", "trend", "coverage"])
    def test_booleano_continua_nao_sendo_numero(self, base, campo):
        for valor in (True, False):
            assert self.gravar({**VM_VALIDA, campo: valor}).status_code == 422
        assert self.salvas() == []

    @pytest.mark.parametrize("campo", ["id", "serverId"])
    def test_identificador_acima_do_inteiro_exato_do_formato_e_rejeitado(self, base, campo):
        """2^53 já não volta igual pelo cliente; 2^53−1 ainda volta."""
        assert self.gravar({**VM_VALIDA, campo: 2 ** 53}).status_code == 422
        assert self.gravar({**VM_VALIDA, campo: 2 ** 53 - 1}).status_code == 200

    def test_numero_grande_mas_representavel_continua_passando(self, base):
        """
        O limite é o do formato (double), não um teto inventado para gasto:
        uma campanha com investimento absurdo mas representável não é assunto
        desta fronteira.
        """
        r = self.gravar({**VM_VALIDA, "invest": 10 ** 12, "revenue": 0,
                         "roasNum": None, "cpaNum": None})
        assert r.status_code == 200
