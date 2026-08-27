import logo from "~assets/logo.png"
import { IconHelp, IconPlus, IconSpark } from "~components/Icons"
import { getDono, limparDono } from "~lib/dono"

/** Destinos da navegação lateral. `nova` abre o formulário, não uma tela. */
export type NavKey = "campanhas" | "nova" | "ajuda"

/**
 * Casca de dashboard full-screen: sidebar fixa + área de conteúdo.
 *
 * Web app novo (substitui o side panel da extensão, que fica congelada em
 * frontend/nexgestor-extension).
 *
 * Por que "Nova campanha" NÃO é um `dash-side-item` como os outros: ela abre um
 * modal e volta para a tela onde você já estava, então nunca fica "ativa". Um
 * item de menu que nunca acende, ao lado de dois que acendem, ensina a coisa
 * errada sobre o menu. Como ação em destaque ela também deixa de disputar peso
 * visual com "Campanhas" — que era o risco registrado no §9 do PRD da fase-2.
 */
export function DashboardShell({
  children,
  ativo,
  onNavegar
}: {
  children: React.ReactNode
  ativo: Exclude<NavKey, "nova">
  onNavegar: (destino: NavKey) => void
}) {
  const dono = getDono()

  return (
    <div className="dash-shell">
      <aside className="dash-side">
        <div className="dash-side-brand">
          <div className="logo"><img src={logo} alt="NexGestor" /></div>
          <span>NexGestor</span>
        </div>
        <nav className="dash-side-nav" aria-label="Navegação principal">
          <button className="dash-side-novo" onClick={() => onNavegar("nova")}>
            <IconPlus />
            <span>Nova campanha</span>
          </button>
          <button
            className={`dash-side-item${ativo === "campanhas" ? " active" : ""}`}
            aria-current={ativo === "campanhas" ? "page" : undefined}
            onClick={() => onNavegar("campanhas")}>
            <IconSpark />
            <span>Campanhas</span>
          </button>
          <button
            className={`dash-side-item${ativo === "ajuda" ? " active" : ""}`}
            aria-current={ativo === "ajuda" ? "page" : undefined}
            onClick={() => onNavegar("ajuda")}>
            <IconHelp />
            <span>Ajuda</span>
          </button>
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
