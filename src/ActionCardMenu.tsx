import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import { createPortal } from "react-dom"

type Props = {
    anchor: HTMLButtonElement
    last: boolean
    id: string
    label: string
    portalContainer: RefObject<HTMLDivElement>
    onDismiss: () => void
    children: ReactNode
}

export default function ActionCardMenu({ anchor, last, id, label, portalContainer, onDismiss, children }: Props) {
    const menu = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        if (!menu.current) return
        const bounds = anchor.getBoundingClientRect()
        const popup = menu.current.getBoundingClientRect()
        menu.current.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - popup.width - 8))}px`
        menu.current.style.top = `${Math.max(8, bounds.bottom + popup.height + 4 <= window.innerHeight - 8
            ? bounds.bottom + 4 : bounds.top - popup.height - 4)}px`
        const buttons = menu.current.querySelectorAll<HTMLButtonElement>("button")
        buttons[last ? buttons.length - 1 : 0]?.focus()
    }, [anchor, last])
    useEffect(() => {
        const anchorBounds = anchor.getBoundingClientRect()
        const dismissOutside = (event: Event) => {
            if (!portalContainer.current?.hasAttribute("inert") && event.target instanceof Node &&
                !menu.current?.contains(event.target) && !anchor.contains(event.target)) {
                onDismiss()
            }
        }
        const dismissOnScroll = (event: Event) => {
            // Opening via a scrolled-into-view trigger can leave a queued scroll
            // event. Only dismiss when scrolling actually moves the anchor.
            const current = anchor.getBoundingClientRect()
            if (current.x !== anchorBounds.x || current.y !== anchorBounds.y) dismissOutside(event)
        }
        const dismissOnResize = () => onDismiss()
        document.addEventListener("pointerdown", dismissOutside)
        document.addEventListener("scroll", dismissOnScroll, true)
        window.addEventListener("resize", dismissOnResize)
        return () => {
            document.removeEventListener("pointerdown", dismissOutside)
            document.removeEventListener("scroll", dismissOnScroll, true)
            window.removeEventListener("resize", dismissOnResize)
        }
    }, [anchor, onDismiss, portalContainer])

    return portalContainer.current && createPortal(<div ref={menu} className="action-dropdown-menu" role="menu"
        id={id} aria-label={label}
        onKeyDown={event => {
            if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault()
                anchor.focus()
                onDismiss()
            } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault()
                const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>("button"))
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
                const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
                    : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length
                buttons[next]?.focus()
            }
        }}>
        {children}
    </div>, portalContainer.current)
}
