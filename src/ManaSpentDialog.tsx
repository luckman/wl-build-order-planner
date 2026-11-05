import { useEffect, useRef, useState } from "react"
import DurationInput from "./DurationInput"
import { formatDuration, parseDuration } from "./durationTime"
import type { ManaSpentAction, ManaSpentCommand } from "./game/manaSpent"

export default function ManaSpentDialog({ defaultTime, action, validate, onSave, onClose }: {
    defaultTime: number; action?: ManaSpentAction
    validate: (command: ManaSpentCommand) => string | null
    onSave: (command: ManaSpentCommand) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [time, setTime] = useState(() => formatDuration(action?.commandTime ?? defaultTime))
    const [amount, setAmount] = useState(String(action?.mana ?? 75))
    const commandTime = parseDuration(time)
    const valid = commandTime !== null && Number.isInteger(commandTime) && amount.trim() !== "" &&
        Number.isFinite(Number(amount)) && Number.isInteger(Number(amount)) && Number(amount) > 0
    const command: ManaSpentCommand = { type: "mana-spent", commandTime: commandTime!, mana: Number(amount) }
    const error = valid ? validate(command) : "Enter a time from 00:00 to 29:59 and a positive whole-number mana amount."
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => { if (previousFocus?.isConnected) previousFocus.focus() }
    }, [])
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="mana-spent-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="mana-spent-dialog-title">{action ? "Edit Mana spent" : "Mana spent"}</h2>
            <p>Spend mana instantly at the command time. Respects and starts the shared scroll cooldown, with no order delay or spell effect.</p>
            <form onSubmit={event => { event.preventDefault(); if (valid && !error) onSave(command) }}>
                <DurationInput wholeSeconds label="Command time (mm:ss)" value={time} onChange={setTime} />
                <label>Mana amount<input type="number" min="1" step="1" value={amount} onChange={event => setAmount(event.target.value)} /></label>
                {error && <p role="alert">{error}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid || !!error}>{action ? "Save event" : "Add event"}</button></div>
            </form>
        </div>
    </div>
}
