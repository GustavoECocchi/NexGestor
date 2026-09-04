import { useState } from "react"

import { IconAlert, IconCheck, IconInfo, IconRocket, IconTrash } from "~components/Icons"
import { Sparkline } from "~components/Sparkline"
import { STATUS } from "~lib/status"
import type { CampaignVM, UIStatus } from "~types"

// Ícone por status: a forma reforça o significado sem depender só da cor
// (ajuda quem tem dificuldade de distinguir vermelho/verde, e é mais rápido
// de reconhecer de relance do que ler o rótulo).
const STATUS_ICON: Record<UIStatus, typeof IconAlert> = {
  RED: IconAlert,
  YELLOW: IconInfo,
  GREEN: IconCheck,
  BLUE: IconRocket
}

// O que o usuário faz a seguir, em uma frase — não a métrica que explica por
// quê. É isto, não CPA/ROAS crus, que responde "a campanha está escalável ou
// não, e o que eu faço agora" (o pedido original do produto).
const ACTION_LABEL: Record<UIStatus, string> = {
  BLUE: "Como escalar",
  RED: "Como resolver",
  YELLOW: "Para melhorar",
  GREEN: "Para manter"
}

// Só usado se a campanha não tiver NENHUM dado de diagnóstico (registro
// antigo/malformado no localStorage — o backend real sempre manda
// `primary_action`). Mesmo aqui, nunca afirmar que "não foi encontrado
// motivo": o status em si já É um resultado do diagnóstico, dizer isso
// contradiria a própria etiqueta ao lado.
const NO_DATA_FALLBACK: Record<UIStatus, string> = {
  GREEN: "Sem alertas registrados.",
  BLUE: "Sem detalhes de escala registrados.",
  YELLOW: "Sem diagnóstico detalhado registrado.",
  RED: "Sem diagnóstico detalhado registrado."
}

function cardAction(c: CampaignVM): { label: string; text: string } {
  if (c.status === "BLUE") {
    const g = c.scenarios.find((s) => s.code === "G")
    if (g) return { label: ACTION_LABEL.BLUE, text: g.action }
  }
  // `primaryAction` é a ação que o engine já calcula SEMPRE — quando um
  // cenário de causa raiz bate, é a ação dele; quando nenhum bate, o backend
  // ainda assim aponta a pior métrica ("Investigar CPC: está em nível
  // crítico...") em vez de devolver um "nada encontrado" genérico. Por isso
  // ela substitui `actions[0]`/`summary` como fonte principal: a ferramenta
  // existe pra encontrar o problema e mostrar a solução, não pra admitir que
  // não achou nada.
  const text = c.primaryAction || c.actions[0]?.title || c.summary
  if (text) return { label: ACTION_LABEL[c.status], text }
  return { label: "", text: NO_DATA_FALLBACK[c.status] }
}

