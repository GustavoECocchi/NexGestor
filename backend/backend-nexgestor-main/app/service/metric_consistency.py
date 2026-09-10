"""
Consistência entre métricas brutas e taxas informadas (P5).

Matriz de regras, fundamento e limites: `docs/sessions/2026-09-09.md`, seção
"Continuidade — P5 corrigido: matriz revisada". Resumo:

  R1 — a taxa informada não pode ser um arredondamento da taxa implícita
       pelos brutos informados. Fundamento: a fórmula de cada taxa está no
       contrato aprovado (`docs/CONTRATO_API_FRONTEND.md`, "Métricas deriváveis
       automaticamente"), não só na implementação de `_preprocess`; o critério
       de "arredondamento" sai da precisão escrita no próprio valor declarado
       e da precisão que o produto produz (ver o bloco de comentário abaixo).
  R2 — o anúncio não foi entregue nenhuma vez (denominador informado como 0),
       mas há eventos ou taxa acima de zero. Fundamento: um evento de
       visualização/clique exige ao menos uma entrega, e uma taxa sobre base
       zero não é uma razão definida.

NÃO existe regra de teto (numerador ≤ denominador, taxa ≤ 100%). A versão
anterior tinha uma; foi removida por falta de fundamento verificável: as
contagens de evento das plataformas não são deduplicadas por impressão (o
mesmo espectador pode gerar vários cliques a partir de uma entrega), então
numerador > denominador não é, por si, impossível. Ver a matriz revisada
para o limite exato que isso deixa em aberto.

As duas regras são independentes: a presença de uma taxa nunca desativa a
verificação de entrega zero, e vice-versa.
"""
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, localcontext

from app.schema.schema import Metrics

# ─────────────────────────────────────────────────────────────────────────────
# Quando uma diferença é arredondamento e quando é contradição (R1)
#
# A comparação NÃO usa um limite escolhido a dedo: usa a precisão que o próprio
# valor declarado carrega. Um número escrito com k casas decimais afirma que a
# medição está a menos de meia unidade da última casa — é a definição de
# arredondamento decimal, não uma suposição sobre plataforma de anúncio.
# "0,4" afirma [0,35; 0,45); "5,2" afirma [5,15; 5,25); "35" afirma [34,5; 35,5).
#
# Sobre isso há UM piso, e ele também é medido, não escolhido: `_preprocess`
# (app/service/service.py) arredonda toda taxa derivada para 2 casas decimais
# — comportamento documentado em docs/CONTRATO_API_FRONTEND.md, "Métricas
# deriváveis automaticamente". Um valor produzido pelo próprio produto pode,
# portanto, estar a até 0,005pp da taxa exata. Exigir mais precisão que essa
# faria a regra acusar a saída do próprio engine.
#
# Consequências verificáveis (as duas reproduções do Codex, 2026-09-09):
#   • 1.000 impressões, 50 cliques (5% exato) e CTR declarado 5,2 → BLOQUEIA:
#     "5,2" afirma [5,15; 5,25), e 5 está fora. Antes passava.
#   • 1.000 impressões, 4 cliques (0,4% exato) com 0,35 e com 0,45 → os DOIS
#     bloqueiam, simetricamente. Antes 0,35 dava 422 e 0,45 dava 200 por
#     acidente de ponto flutuante (|0,35−0,4| vira 0,050000000000000003 e
#     |0,45−0,4| vira 0,049999999999999996 em float64).
#
# A estabilidade numérica vem de `Decimal`: `repr()` de um float devolve a
# menor representação decimal que faz round-trip, então `Decimal(repr(0.35))`
# é exatamente 0,35 — e a subtração passa a ser decimal exata, sem o viés que
# tornava a fronteira assimétrica. `normalize()` descarta zeros à direita, de
# modo que 35,0 (como o JSON entrega um `35` inteiro) conta 0 casas, e não 1.
# Limite conhecido: zeros à direita digitados ("0,40") se perdem antes daqui —
# são lidos como 1 casa, tolerância maior que a escrita. Erra para o lado de
# aceitar, que é o lado exigido (só bloquear o demonstrável).
# ─────────────────────────────────────────────────────────────────────────────

# Metade da última casa de um percentual com 2 decimais — a precisão que
# `_preprocess` produz. Ver bloco acima.
MEIA_UNIDADE_MINIMA_PP = Decimal("0.005")


def casas_decimais(valor: float) -> int:
    """Casas decimais efetivamente escritas: 0,4 -> 1; 5,25 -> 2; 35,0 -> 0."""
    expoente = Decimal(repr(float(valor))).normalize().as_tuple().exponent
    return max(0, -int(expoente))


