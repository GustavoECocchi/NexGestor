import { IconMoon, IconSearch, IconSun } from "~components/Icons"
import { useTheme } from "~lib/theme"

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform)

/**
 * Barra de topo do dashboard. A marca (logo + "NexGestor") já vive na sidebar
 * (`DashboardShell`) — repeti-la aqui era o mesmo elemento duas vezes na
 * mesma tela. Esta barra só carrega o que é específico da tela atual (o rótulo
 * da seção) e as ações utilitárias (tema, busca).
 */
export function Header({ section, onSearch }: { section: string; onSearch?: () => void }) {
  const { theme, toggle } = useTheme()
  return (
    <div className="hd">
      <div className="hd-section">{section}</div>
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
