import { useCallback, useId, useState, type RefObject } from "react"
import ActionCardMenu from "./ActionCardMenu"

type Props = {
    name: string
    icon: string
    portalContainer: RefObject<HTMLDivElement>
    options: { name: string; icon: string; select: () => void }[]
}

export default function EventDropdown({ name, icon, portalContainer, options }: Props) {
    const id = useId()
    const [open, setOpen] = useState<{ anchor: HTMLButtonElement; last: boolean } | null>(null)
    const dismiss = useCallback(() => setOpen(null), [])

    return <>
        <button type="button" className="action resource-card upgrade-card event-dropdown" aria-label={name}
            aria-haspopup="menu" aria-expanded={!!open} aria-controls={open ? id : undefined}
            onClick={event => {
                if (open) {
                    event.currentTarget.focus()
                    dismiss()
                } else {
                    setOpen({ anchor: event.currentTarget, last: false })
                }
            }}
            onKeyDown={event => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault()
                    setOpen({ anchor: event.currentTarget, last: event.key === "ArrowUp" })
                }
            }}>
            <span className="action-name">{name}</span>
            <img src={icon} alt="" />
            <span className="upgrade-arrow" aria-hidden="true">▾</span>
        </button>
        {open && <ActionCardMenu anchor={open.anchor} last={open.last} portalContainer={portalContainer}
            id={id} label={name} onDismiss={dismiss}>
            {options.map(option => <button type="button" role="menuitem" tabIndex={-1} key={option.name} onClick={() => {
                open.anchor.focus()
                dismiss()
                option.select()
            }}>
                <img className="upgrade-option-icon" src={option.icon} alt="" />
                <span className="upgrade-option-name">{option.name}</span>
            </button>)}
        </ActionCardMenu>}
    </>
}
