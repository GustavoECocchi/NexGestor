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

/**
 * Resposta padrão para métrica que a campanha não tem.
 *
 * Antes o adapter preenchia `0` no lugar do dado ausente e o Copiloto afirmava
 * "o CPA atual desta campanha é R$ 0,00" — número inventado, com a mesma cara
 * de dado medido. Preferimos dizer que não temos o dado e indicar como enviá-lo.
 */
function semDado(rotulo: string, comoEnviar: string): string {
  return `Esta campanha não tem <b>${rotulo}</b> registrado — a análise foi feita sem esse dado. Envie ${comoEnviar} numa nova análise para eu conseguir responder.`
}

export function buildReply(question: string, c: CampaignVM): string {
  const q = norm(question)
  const sc = c.scenarios[0]

  if (/\bcpa\b|custo por (resultado|venda|aquisic)/.test(q)) {
    if (c.cpaNum == null) return semDado("CPA", "o CPA (ou gasto + conversões)")
    return `O CPA atual desta campanha é <b>R$ ${c.cpaNum.toFixed(2)}</b>. ${
      sc ? `Isso está ligado ao <b>Cenário ${sc.code} — ${sc.title}</b>: ${sc.root_cause}` : "Está dentro do esperado para as metas configuradas."
    }`
  }
  if (/\broas\b|retorno|receita/.test(q)) {
    if (c.roasNum == null) return semDado("ROAS", "o ROAS da campanha")
    return `O ROAS médio é <b>${c.roasNum.toFixed(2)}x</b>, com receita de R$ ${c.revenue.toLocaleString("pt-BR")} sobre R$ ${c.invest.toLocaleString("pt-BR")} investidos.`
  }
  if (/\bctr\b|clique/.test(q)) {
    if (c.ctrNum == null) return semDado("CTR Link", "o CTR Link (ou cliques no link + impressões)")
    return `O CTR link está em <b>${c.ctrNum.toFixed(2)}%</b>. ${
      sc ? `Relacionado ao cenário atual: ${sc.funnel_impact}` : "Sem gargalo de clique identificado no momento."
    }`
  }
  if (/frequ|fadiga|satura/.test(q)) {
    if (c.freqNum == null) return semDado("frequência", "a frequência (ou impressões + alcance)")
    return `A frequência atual é <b>${c.freqNum.toFixed(1)}x</b> por pessoa. ${
      c.freqNum >= 3 ? "Isso já é sinal de possível fadiga de criativo — vale revisar o criativo em uso." : "Ainda dentro de uma faixa saudável."
    }`
  }
  if (/escalar|aumentar.*verba|subir.*orcamento/.test(q)) {
    if (c.status === "BLUE") {
      return "Sim — esta campanha está com sinais de escalabilidade (métricas saudáveis e com margem). Considere subir o orçamento de forma gradual (ex: +20% a cada 2-3 dias) para não perder a fase de aprendizado."
    }
    // Sem cenário crítico E com pouca cobertura, a resposta honesta não é "não":
    // é "não dá para afirmar". Dizer "ainda não é o momento" sugeriria que
    // existe um problema medido, quando o que existe é falta de dado.
    if (!sc && c.confidence === "low") {
      return `Não dá para afirmar com os dados desta análise — a cobertura foi de apenas ${c.coverage ?? 0}%. Não há problema detectado, mas também não há evidência suficiente (frequência, fase de aprendizado, ROAS) para recomendar aumento de verba.`
    }
    return `Ainda não é o momento ideal. ${sc ? `Primeiro resolva o <b>Cenário ${sc.code} — ${sc.title}</b>: ${sc.action}` : "Estabilize as métricas antes de aumentar verba."}`
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
  // O Copiloto é o ÚLTIMO bloco de uma página que rola inteira (`.scroll` em
  // CampaignDetail). Rolar até o fim do chat rola a página inteira junto.
  // Na montagem `msgs` já tem a saudação, então o efeito disparava sozinho e
  // abrir qualquer campanha caía direto no rodapé: sem "Voltar", sem nome,
  // score, métricas, diagnóstico nem ações — justamente a tela de diagnóstico
  // que o produto existe para mostrar. Só rolamos depois de uma interação real.
  const jaInteragiu = useRef(false)

  useEffect(() => {
    if (!jaInteragiu.current) return
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [msgs])

  function ask(question: string) {
    const q = question.trim()
    if (!q) return
    jaInteragiu.current = true
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
