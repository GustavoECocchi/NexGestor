import { useEffect, useRef, useState } from "react"

import {
  assinarSaudeIA,
  lerSaudeIA,
  registrarStatusServidor,
  type SaudeIA
} from "~lib/aiHealth"
import { buscarStatus, estadoDaIA, type EstadoIA, type StatusServidor } from "~lib/api"

// Texto do selo e a explicação que aparece ao clicar. Separado do componente
// para os testes exercitarem os três estados sem montar rede.
//
// O estado `desconhecido` NÃO é tratado como "off": um servidor antigo (sem a
// rota /status) e um servidor fora do ar chegam aqui iguais, e afirmar
// "desligada" nesses casos seria inventar. O selo diz que não sabe.
export const TEXTO_IA: Record<EstadoIA, { rotulo: string; titulo: string; detalhe: string }> = {
  on: {
    rotulo: "IA on",
    titulo: "Camada de IA ativa",
    detalhe:
      "O diagnóstico do engine de regras é complementado pela IA: resumo executivo, cenários extras, padrões cruzados e alertas de risco."
  },
  off: {
    rotulo: "IA off",
    titulo: "Camada de IA desligada",
    detalhe:
      "As análises saem apenas do engine de regras determinístico. O diagnóstico continua completo e válido, mas sem resumo executivo, padrões cruzados nem alertas de risco. Quem cuida do servidor precisa configurar a chave da IA."
  },
  falhando: {
    rotulo: "IA falhando",
    titulo: "IA configurada, mas não respondeu",
    detalhe:
      "O servidor diz ter a camada de IA ativa, mas a última análise voltou sem ela. As causas mais comuns são chave revogada, limite de gasto atingido ou o modelo fora do ar — nenhuma delas tem a ver com os seus dados. O diagnóstico do engine continua válido. Avise o responsável técnico."
  },
  desconhecido: {
    rotulo: "IA ?",
    titulo: "Não foi possível saber",
    detalhe:
      "O servidor não respondeu se a IA está ativa — pode estar fora do ar, ou rodando uma versão anterior a este recurso. Não é um problema das suas campanhas."
  }
}

/**
 * Selo de estado da camada de IA no cabeçalho.
 *
 * Existe porque a ausência da IA degrada em SILÊNCIO por desenho (a análise
 * responde 200 com `ai_insights: null`). Em 25/08/2026 descobrimos que o
 * servidor de produção estava sem chave havia semanas e a equipe avaliava o
 * produto sem metade dele, sem ter como perceber.
 *
 * `estadoInicial` é injetável só para teste — em uso normal o componente busca.
 */
export function AIStatusBadge({
  estadoInicial,
  buscar = buscarStatus
}: {
  estadoInicial?: EstadoIA
  buscar?: () => Promise<StatusServidor | null>
}) {
  const [estado, setEstado] = useState<EstadoIA>(estadoInicial ?? "desconhecido")
  const [modelo, setModelo] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  // Guardado para recalcular o selo quando uma análise revelar que a IA
  // prometida não respondeu, sem precisar consultar o servidor de novo.
  const status = useRef<StatusServidor | null>(null)

  useEffect(() => {
    // Um estado injetado é o que o teste quer observar; buscar por cima o
    // sobrescreveria e tornaria o teste sobre a rede, não sobre o selo.
    if (estadoInicial !== undefined) return

    let cancelado = false
    buscar()
      .then((s) => {
        if (cancelado) return
        status.current = s
        // Informa o aiHealth do que o servidor promete: sem isso ele não tem
        // como distinguir "prometeu e não entregou" de "está desligada".
        registrarStatusServidor(s === null ? null : s.ai.available)
        setEstado(estadoDaIA(s, lerSaudeIA()))
        setModelo(s?.ai.model ?? null)
      })
      // `buscarStatus` já trata tudo internamente e devolve null, mas o
      // componente não pode DEPENDER disso: uma rejeição aqui viraria
      // "unhandled rejection" (barulho no console de quem estiver depurando,
      // e um erro não capturado no teste). Falhar em saber é `desconhecido`,
      // que já é o estado inicial.
      .catch(() => {
        if (!cancelado) setEstado("desconhecido")
      })
    return () => {
      cancelado = true
    }
  }, [estadoInicial, buscar])

  // Uma análise pode revelar que a IA prometida não respondeu (chave revogada,
  // cota estourada). O selo reage sem nova consulta ao servidor — e volta a
  // "IA on" sozinho quando a análise seguinte trouxer IA de novo.
  useEffect(() => {
    if (estadoInicial !== undefined) return
    return assinarSaudeIA((saude: SaudeIA) =>
      setEstado(estadoDaIA(status.current, saude))
    )
  }, [estadoInicial])

  // Clicar fora fecha a explicação. Sem isto o popover fica preso na tela
  // enquanto a pessoa tenta usar o resto do cabeçalho.
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false)
    document.addEventListener("mousedown", fora)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", fora)
      document.removeEventListener("keydown", esc)
    }
  }, [aberto])

  const t = TEXTO_IA[estado]

  return (
    <div className="ai-status" ref={raiz}>
      <button
        className={`ai-badge-btn ai-${estado}`}
        // O título sozinho já responde "a IA está ligada?" sem exigir clique,
        // para quem passa o mouse ou usa leitor de tela.
        title={t.titulo}
        aria-label={`${t.titulo}. Clique para detalhes.`}
        aria-expanded={aberto}
        onClick={() => setAberto((o) => !o)}>
        <span className="ai-dot" />
        {t.rotulo}
      </button>

      {aberto && (
        <div className="ai-pop" role="dialog" aria-label={t.titulo}>
          <b>{t.titulo}</b>
          <p>{t.detalhe}</p>
          {/* O modelo só aparece quando a IA está de fato ativa: exibi-lo num
              servidor com a IA desligada sugeriria que ela está em uso. */}
          {estado === "on" && modelo && <code>{modelo}</code>}
        </div>
      )}
    </div>
  )
}
