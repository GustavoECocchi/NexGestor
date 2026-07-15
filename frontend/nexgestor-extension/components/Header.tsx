import { IconLogo, IconSearch } from "~components/Icons"

export function Header({ onSearch }: { onSearch?: () => void }) {
  return (
    <div className="hd">
      <div className="logo"><IconLogo /></div>
      <div className="brand">
        <h1>NexGestor</h1>
        <p>Diagnóstico inteligente para tráfego pago</p>
      </div>
      <div className="spacer" />
      <div className="icon-btn" title="Buscar (⌘K)" onClick={onSearch}><IconSearch /></div>
    </div>
  )
}
