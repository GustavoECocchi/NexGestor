import { AnimatedNumber } from "~components/AnimatedNumber"
import { COPILOT_ANCHOR_ID, COPILOT_INPUT_ID, Copilot } from "~components/Copilot"
import {
  DiagnosisCards,
  OpportunityCard,
  PriorityActions,
  Suggestions,
  AIExtras
} from "~components/DetailSections"
import { FieldHint } from "~components/FieldHint"
import { IconBack, IconChat, IconInfo } from "~components/Icons"
import { MetricFeed } from "~components/MetricFeed"
import { STATUS } from "~lib/status"
import type { CampaignVM, ScoreConfidence } from "~types"

const CONF: Record<ScoreConfidence, { label: string; color: string }> = {
  high: { label: "confiança alta", color: "var(--green)" },
  medium: { label: "confiança média", color: "var(--amber)" },
  low: { label: "confiança baixa", color: "var(--red)" }
}

// Achado #2 da auditoria de vocabulário (fase-5): "confiança"/"cobertura de
// dados" apareciam em toda campanha sem explicação em lugar nenhum.
// `FieldHint` não tem NENHUM acoplamento com o modal onde nasceu — o
// `position:fixed` é calculado só a partir do próprio botão — então é
// reaproveitado direto aqui, sem duplicar nada.
const COVERAGE_HINT_TEXT =
  "Confiança é o quanto dá pra levar o veredito ao pé da letra. Cobertura é quantas das métricas possíveis a análise recebeu — mais dado, mais confiança."

export function CampaignDetail({ c, onBack }: { c: CampaignVM; onBack: () => void }) {
  const s = STATUS[c.status]
  const circ = 2 * Math.PI * 32
  const off = circ - (c.score / 100) * circ

  /**
   * Leva ao Copiloto, que fica no FIM desta página (depois de diagnóstico,
   * ações, sugestões e observações da IA). Sem este atalho, só encontrava o
   * assistente quem rolasse a página inteira — era a pergunta nº4 da equipe
   * ("como usar a IA") sem resposta visível (fase-2, AC4).
   *
   * O foco vem ANTES da rolagem, com `preventScroll`: focar um elemento fora da
   * tela faz o navegador saltar até ele instantaneamente, e o salto cancelaria a
   * rolagem suave logo abaixo. Assim o campo já está pronto para digitar quando
   * a rolagem termina — sem `setTimeout` adivinhando a duração da animação.
   */
  const irParaCopiloto = () => {
    document.getElementById(COPILOT_INPUT_ID)?.focus({ preventScroll: true })
    document.getElementById(COPILOT_ANCHOR_ID)?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    })
  }

  return (
    <>
      <div className="scroll fade-in">
        <div className="detail-hd">
          <div
            className="back"
            role="button"
            tabIndex={0}
            onClick={onBack}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onBack())}>
            <IconBack />Voltar
          </div>
          <div className="detail-title-row">
            <h2>{c.name}</h2>
            <div className="pill" style={{ background: s.bg, color: s.color }}>{s.label}</div>
          </div>
          <div className="detail-plat-row">
            <div className="detail-plat"><span className="dot" style={{ background: s.color }} />{c.platform}</div>
            <button className="copilot-atalho" onClick={irParaCopiloto}>
              <IconChat />
              Perguntar ao Copiloto
            </button>
          </div>
        </div>

        <div className="score-wrap">
          <div className="score-ring">
            <svg width={74} height={74}>
              <circle cx={37} cy={37} r={32} fill="none" stroke="var(--line)" strokeWidth={6} />
              <circle
                cx={37} cy={37} r={32} fill="none" stroke={s.stroke} strokeWidth={6}
                strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off}
                style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
              />
            </svg>
            {/* Conta junto com o anel, que já anima o stroke-dashoffset em 1s. */}
            <div className="num"><AnimatedNumber value={String(c.score)} /><small>/100</small></div>
          </div>
          <div className="score-txt">
            <h3>Score de saúde</h3>
            {c.confidence && c.coverage != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 6px", fontSize: 11, color: CONF[c.confidence].color }}>
                <span className="dot" style={{ background: CONF[c.confidence].color }} />
                Diagnóstico com {CONF[c.confidence].label} · cobertura de dados {c.coverage}%
                <FieldHint text={COVERAGE_HINT_TEXT} />
              </div>
            )}
            <p>{c.summary}</p>
          </div>
        </div>

        <OpportunityCard c={c} />

        {/* Feed reorganizado (docs/rascunho_prompt.md, 2026-08-31): Faixa de
            resultado → Painel do funil + Ações → Métricas de contexto. Ver
            components/MetricFeed.tsx. Substitui a versão anterior (gráfico
            polar "Áreas da campanha" + grade de tiles por peso/relevância —
            docs/prds/fase-3-graficos-campanha.md Parte A), removida a pedido
            do usuário. */}
        <MetricFeed c={c} />

        {/* O diagnóstico é do engine determinístico. Chamá-lo de "Diagnóstico
            IA" quando `ai_insights` veio nulo (IA desligada, sem key ou falha)
            atribuía à IA um texto que ela não escreveu. O selo só aparece
            quando a camada de IA realmente participou. */}
        <div className="sec-label">
          Diagnóstico
          {c.hasAI && <span className="ai-badge">complementado por IA</span>}
          <span className="ln" />
        </div>
        <div className="sec-cap">
          <IconInfo />
          {c.hasAI
            ? "Cruzamento entre métricas, metas e padrões de comportamento pelo engine de regras, complementado pela camada de IA."
            : "Gerado pelo engine de regras, cruzando métricas, metas e padrões de comportamento — não pela leitura de números isolados."}
        </div>
        <DiagnosisCards c={c} />

        <div className="sec-label">Ações prioritárias <span className="ln" /></div>
        <PriorityActions c={c} />

        <div className="sec-label">Sugestões <span className="ln" /></div>
        <Suggestions c={c} />

        {/* Só renderiza quando a IA de fato produziu algo — o próprio
            componente devolve null se os dois blocos estiverem vazios, então
            campanha sem IA não ganha um cabeçalho órfão. */}
        {((c.aiInsights?.length ?? 0) > 0 || (c.aiRisks?.length ?? 0) > 0) && (
          <div className="sec-label">
            Observações da IA <span className="ln" />
          </div>
        )}
        <AIExtras c={c} />

        <Copilot c={c} />
        <div style={{ height: 8 }} />
      </div>
    </>
  )
}
