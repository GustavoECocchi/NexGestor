import { useId, useLayoutEffect, useRef, useState } from "react"

import { IconInfo } from "~components/Icons"

const TIP_WIDTH = 220

/**
 * Ícone "?" que mostra uma explicação em linguagem simples ao lado de um
 * campo do formulário. Posicionado com `position:fixed` (calculado a partir
 * do próprio botão) em vez de `absolute` porque o modal de campanha tem
 * `overflow-y:auto` — um tooltip `absolute` cortaria nas bordas do modal.
 */
export function FieldHint({ text }: { text: string }) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - TIP_WIDTH / 2),
      window.innerWidth - TIP_WIDTH - 8
    )
    setPos({ top: r.bottom + 6, left })
  }, [open])

  return (
    <span className="fld-hint">
      <button
        ref={btnRef}
        type="button"
        className="fld-hint-btn"
        aria-label={`Ajuda: ${text}`}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}>
        <IconInfo />
      </button>
      {open && (
        <span role="tooltip" id={id} className="fld-hint-tip" style={{ top: pos.top, left: pos.left, width: TIP_WIDTH }}>
          {text}
        </span>
      )}
    </span>
  )
}
