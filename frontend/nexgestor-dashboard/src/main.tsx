import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "~components/App"
import { DashboardShell } from "~components/DashboardShell"
import { DonoGate } from "~components/DonoGate"
import "~style.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DonoGate>
      <DashboardShell>
        <App />
      </DashboardShell>
    </DonoGate>
  </StrictMode>
)
