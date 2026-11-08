import { useCallback, useEffect, useRef } from "react"
import "./confirm-action-dialog.css"

export default function ConfirmActionDialog({ title, message, confirmLabel, onConfirm, onClose }: {
    title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void
}) {
    const cancel = useRef<HTMLButtonElement>(null)
    const confirm = useRef<HTMLButtonElement>(null)
    const previousFocus = useRef<HTMLElement | null>(null)
    const restoreFocus = useCallback(() => {
        if (previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true })
    }, [])
    useEffect(() => {
        previousFocus.current = document.activeElement as HTMLElement | null
        cancel.current?.focus()
        return restoreFocus
    }, [restoreFocus])
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="confirm-action-title" aria-describedby="confirm-action-message"
            onKeyDown={event => {
                if (event.key === "Escape") {
                    event.preventDefault()
                    event.stopPropagation()
                    onClose()
                }
                if (event.key === "Tab") {
                    event.preventDefault()
                    const next = document.activeElement === cancel.current ? confirm.current : cancel.current
                    next?.focus()
                }
            }}>
            <h2 id="confirm-action-title">{title}</h2>
            <p id="confirm-action-message">{message}</p>
            <div className="scroll-dialog-buttons">
                <button ref={cancel} type="button" onClick={onClose}>Cancel</button>
                <button ref={confirm} type="button" className="confirm-destructive" onClick={() => {
                    restoreFocus()
                    onConfirm()
                }}>{confirmLabel}</button>
            </div>
        </div>
    </div>
}
