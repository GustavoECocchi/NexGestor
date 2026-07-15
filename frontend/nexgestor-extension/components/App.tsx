import { useEffect, useMemo, useState } from "react"

import { CampaignDetail } from "~components/CampaignDetail"
import { CommandPalette } from "~components/CommandPalette"
import { CompareModal } from "~components/CompareModal"
import { Header } from "~components/Header"
import { Home } from "~components/Home"
import { NewCampaignModal } from "~components/NewCampaignModal"
import { CAMPAIGNS } from "~data/mock"
import { loadLive, upsertLive } from "~lib/store"
import type { CampaignVM } from "~types"

type Screen = { name: "home" } | { name: "detail"; id: number }
type Modal = "none" | "new" | "compare"

const STORE_KEY = "nex:screen"

// Persiste a última tela/campanha para reabrir onde o usuário parou.
function loadScreen(): Screen {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { name: "home" }
    return JSON.parse(raw) as Screen
  } catch {
    return { name: "home" }
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(loadScreen)
  const [modal, setModal] = useState<Modal>("none")
  const [palette, setPalette] = useState(false)
  // Campanhas analisadas ao vivo (persistidas em localStorage) + demo mock.
  const [live, setLive] = useState<CampaignVM[]>(loadLive)

  const campaigns = useMemo(() => [...live, ...CAMPAIGNS], [live])

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(screen))
    } catch {
      /* ignore */
    }
  }, [screen])

  // ⌘K / Ctrl+K abre o command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPalette((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const openCampaign = (id: number) => {
    setModal("none")
    setPalette(false)
    setScreen({ name: "detail", id })
  }
  const goHome = () => setScreen({ name: "home" })

  // Tela persistida pode apontar para campanha que não existe mais.
  const detail =
    screen.name === "detail" ? campaigns.find((c) => c.id === screen.id) : undefined

  return (
    <div className="app">
      <Header onSearch={() => setPalette(true)} />

      {screen.name === "home" || !detail ? (
        <Home
          campaigns={campaigns}
          onOpenCampaign={openCampaign}
          onNew={() => setModal("new")}
          onCompare={() => setModal("compare")}
        />
      ) : (
        <CampaignDetail c={detail} onBack={goHome} />
      )}

      {modal === "new" && (
        <NewCampaignModal
          onClose={() => setModal("none")}
          onAnalyzed={(vm) => {
            setLive(upsertLive(vm))
            setModal("none")
            openCampaign(vm.id)
          }}
        />
      )}

      {modal === "compare" && (
        <CompareModal campaigns={campaigns} onClose={() => setModal("none")} />
      )}

      {palette && (
        <CommandPalette
          campaigns={campaigns}
          onClose={() => setPalette(false)}
          onSelectCampaign={openCampaign}
          onNew={() => {
            setPalette(false)
            setModal("new")
          }}
          onCompare={() => {
            setPalette(false)
            setModal("compare")
          }}
        />
      )}
    </div>
  )
}
