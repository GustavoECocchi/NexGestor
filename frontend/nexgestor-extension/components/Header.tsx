import { IconLogo, IconSearch } from "~components/Icons"

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

export function Header({ onSearch }: { onSearch?: () => void }) {
  return (
    <div className="hd">
      <div className="logo"><IconLogo /></div>
      <div className="brand">
        <h1>NexGestor</h1>
        <p>Diagnóstico inteligente para tráfego pago</p>
      </div>
      <div className="spacer" />
      <button className="search-trigger" title="Buscar campanhas" onClick={onSearch}>
        <IconSearch />
        <span className="search-kbd">{isMac ? "⌘K" : "Ctrl K"}</span>
      </button>
    </div>
  )
}
