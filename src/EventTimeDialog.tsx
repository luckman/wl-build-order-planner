import { useEffect, useRef, useState } from "react"
import DurationInput from "./DurationInput"
import { formatDuration, MAX_DURATION_SECONDS, parseDuration } from "./durationTime"

/** Manual timestamp editor shared by scrolls and future fixed-time events. */
export default function EventTimeDialog({ name, commandTime, onSave, onClose, title, submitLabel = "Save timestamp", wholeSeconds = false, validateTime }: {
    title?: string; submitLabel?: string; wholeSeconds?: boolean; validateTime?: (time: number) => string | null
    name: string; commandTime: number
    onSave: (time: number) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [time, setTime] = useState(() => formatDuration(wholeSeconds ? Math.ceil(commandTime) : commandTime))
    const seconds = parseDuration(time)
    const timeValid = seconds !== null && seconds >= 0 && seconds <= MAX_DURATION_SECONDS && (!wholeSeconds || Number.isInteger(seconds))
    const validationError = timeValid ? validateTime?.(seconds!) : null
    const valid = timeValid && !validationError
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => { if (previousFocus?.isConnected) previousFocus.focus() }
    }, [])
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="event-time-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="event-time-dialog-title">{title ?? `Change ${name} timestamp`}</h2>
            <form onSubmit={event => { event.preventDefault(); if (valid) onSave(seconds!) }}>
                <DurationInput wholeSeconds={wholeSeconds} label="Command time (mm:ss)" value={time} onChange={setTime} aria-invalid={!valid} />
                <p className="scroll-time-hint">The plan recalculates when saved and shows any timing conflicts.</p>
                {!timeValid && <p role="alert">Enter a valid mm:ss time between 00:00 and 29:59.</p>}
                {validationError && <p role="alert">{validationError}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid}>{submitLabel}</button></div>
            </form>
        </div>
    </div>
}
