import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"

export default function TimelineActionMenu({ anchor, actionName, onDelete, onClose }: {
    anchor: HTMLButtonElement; actionName: string; onDelete: () => void; onClose: () => void
}) {
    const menu = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        if (!menu.current) return
        const bounds = anchor.getBoundingClientRect()
        const popup = menu.current.getBoundingClientRect()
        menu.current.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - popup.width - 8))}px`
        menu.current.style.top = `${Math.max(8, bounds.bottom + popup.height + 4 <= window.innerHeight - 8
            ? bounds.bottom + 4 : bounds.top - popup.height - 4)}px`
        menu.current.querySelector("button")?.focus({ preventScroll: true })
    }, [anchor])
    useEffect(() => {
        const bounds = anchor.getBoundingClientRect()
        const outside = (event: Event) => {
            if (event.target instanceof Node && !menu.current?.contains(event.target) && !anchor.contains(event.target)) onClose()
        }
        const scroll = () => {
            const current = anchor.getBoundingClientRect()
            if (current.x !== bounds.x || current.y !== bounds.y) onClose()
        }
        document.addEventListener("pointerdown", outside)
        document.addEventListener("scroll", scroll, true)
        window.addEventListener("resize", onClose)
        return () => {
            document.removeEventListener("pointerdown", outside)
            document.removeEventListener("scroll", scroll, true)
            window.removeEventListener("resize", onClose)
        }
    }, [anchor, onClose])
    return createPortal(<div ref={menu} id="timeline-action-menu" className="timeline-action-menu" role="menu"
        aria-label={`${actionName} actions`} onKeyDown={event => {
            if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) event.preventDefault()
            if (event.key === "Escape" || event.key === "Tab") {
                if (event.key === "Escape") event.preventDefault()
                anchor.focus({ preventScroll: true })
                onClose()
            }
        }}>
        <button type="button" role="menuitem" onClick={() => { onClose(); onDelete() }}>Delete</button>
    </div>, document.body)
}