def meia_unidade_pp(declarada: float) -> Decimal:
    """
    Maior diferença, em pontos percentuais, que ainda pode ser arredondamento
    do valor declarado — e não contradição com os brutos.
    """
    return max(Decimal(1).scaleb(-casas_decimais(declarada)) / 2, MEIA_UNIDADE_MINIMA_PP)


def taxa_implicita_pp(numerador: float, denominador: float) -> Decimal:
    """Taxa que os brutos informados implicam, em decimal exato."""
    return Decimal(str(numerador)) / Decimal(str(denominador)) * 100


def contradiz_os_brutos(declarada: float, numerador: float, denominador: float) -> bool:
    """R1: o valor declarado não pode ser um arredondamento da taxa implícita."""
    implicita = taxa_implicita_pp(numerador, denominador)
    return abs(Decimal(repr(float(declarada))) - implicita) > meia_unidade_pp(declarada)


@dataclass(frozen=True)
class ErroConsistenciaMetrica:
    campos: list[str]
    mensagem: str


def _fmt_int(v: float) -> str:
    """1234 -> '1.234' (separador de milhar pt-BR)."""
    return f"{round(v):,}".replace(",", ".")


# Teto de casas na mensagem. Existe por dois motivos opostos: não deixar o
# texto crescer sem limite, e cortar resíduo de float (0.30000000000000004
# vira "0,3", não uma tira de dígitos).
_MAX_CASAS_NA_MENSAGEM = 10


def _casas_para_nao_sumir(v: float) -> int:
    """Casas necessárias para uma taxa minúscula não aparecer como '0'."""
    casas = 2
    while casas < _MAX_CASAS_NA_MENSAGEM and v != 0 and abs(v) < 10 ** -(casas - 1):
        casas += 1
    return casas


def _arredonda(d: Decimal, casas: int) -> Decimal:
    # Quantize precisa acomodar também a parte inteira (1e30 com duas casas
    # exige 33 dígitos). Reservar mais um para eventual transporte, como 9,99
    # arredondado para 10. O contexto é local: não altera a comparação de R1.
    with localcontext() as contexto:
        contexto.prec = max(contexto.prec, d.adjusted() + 1 + casas + 1)
        return d.quantize(Decimal(1).scaleb(-casas), rounding=ROUND_HALF_UP)


def _casas_para_distinguir(declarada: float, implicita: Decimal) -> int:
    """
    Casas que a mensagem precisa mostrar para não mentir sobre os dois valores.

    Duas exigências ao mesmo tempo:

      1. **Repetir o declarado como foi escrito.** Dizer "o campo está
         preenchido com 1,23%" quando a pessoa escreveu 1,228 troca o valor
         dela por outro na frase que pede para conferir esse mesmo campo.
      2. **Não apresentar os dois valores em conflito como se fossem iguais.**
         Com duas casas fixas, 1,234% (implícita) e 1,228% (declarada) saíam
         as duas como "1,23%": a mensagem rejeitava e, na mesma frase, exibia
         a taxa calculada e a informada com o mesmo número.

    Nada disso muda a comparação de R1 — só o que a explicação mostra.
    """
    d = Decimal(repr(float(declarada)))
    casas = max(
        casas_decimais(declarada),
        _casas_para_nao_sumir(declarada),
        _casas_para_nao_sumir(float(implicita)),
    )
    while casas < _MAX_CASAS_NA_MENSAGEM and _arredonda(d, casas) == _arredonda(implicita, casas):
        casas += 1
    return min(casas, _MAX_CASAS_NA_MENSAGEM)


def _fmt_pct(v, casas: int | None = None) -> str:
    """
    Percentual em pt-BR, sem zeros à direita e sem esconder a contradição.

    `casas` fixa a precisão (ver `_casas_para_distinguir`); sem ela, mostra o
    valor com a precisão que ele mesmo tem, garantindo que uma taxa minúscula
    não vire "0%" justamente na mensagem que explica a diferença.

    Formata em `Decimal` para não trazer resíduo de float para a frase.
    """
    d = v if isinstance(v, Decimal) else Decimal(repr(float(v)))
    if casas is None:
        casas = min(
            max(casas_decimais(float(d)), _casas_para_nao_sumir(float(d))),
            _MAX_CASAS_NA_MENSAGEM,
        )
    texto = f"{_arredonda(d, casas):f}"
    if "." in texto:
        texto = texto.rstrip("0").rstrip(".")
    if texto in ("", "-", "-0"):
        texto = "0"
    return texto.replace(".", ",")


def _proporcao_legivel(percentual: float) -> tuple[str, str]:
    """
    Traduz um percentual em "quantidade" e "a cada N", achando a menor base
    (100, 1.000, 10.000, 100.000) que dá uma quantidade inteira. Sem base
    redonda, devolve a quantidade com decimais sobre 100.
    """
    for base in (100, 1_000, 10_000, 100_000):
        n = percentual / 100 * base
        if abs(n - round(n)) < 1e-9 and round(n) >= 1:
            return _fmt_int(round(n)), _fmt_int(base)
    return _fmt_pct(percentual), "100"


