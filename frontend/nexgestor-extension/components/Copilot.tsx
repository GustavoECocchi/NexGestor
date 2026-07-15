import { useEffect, useRef, useState } from "react"
import { sanitizeHtml } from "~lib/sanitize"

import { IconSend } from "~components/Icons"
import type { CampaignVM } from "~types"

type Msg = { role: "ai" | "me"; html: string }

export function Copilot({ c }: { c: CampaignVM }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", html: "Posso explicar qualquer número desta campanha. O que você quer entender?" }
  ])
  const [text, setText] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  function send() {
    const q = text.trim()
    if (!q) return
    setText("")
    setMsgs((m) => [...m, { role: "me", html: q }])

    const sc = c.scenarios[0]
    // Guarda: campanha saudável pode não ter cenário.
    const reply = sc
      ? `Nesta campanha o ponto-chave é o <b>Cenário ${sc.code} — ${sc.title}</b>. ${sc.root_cause}<br/><br/>Ação recomendada: ${sc.action}`
      : `Esta campanha não tem gargalo crítico no momento — as métricas estão dentro das metas. O foco é manter e vigiar sinais de saturação (frequência subindo).`
    setTimeout(() => setMsgs((m) => [...m, { role: "ai", html: reply }]), 550)
  }

  return (
    <>
      <div className="chat">
        <div className="sec-label" style={{ padding: 0, margin: "0 0 12px" }}>Copiloto <span className="ln" /></div>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(m.html) }} />
        ))}
        <div ref={endRef} />
      </div>
      <div className="chat-input">
        <input
          value={text}
          placeholder="Pergunte algo sobre sua campanha…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="send" onClick={send}><IconSend /></button>
      </div>
    </>
  )
}
