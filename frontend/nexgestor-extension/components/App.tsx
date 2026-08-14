import { useEffect, useMemo, useState } from "react"

import { CampaignDetail } from "~components/CampaignDetail"
import { CommandPalette } from "~components/CommandPalette"
import { CompareModal } from "~components/CompareModal"
import { Header } from "~components/Header"
import { Home } from "~components/Home"
import { NewCampaignModal } from "~components/NewCampaignModal"
import { CAMPAIGNS } from "~data/mock"
import { idLocalDoServidor, listarCampanhasSalvas, salvarCampanha } from "~lib/api"
import { loadLive, marcarComoSalva, mesclarComServidor, upsertLive } from "~lib/store"
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

  // Busca a base compartilhada do servidor uma vez, na abertura. A tela já
  // nasce com o cache local, então isto só a atualiza — se o servidor estiver
  // fora do ar ou com a persistência desligada, `listarCampanhasSalvas`
  // devolve null e nada aqui acontece: a extensão segue como antes.
  useEffect(() => {
    let cancelado = false

    listarCampanhasSalvas().then(async (doServidor) => {
      if (cancelado || doServidor === null) return
      const mesclada = mesclarComServidor(doServidor)
      setLive(mesclada)

      // Sobe o que ficou só neste navegador — analisado enquanto o servidor
      // estava fora do ar, ou antes da persistência existir. Sem isto, essas
      // campanhas nunca chegariam à base da equipe e o `COMO-USAR.md` estaria
      // prometendo algo que não acontece.
      for (const pendente of mesclada.filter((c) => c.serverId === undefined)) {
        if (cancelado) return
        const serverId = await salvarCampanha(pendente)
        if (cancelado || serverId === null) continue
        setLive(reancorar(pendente, serverId))
      }
    })

    return () => {
      cancelado = true
    }
  }, [])

  /**
   * Passa a campanha a ser identificada pelo servidor.
   *
   * O id muda, então a tela aberta precisa acompanhar — sem isto, quem estiver
   * vendo o detalhe dessa campanha no momento da subida cai numa tela vazia.
   */
  const reancorar = (vm: CampaignVM, serverId: number) => {
    const idLocal = idLocalDoServidor(serverId)
    const lista = marcarComoSalva(vm, serverId, idLocal)
    setScreen((atual) =>
      atual.name === "detail" && atual.id === vm.id
        ? { name: "detail", id: idLocal }
        : atual
    )
    return lista
  }

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

      {/* `key` distinto por tela é obrigatório, não cosmético: Home e
          CampaignDetail renderizam ambos um `<div className="scroll">` na mesma
          posição da árvore, então o React reaproveita o MESMO nó do DOM ao
          trocar de tela — e o nó carrega junto o `scrollTop` da tela anterior.
          Quem tinha rolado a lista da Home via o detalhe abrir no meio da
          página e só depois saltar para o topo (medido: 531 → 0 em ~0,5s).
          Com keys diferentes o nó é recriado e já nasce no topo. */}
      {screen.name === "home" || !detail ? (
        <Home
          key="home"
          campaigns={campaigns}
          liveCount={live.length}
          onOpenCampaign={openCampaign}
          onNew={() => setModal("new")}
          onCompare={() => setModal("compare")}
        />
      ) : (
        <CampaignDetail key={`detail-${detail.id}`} c={detail} onBack={goHome} />
      )}

      {modal === "new" && (
        <NewCampaignModal
          onClose={() => setModal("none")}
          onAnalyzed={(vm) => {
            // Mostra imediatamente, sem esperar o servidor: a análise já está
            // pronta e prender a tela numa gravação seria pior que salvar
            // depois. Se o servidor não responder, a campanha fica só neste
            // navegador (sem `serverId`) e a mesclagem seguinte a preserva.
            setLive(upsertLive(vm))
            setModal("none")
            openCampaign(vm.id)

            // Reancorar o id é obrigatório: na base compartilhada quem
            // identifica é o servidor. Sem isto, a campanha da Ana e a do Bruno
            // nasceriam ambas com id 1000 e uma sobrescreveria a outra na
            // próxima sincronização.
            salvarCampanha(vm).then((serverId) => {
              if (serverId !== null) setLive(reancorar(vm, serverId))
            })
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