@dataclass(frozen=True)
class _ParTaxa:
    campo_taxa: str
    campo_numerador: str
    campo_denominador: str
    rotulo_taxa: str        # rótulo do campo-taxa, como aparece no formulário
    rotulo_num: str         # rótulo do campo bruto numerador
    rotulo_den: str         # rótulo do campo bruto denominador
    nome_taxa: str          # como chamar a taxa em palavras comuns
    evento_num: str         # o que o numerador conta, em palavras comuns
    quantificador: str      # "quantos"/"quantas", concordando com evento_num
    evento_den: str         # o que o denominador conta ("o anúncio apareceu")
    evento_den_negado: str  # o mesmo na negativa ("o anúncio não apareceu")
    # Explicação do evento, entre parênteses, na primeira vez que ele aparece
    # na frase. Vazia quando o nome do evento já é comum o bastante.
    glosa: str
    # False para lp_conversion_rate: uma conversão pode ser atribuída sem uma
    # visita à página registrada (atribuição por visualização), então
    # "conversões com 0 visitas" não é contradição demonstrável.
    evento_exige_denominador: bool


_PARES: list[_ParTaxa] = [
    _ParTaxa(
        "hook_rate", "video_views_3s", "impressions",
        "Hook rate (%)", "Visualizações de 3s", "Impressões",
        "taxa de visualizações de pelo menos 3 segundos",
        "visualizações de pelo menos 3 segundos", "quantas",
        "o anúncio apareceu", "o anúncio não apareceu",
        glosa="",
        evento_exige_denominador=True,
    ),
    _ParTaxa(
        # ThruPlay: o que a mensagem pode afirmar e o que não pode.
        #
        # A versão anterior chamava esses eventos de "reproduções quase
        # completas do vídeo" e explicava a condição como "pelo menos 15
        # segundos, ou até 97% dele". A própria redação se contradizia: 15
        # segundos de um vídeo de 2 minutos satisfazem o primeiro ramo e não
        # são uma reprodução quase completa.
        #
        # O limiar em si também não está sustentado. O repositório se
        # contradiz (schema.py: "97% ou 15s+"; a ajuda do formulário dizia
        # "ficaram até a metade", que descreve `video_views_50pct` e ainda
        # sobre outro denominador), e o schema não é fonte independente para
        # encerrar isso. A página primária da Meta sobre ThruPlay foi
        # consultada em 2026-09-09 e devolveu só o título, sem o conteúdo —
        # o mesmo bloqueio que o Codex encontrou. Sem fonte legível, a
        # mensagem NÃO afirma o limiar.
        #
        # O que ela afirma é só o verificável: o número vem do campo
        # 'ThruPlays' do relatório, e é uma contagem de reproduções de vídeo
        # que alcançaram a duração mínima que a plataforma define. Isso basta
        # para a pessoa saber qual campo conferir, que é o objetivo da frase.
        "hold_rate", "thruplays", "impressions",
        "Hold rate (%)", "ThruPlays", "Impressões",
        "taxa de retenção do vídeo",
        "reproduções de vídeo contadas como ThruPlay", "quantas",
        "o anúncio apareceu", "o anúncio não apareceu",
        glosa=(
            "é o número do campo 'ThruPlays' do seu relatório: as reproduções "
            "de vídeo que duraram o mínimo que a plataforma exige para contar"
        ),
        evento_exige_denominador=True,
    ),
    _ParTaxa(
        "ctr_link", "link_clicks", "impressions",
        "CTR link (%)", "Cliques no link", "Impressões",
        "taxa de cliques no link", "cliques no link", "quantos",
        "o anúncio apareceu", "o anúncio não apareceu",
        glosa="",
        evento_exige_denominador=True,
    ),
    _ParTaxa(
        "ctr_all", "all_clicks", "impressions",
        "CTR todos (%)", "Cliques (todos os tipos)", "Impressões",
        "taxa de cliques no anúncio",
        "cliques no anúncio", "quantos",
        "o anúncio apareceu", "o anúncio não apareceu",
        # Glosa tirada do texto de ajuda do próprio campo no formulário.
        glosa="conta qualquer clique no anúncio — curtir, comentar, e também o clique no link",
        evento_exige_denominador=True,
    ),
    _ParTaxa(
        "lp_conversion_rate", "conversions", "landing_page_views",
        "Conversão na página (%)", "Conversões", "Visitas à página",
        "taxa de conversão da página", "conversões", "quantas",
        "a página foi aberta", "a página não foi aberta",
        glosa="",
        evento_exige_denominador=False,
    ),
]


def _com_glosa(par: _ParTaxa) -> str:
    """Nome do evento com a explicação entre parênteses, quando ela existe."""
    return f"{par.evento_num} ({par.glosa})" if par.glosa else par.evento_num


