import { useState } from "react"

import { IconSpark, IconTrash } from "~components/Icons"
import { Sparkline } from "~components/Sparkline"
import { sanitizeHtml } from "~lib/sanitize"
import { STATUS } from "~lib/status"
import type { CampaignVM } from "~types"

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
      // card ("Black Friday RED CPA R$ 90 … Apagar para todo o time? …") — um
      // leitor de tela leria isso inteiro como o nome do botão, e as buscas por
      // papel/nome ficam ambíguas com a lixeira dentro dele.
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
        <div className="pill" style={{ background: s.bg, color: s.color }}>{s.label}</div>
      </div>
      <div className="card-mid">
        <div className="metrics-row">
          <div className="m"><span className="k">{c.m1.k}</span><span className="v">{c.m1.v}</span></div>
          <div className="m"><span className="k">{c.m2.k}</span><span className="v">{c.m2.v}</span></div>
        </div>
        <div className="spark-box">
          <Sparkline series={c.spark} color={s.color} />
          <div className={`spark-trend ${td}`}>
            <svg width={11} height={11} viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              {c.trend > 0 ? <path d="M6 14l5-5 5 5" /> : c.trend < 0 ? <path d="M6 10l5 5 5-5" /> : <path d="M5 12h14" />}
            </svg>
            {c.trend > 0 ? "+" : ""}{c.trend}% / 7d
          </div>
        </div>
      </div>
      <div className="ai-strip">
        <IconSpark className="sp" />
        <p dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.ai) }} />
      </div>
    </div>
  )
}
