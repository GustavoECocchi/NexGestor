import logo from "~assets/logo.png"
import { IconSpark } from "~components/Icons"
import { getDono, limparDono } from "~lib/dono"

/**
 * Casca de dashboard full-screen: sidebar fixa + área de conteúdo.
 *
 * Web app novo (substitui o side panel da extensão, que fica congelada em
 * frontend/nexgestor-extension). Só um item de navegação por enquanto —
 * "Campanhas" é a única tela que existe; a sidebar existe para já estabelecer
 * o formato de dashboard e crescer sem redesenho quando surgirem outras.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const dono = getDono()

  return (
    <div className="dash-shell">
      <aside className="dash-side">
        <div className="dash-side-brand">
          <div className="logo"><img src={logo} alt="NexGestor" /></div>
          <span>NexGestor</span>
        </div>
        <nav className="dash-side-nav">
          <div className="dash-side-item active">
            <IconSpark />
            <span>Campanhas</span>
          </div>
        </nav>
        <div className="dash-side-foot">
          {dono && (
            <>
              <div className="dash-side-dono" title={dono}>{dono}</div>
              <button
                className="dash-side-trocar"
                onClick={() => { limparDono(); window.location.reload() }}>
                Trocar identificação
              </button>
            </>
          )}
        </div>
      </aside>
      <main className="dash-main">{children}</main>
    </div>
  )
}