export function CampaignCard({
  c,
  index,
  demo,
  onOpen,
  onDelete
}: {
  c: CampaignVM
  index: number
  demo?: boolean
  onOpen: (id: number) => void
  /**
   * Ausente = campanha não apagável (os exemplos, por exemplo).
   * Resolve `false` quando não deu para apagar — aí o card CONTINUA na tela e
   * mostra o porquê, em vez de sumir e reaparecer na próxima abertura.
   */
  onDelete?: (id: number) => Promise<boolean>
}) {
  const s = STATUS[c.status]
  const StatusIcon = STATUS_ICON[c.status]
  const action = cardAction(c)
  const td = c.trend > 0 ? "up" : c.trend < 0 ? "down" : "flat"
  const [confirmando, setConfirmando] = useState(false)
  const [apagando, setApagando] = useState(false)
  const [erro, setErro] = useState(false)

  /**
   * O card inteiro é clicável (abre a campanha), então TUDO que acontece
   * dentro da lixeira precisa parar aqui. Sem isto, clicar em "Apagar" abriria
   * o detalhe da campanha que está sendo apagada — e o Enter no botão faria o
   * mesmo, porque o card também escuta teclado.
   */
  const isolar = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      // `delible` reserva o espaço da lixeira no canto (o pill ganha margem),
      // para ela aparecer no hover SEM empurrar nada — layout que se mexe ao
      // passar o mouse é o tipo de tremidinha que o usuário já reclamou antes.
      className={`card${demo ? " demo" : ""}${onDelete && !demo ? " delible" : ""}`}
      style={{ animationDelay: `${index * 70}ms` }}
      role="button"
      // Sem rótulo explícito, o nome acessível deste botão é TODO o texto do
      // card ("Black Friday Crítico Como resolver: … Apagar para todo o time?
      // …") — um leitor de tela leria isso inteiro como o nome do botão, e as
      // buscas por papel/nome ficam ambíguas com a lixeira dentro dele.
      aria-label={`Abrir campanha ${c.name}`}
      tabIndex={0}
      onClick={() => onOpen(c.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen(c.id))}>
      <div className="glow" style={{ background: `radial-gradient(180px 90px at 90% 0%, ${s.bg}, transparent 70%)` }} />

      {onDelete && !demo && (
        confirmando ? (
          <div
            className="card-del-confirm"
            onClick={isolar}
            onKeyDown={(e) => {
              isolar(e)
              if (e.key === "Escape" && !apagando) setConfirmando(false)
            }}>
            {/* A base é compartilhada no período de testes: quem apaga apaga
                para todo mundo. Esconder isso seria armar uma pegadinha. */}
            <span>
              {erro
                ? "Não foi possível apagar. Tente de novo."
                : "Apagar para todo o time?"}
            </span>
            <button
              className="del-yes"
              disabled={apagando}
              onClick={async () => {
                setApagando(true)
                setErro(false)
                try {
                  const ok = await onDelete(c.id)
                  // Só fecha a confirmação quando apagou de verdade. Fechar em
                  // caso de falha daria a impressão de sucesso.
                  if (ok) setConfirmando(false)
                  else setErro(true)
                } catch {
                  setErro(true)
                } finally {
                  setApagando(false)
                }
              }}>
              {apagando ? "Apagando…" : "Apagar"}
            </button>
            <button className="del-no" disabled={apagando} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button
            className="card-del"
            aria-label={`Apagar campanha ${c.name}`}
            title="Apagar campanha"
            onClick={(e) => {
              isolar(e)
              setConfirmando(true)
            }}
            onKeyDown={isolar}>
            <IconTrash />
          </button>
        )
      )}

      <div className="card-top">
        <div style={{ flex: 1 }}>
          <div className="card-name">
            {c.name}
            {demo && <span className="demo-tag">exemplo</span>}
          </div>
          <div className="card-plat"><span className="dot" style={{ background: s.color }} />{c.platform}</div>
        </div>
      </div>

      {/* Achado A3 da auditoria de rede (2026-09-03): antes, uma falha
          PERMANENTE de sincronização (413, payload grande demais) era
          retentada em silêncio pra sempre, sem o usuário nunca saber que
          aquela campanha específica jamais sairia do navegador dele.
          `syncFalhouPermanente` só existe quando o laço de sincronização
          (`App.tsx`) já desistiu de vez — SÓ pra causas do conteúdo da
          campanha, nunca pra 507 (ver abaixo). */}
      {c.syncFalhouPermanente && (
        <div className="card-sync-erro" role="alert">
          <IconAlert />
          <span>Não sincronizada: {c.syncFalhouPermanente}</span>
        </div>
      )}

      {/* Achado R1 (revisão do Opus, 2026-09-04): 507 (base do servidor
          cheia) é estado do SERVIDOR, não desta campanha — classificá-lo
          como falha permanente (a primeira versão do A3) travava a
          campanha pra sempre mesmo depois de alguém liberar espaço.
          `syncAviso` informa sem bloquear: o laço de sync continua
          retentando, e o aviso some sozinho assim que uma tentativa der
          certo (`marcarComoSalva` limpa o campo). */}
      {c.syncAviso && (
        <div className="card-sync-aviso" role="status">
          <IconAlert />
          <span>Ainda não sincronizada: {c.syncAviso} Tentando de novo automaticamente.</span>
        </div>
      )}

      {/* Status: o elemento dominante do card. Ícone + rótulo grande respondem
          "escalável ou não" de relance, sem precisar ler número nenhum. */}
      <div className="card-status" style={{ color: s.color }}>
        <div className="card-status-ico" style={{ background: s.bg }}><StatusIcon /></div>
        <span className="card-status-label">{s.label}</span>
      </div>

      {/* A frase que importa: o que fazer agora. Não é a métrica que explica
          por quê (isso fica no detalhe) — é a instrução em si. */}
      <div className="card-action">
        {action.label && <span className="ca-label">{action.label}</span>}
        <p>{action.text}</p>
      </div>

      <div className="card-foot">
        <Sparkline series={c.spark} color={s.color} />
        <div className={`spark-trend ${td}`}>
          <svg width={11} height={11} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            {c.trend > 0 ? <path d="M6 14l5-5 5 5" /> : c.trend < 0 ? <path d="M6 10l5 5 5-5" /> : <path d="M5 12h14" />}
          </svg>
          {c.trend > 0 ? "+" : ""}{c.trend}% / 7d
        </div>
      </div>
    </div>
  )
}
