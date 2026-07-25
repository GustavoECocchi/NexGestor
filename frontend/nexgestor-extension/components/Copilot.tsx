import { useEffect, useRef, useState } from "react"
import { sanitizeHtml } from "~lib/sanitize"

import { IconSend } from "~components/Icons"
import type { CampaignVM } from "~types"

type Msg = { role: "ai" | "me"; html: string }

const QUICK: { label: string; q: string }[] = [
  { label: "Por que isso está acontecendo?", q: "Por que isso está acontecendo?" },
  { label: "O que eu faço agora?", q: "O que eu faço agora?" },
  { label: "Vale escalar o investimento?", q: "Vale escalar o investimento?" }
]

// Sem strip de acento — respostas continuam grounded nos dados reais da
// campanha (nunca texto solto/alucinado), só a pergunta decide qual recorte
// dos dados mostrar. Não é NLU de verdade: é honesto sobre isso no fallback.
export function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

export function buildReply(question: string, c: CampaignVM): string {
  const q = norm(question)
  const sc = c.scenarios[0]

  if (/\bcpa\b|custo por (resultado|venda|aquisic)/.test(q)) {
    return `O CPA atual desta campanha é <b>R$ ${c.cpaNum.toFixed(2)}</b>. ${
      sc ? `Isso está ligado ao <b>Cenário ${sc.code} — ${sc.title}</b>: ${sc.root_cause}` : "Está dentro do esperado para as metas configuradas."
    }`
  }
  if (/\broas\b|retorno|receita/.test(q)) {
    return `O ROAS médio é <b>${c.roasNum.toFixed(2)}x</b>, com receita de R$ ${c.revenue.toLocaleString("pt-BR")} sobre R$ ${c.invest.toLocaleString("pt-BR")} investidos.`
  }
  if (/\bctr\b|clique/.test(q)) {
    return `O CTR link está em <b>${c.ctrNum.toFixed(2)}%</b>. ${
      sc ? `Relacionado ao cenário atual: ${sc.funnel_impact}` : "Sem gargalo de clique identificado no momento."
    }`
  }
  if (/frequ|fadiga|satura/.test(q)) {
    return `A frequência atual é <b>${c.freqNum.toFixed(1)}x</b> por pessoa. ${
      c.freqNum >= 3 ? "Isso já é sinal de possível fadiga de criativo — vale revisar o criativo em uso." : "Ainda dentro de uma faixa saudável."
    }`
  }
  if (/escalar|aumentar.*verba|subir.*orcamento/.test(q)) {
    return c.status === "BLUE"
      ? "Sim — esta campanha está com sinais de escalabilidade (métricas saudáveis e com margem). Considere subir o orçamento de forma gradual (ex: +20% a cada 2-3 dias) para não perder a fase de aprendizado."
      : `Ainda não é o momento ideal. ${sc ? `Primeiro resolva o <b>Cenário ${sc.code} — ${sc.title}</b>: ${sc.action}` : "Estabilize as métricas antes de aumentar verba."}`
  }
  if (/acao|proximo passo|o que.*faco|fazer agora/.test(q)) {
    const a = c.actions[0]
    return a
      ? `Prioridade agora: <b>${a.title}</b> (${a.prio}). ${a.why}`
      : sc
        ? `Ação recomendada: ${sc.action}`
        : "Nenhuma ação crítica pendente — a campanha está estável."
  }
  if (/causa|por ?que|motivo|raiz/.test(q)) {
    return sc
      ? `A causa raiz identificada é: ${sc.root_cause}<br/><br/>Impacto no funil: ${sc.funnel_impact}`
      : "Não há causa crítica no momento — as métricas estão dentro das metas configuradas."
  }
  if (/oportunidade/.test(q)) {
    return c.opportunity || "Nenhuma oportunidade adicional destacada além do diagnóstico principal."
  }
  if (/sugest|ideia/.test(q)) {
    const s = c.sugg[0]
    return s
      ? `Sugestão com melhor custo-benefício: <b>${s.name}</b> — impacto ${s.impact}, esforço ${s.effort}, urgência ${s.urgency}.`
      : "Sem sugestões adicionais registradas para esta campanha agora."
  }

  // Fallback honesto: não finge entender a pergunta livre, dá o panorama geral.
  return sc
    ? `Não tenho uma resposta específica pra essa pergunta ainda, mas o ponto-chave da campanha hoje é o <b>Cenário ${sc.code} — ${sc.title}</b>: ${sc.root_cause}<br/><br/>Ação recomendada: ${sc.action}`
    : "Não tenho uma resposta específica pra essa pergunta ainda. De modo geral, esta campanha não tem gargalo crítico no momento — o foco é manter e vigiar sinais de saturação (frequência subindo)."
}

export function Copilot({ c }: { c: CampaignVM }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "ai", html: "Posso explicar qualquer número desta campanha. O que você quer entender?" }
  ])
  const [text, setText] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [msgs])

  function ask(question: string) {
    const q = question.trim()
    if (!q) return
    setMsgs((m) => [...m, { role: "me", html: q }])
    const reply = buildReply(q, c)
    setTimeout(() => setMsgs((m) => [...m, { role: "ai", html: reply }]), 550)
  }

  function send() {
    ask(text)
    setText("")
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
      <div className="quick-asks">
        {QUICK.map((qq) => (
          <button key={qq.label} className="quick-ask" onClick={() => ask(qq.q)}>{qq.label}</button>
        ))}
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
