import { IconMoon, IconSearch, IconSun } from "~components/Icons"
import logo from "~assets/logo.png"
import { useTheme } from "~lib/theme"

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

export function Header({ onSearch }: { onSearch?: () => void }) {
  const { theme, toggle } = useTheme()
  return (
    <div className="hd">
      <div className="logo"><img src={logo} alt="NexGestor" /></div>
      <div className="brand">
        <h1>NexGestor</h1>
        <p>Diagnóstico inteligente para tráfego pago</p>
      </div>
      <div className="spacer" />
      <button
        className="icon-btn"
        title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        onClick={toggle}>
        {theme === "dark" ? <IconSun /> : <IconMoon />}
      </button>
      <button className="search-trigger" title="Buscar campanhas" onClick={onSearch}>
        <IconSearch />
        <span className="search-kbd">{isMac ? "⌘K" : "Ctrl K"}</span>
      </button>
    </div>
  )
}
