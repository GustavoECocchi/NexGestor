import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "~components/App"
import { DonoGate } from "~components/DonoGate"
import "~style.css"

// `DashboardShell` saiu daqui para dentro do `App` (fase-2): a sidebar agora
// navega, e quem sabe qual tela está aberta — e como trocar de tela — é o
// `App`. Montá-la aqui fora exigiria erguer o estado de navegação até este
// arquivo ou passá-lo por contexto, sem nada em troca.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DonoGate>
      <App />
    </DonoGate>
  </StrictMode>
)