def _mensagem_r1(par: _ParTaxa, num: float, den: float, declarada: float, implicita: Decimal) -> str:
    quantidade, base = _proporcao_legivel(declarada)
    # Mesma precisão nos dois: comparar "1,23%" com "1,23%" na frase que
    # rejeita justamente por eles serem diferentes é o pior dos mundos.
    casas = _casas_para_distinguir(declarada, implicita)
    if Decimal(repr(float(declarada))) < implicita:
        leitura = (
            f"Esse valor significa apenas {quantidade} {par.evento_num} a cada "
            f"{base} vezes que {par.evento_den}."
        )
    else:
        leitura = (
            f"Esse valor significaria {quantidade} {par.evento_num} a cada "
            f"{base} vezes que {par.evento_den} — mais do que os números que você informou."
        )
    return (
        f"A {par.nome_taxa} não combina com os números informados. "
        f"Você informou que {par.evento_den} {_fmt_int(den)} vezes e que houve "
        f"{_fmt_int(num)} {_com_glosa(par)}. Isso significa {_fmt_int(num)} "
        f"{par.evento_num} a cada {_fmt_int(den)} vezes que {par.evento_den}: "
        f"uma taxa de {_fmt_pct(implicita, casas)}%. "
        f"Mas o campo '{par.rotulo_taxa}' está preenchido com {_fmt_pct(declarada, casas)}%. "
        f"{leitura} "
        f"Confira os campos '{par.rotulo_den}', '{par.rotulo_num}' e '{par.rotulo_taxa}' "
        f"para que os números combinem."
    )


def _mensagem_evento_sem_entrega(par: _ParTaxa, num: float) -> str:
    return (
        f"Os números informados não combinam. Você informou que {par.evento_den} "
        f"0 vezes (campo '{par.rotulo_den}'), mas também que houve {_fmt_int(num)} "
        f"{_com_glosa(par)}. Não é possível haver {par.evento_num} se "
        f"{par.evento_den_negado} nenhuma vez. "
        f"Confira os campos '{par.rotulo_den}' e '{par.rotulo_num}'."
    )


def _mensagem_taxa_sem_entrega(par: _ParTaxa, declarada: float) -> str:
    return (
        f"Os números informados não combinam. Você informou que {par.evento_den} "
        f"0 vezes (campo '{par.rotulo_den}'), mas o campo '{par.rotulo_taxa}' está "
        f"preenchido com {_fmt_pct(declarada)}%. Essa taxa conta {par.quantificador} "
        f"{_com_glosa(par)} houve a cada 100 vezes que {par.evento_den}; se "
        f"{par.evento_den_negado} nenhuma vez, ela só pode ser zero. "
        f"Confira os campos '{par.rotulo_den}' e '{par.rotulo_taxa}'."
    )


def validar_consistencia_metricas(m: Metrics) -> list[ErroConsistenciaMetrica]:
    """
    Aplica R1 e R2 aos 5 pares taxa↔bruto, de forma independente entre si.
    Campo ausente (`None`) nunca gera erro; zero é tratado como medição, não
    como ausência.
    """
    erros: list[ErroConsistenciaMetrica] = []

    for par in _PARES:
        num = getattr(m, par.campo_numerador)
        den = getattr(m, par.campo_denominador)
        declarada = getattr(m, par.campo_taxa)

        # ── R2: entrega zero ──────────────────────────────────────────────
        if den is not None and den == 0:
            if par.evento_exige_denominador and num is not None and num > 0:
                erros.append(ErroConsistenciaMetrica(
                    campos=[par.campo_denominador, par.campo_numerador],
                    mensagem=_mensagem_evento_sem_entrega(par, num),
                ))
            elif declarada is not None and declarada > 0:
                erros.append(ErroConsistenciaMetrica(
                    campos=[par.campo_denominador, par.campo_taxa],
                    mensagem=_mensagem_taxa_sem_entrega(par, declarada),
                ))
            continue

        # ── R1: taxa declarada × taxa implícita nos brutos ────────────────
        if num is None or den is None or den <= 0 or declarada is None:
            continue

        implicita = taxa_implicita_pp(num, den)
        if contradiz_os_brutos(declarada, num, den):
            erros.append(ErroConsistenciaMetrica(
                campos=[par.campo_denominador, par.campo_numerador, par.campo_taxa],
                mensagem=_mensagem_r1(par, num, den, declarada, implicita),
            ))

    return erros


class MetricasInconsistentes(Exception):
    """Contradição demonstrada entre as métricas informadas (P5)."""

    def __init__(self, erros: list[ErroConsistenciaMetrica]):
        self.erros = erros
        super().__init__(f"{len(erros)} inconsistência(s) nas métricas informadas")
