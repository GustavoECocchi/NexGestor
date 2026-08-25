import { useState } from "react"

import { getDono, setDono } from "~lib/dono"

/**
 * Portão simples antes do dashboard: sem ele, toda chamada a
 * /api/v1/campaigns* volta 422 (o backend exige o header X-Nex-Dono).
 *
 * NÃO é login — sem senha, sem verificação, qualquer texto vira identidade.
 * Existe só para separar a visão de cada pessoa na base compartilhada. Ver
 * ~lib/dono e o aviso equivalente em app/routes/campanhas_salvas.py.
 */
export function DonoGate({ children }: { children: React.ReactNode }) {
  const [dono, setDonoState] = useState(() => getDono())
  const [valor, setValor] = useState("")
  const [erro, setErro] = useState<string | null>(null)

  if (dono) return <>{children}</>

  function confirmar() {
    const salvo = setDono(valor)
    if (!salvo) {
      setErro("Digite seu nome ou e-mail para continuar.")
      return
    }
    setDonoState(salvo)
  }

  return (
    <div className="dono-gate">
      <div className="dono-gate-card">
        <h1>Bem-vindo ao NexGestor</h1>
        <p>
          Como podemos te chamar? Isso identifica suas campanhas na base — não
          é senha, é só pra separar o que é seu do que é da equipe.
        </p>
        <input
          autoFocus
          placeholder="Seu nome ou e-mail"
          value={valor}
          onChange={(e) => { setValor(e.target.value); setErro(null) }}
          onKeyDown={(e) => e.key === "Enter" && confirmar()}
        />
        {erro && <div className="dono-gate-erro" role="alert">{erro}</div>}
        <button onClick={confirmar}>Entrar</button>
      </div>
    </div>
  )
}
