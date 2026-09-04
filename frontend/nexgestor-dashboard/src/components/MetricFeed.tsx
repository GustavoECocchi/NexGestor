import { FieldHint } from "~components/FieldHint"
import { IconInfo } from "~components/Icons"
import type { CampaignVM, Tile } from "~types"

// Ordem de leitura pedida (docs/rascunho_prompt.md, 2026-08-31): resultado →
// causa → ação → contexto. Faixa de resultado e Painel do funil têm posição
// FIXA (não por peso/relevância — isso foi tentado antes com tileSize/áreas
// e foi substituído por este feed, mais explícito); tudo que não está numa
// dessas duas listas cai no Contexto, sem ordem específica além da que o
// engine já avaliou.
const RESULT_LABELS = ["CPA", "ROAS", "Investimento", "Receita"]
const FUNNEL_LABELS = ["Hook Rate", "Hold Rate", "CTR Link", "Conversão na página"]

// Achado #1 da auditoria de vocabulário (fase-5, o de maior impacto): fora do
// formulário de criação, nenhum rótulo de métrica tinha explicação — alguém
// que preencheu o formulário há dias e volta pra ver "CPA R$150" aqui não tem
// mais nenhuma pista do que aquilo significa. Mesmo texto já usado no
// `FieldHint` do formulário (`NewCampaignModal.tsx`) — não inventa uma
// segunda redação para o mesmo termo.
const METRIC_HINT: Record<string, string> = {
  CPA: "Quanto custou, em média, cada conversão (venda, cadastro etc.) gerada.",
  ROAS: "Quanto voltou em receita para cada R$1 investido. 2x = dobrou o dinheiro investido.",
  Investimento: "Quanto você já investiu nessa campanha.",
  Receita: "Quanto essa campanha gerou em vendas — calculado a partir do investimento vezes o ROAS.",
  "Hook Rate": "De quem viu o anúncio, quantos assistiram pelo menos 3 segundos — mede se o começo prende atenção.",
  "Hold Rate": "De quem começou a assistir, quantos ficaram até a metade — mede se o anúncio segura o interesse.",
  "CTR Link": "De quem viu o anúncio, quantos clicaram para ir ao seu site/página.",
  "CTR Todos": "Como o CTR link, mas conta qualquer clique no anúncio (curtir, comentar etc.), não só o link.",
  "Conversão na página": "Das pessoas que abriram sua página de destino, quantas converteram.",
  CPM: "Quanto você paga a cada 1.000 exibições do anúncio.",
  CPC: "Quanto você paga, em média, cada vez que alguém clica no anúncio.",
  CPL: "Quanto custou, em média, cada lead (contato captado) gerado.",
  Frequência: "Quantas vezes, em média, a mesma pessoa viu esse anúncio. Número alto pode cansar o público.",
  "Conversões/semana": "Quantas conversões essa campanha costuma gerar por semana."
}

// Rótulos aposentados → rótulo atual. Uma campanha é persistida como
// `CampaignVM` JÁ ADAPTADO (`salvarCampanha` grava `payload: vm`,
// `listarCampanhasSalvas` devolve `{...l.payload}` sem reprocessar, e o
// localStorage guarda o mesmo objeto), então o RÓTULO faz parte do formato
// salvo — não existe reanálise que migre o dado antigo. Sem esta canonização,
// renomear uma métrica joga toda campanha analisada antes da renomeação para
// fora do agrupamento (o tile perde a barra do funil) e para fora do
// `METRIC_HINT` (perde a explicação). Canonizamos na leitura, sem reescrever
// o que já está salvo.
const LEGACY_LABEL: Record<string, string> = {
  "Conversão LP": "Conversão na página" // fase-5, PR7
}

function canonico(t: Tile): Tile {
  const atual = LEGACY_LABEL[t[0]]
  return atual ? ([atual, ...t.slice(1)] as Tile) : t
}

function porRotulo(tiles: Tile[], label: string): Tile | undefined {
  return tiles.find((t) => t[0] === label)
}

