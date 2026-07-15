// Faz o clique no ícone da extensão abrir o side panel.
// Rodado toda vez que o service worker inicia (mais confiável que onInstalled).
export {}

chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err: unknown) => console.error("[NexGestor] sidePanel:", err))