export function MetricFeed({ c }: { c: CampaignVM }) {
  const tiles = c.tiles.map(canonico)
  const comMetaPadrao = tiles.filter((t) => t[4] === "sistema").length

  const resultTiles = RESULT_LABELS.map((l) => porRotulo(tiles, l)).filter((t): t is Tile => !!t)
  const funnelTiles = FUNNEL_LABELS.map((l) => porRotulo(tiles, l)).filter((t): t is Tile => !!t)
  const usados = new Set([...resultTiles, ...funnelTiles].map((t) => t[0]))
  const contextTiles = tiles.filter((t) => !usados.has(t[0]))

  return (
    <>
      {/* Consolidado aqui em vez de repetir "Meta padrão do sistema" em cada
          card (era o que fase-2 §11 fazia) — um aviso só, contando quantas
          métricas caíram nisso. Sem CTA de "personalizar" de verdade: não
          existe hoje uma tela de editar metas de uma campanha já salva (só o
          formulário de criação define isso), então um botão aqui levaria a
          lugar nenhum — o texto já orienta o caminho real. */}
      {comMetaPadrao > 0 && (
        <div className="meta-banner">
          <IconInfo />
          {comMetaPadrao} métrica{comMetaPadrao > 1 ? "s" : ""} usando meta padrão do sistema — personalize na próxima análise.
        </div>
      )}

      <ResultRow tiles={resultTiles} />

      <div className="funnel-row">
        <FunnelPanel tiles={funnelTiles} diagnosis={c.summary} />
        <ActionsPanel actions={c.actions} />
      </div>

      {contextTiles.length > 0 && <ContextGrid tiles={contextTiles} />}
    </>
  )
}

function ResultRow({ tiles }: { tiles: Tile[] }) {
  if (tiles.length === 0) return null
  return (
    <div className="result-row">
      {tiles.map((t, i) => {
        // "Fora da meta" = a cor que o engine já resolveu pro tile é a de
        // crítico. Não é um corte novo — é o mesmo t[2] que já colore o
        // valor, só reaproveitado pro fundo do card.
        const alerta = t[2] === "var(--red)"
        return (
          <div key={t[0]} className={`result-card${alerta ? " result-alert" : ""}`} style={{ animationDelay: `${i * 55}ms` }}>
            <div className="rk">{t[0]}{METRIC_HINT[t[0]] && <FieldHint text={METRIC_HINT[t[0]]} />}</div>
            <div className="rv" style={{ color: t[2] }}>{t[1]}</div>
            {t[3] && <div className="rd">{t[3]}</div>}
          </div>
        )
      })}
    </div>
  )
}

function FunnelPanel({ tiles, diagnosis }: { tiles: Tile[]; diagnosis: string }) {
  return (
    <div className="funnel-panel">
      <div className="fp-title">Onde a campanha quebra</div>
      {tiles.length > 0 ? (
        <div className="funnel-bars">
          {tiles.map((t, i) => {
            const score = Math.max(0, Math.min(100, t[5] ?? 0))
            return (
              <div key={t[0]} className="funnel-bar" style={{ animationDelay: `${i * 55}ms` }}>
                <div className="fb-track">
                  <div className="fb-col" style={{ height: `${score}%`, background: t[2] }} />
                </div>
                <div className="fb-lbl">{t[0]}{METRIC_HINT[t[0]] && <FieldHint text={METRIC_HINT[t[0]]} />}</div>
                <div className="fb-val" style={{ color: t[2] }}>{t[1]}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="fp-empty">Nenhuma métrica de funil enviada nesta análise.</div>
      )}
      <div className="fp-diagnosis">{diagnosis}</div>
    </div>
  )
}

function ActionsPanel({ actions }: { actions: CampaignVM["actions"] }) {
  const top4 = actions.slice(0, 4)
  return (
    <div className="actions-panel">
      <div className="ap-title">O que fazer agora</div>
      {top4.length > 0 ? (
        top4.map((a) => (
          <div className="action-item" key={a.title}>
            <div className="ai-title">{a.title}</div>
            <div className="ai-why">{a.why}</div>
          </div>
        ))
      ) : (
        <div className="ap-empty">Nenhuma ação prioritária identificada.</div>
      )}
    </div>
  )
}

function ContextGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="context-grid">
      {tiles.map((t, i) => (
        <div className="context-card" key={t[0]} style={{ animationDelay: `${i * 55}ms` }}>
          <div className="ck">{t[0]}{METRIC_HINT[t[0]] && <FieldHint text={METRIC_HINT[t[0]]} />}</div>
          <div className="cv" style={{ color: t[2] }}>{t[1]}</div>
          {/* Só o estado "ausente" (meta não definida, ex. CPL) mostra a nota
              aqui — notas normais de diagnóstico continuam reservadas pra
              Faixa/Funil, pra não virar uma segunda seção de diagnóstico. */}
          {t[4] === "ausente" && t[3] && <div className="cd">{t[3]}</div>}
        </div>
      ))}
    </div>
  )
}
