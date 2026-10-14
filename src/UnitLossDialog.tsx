import { useEffect, useRef, useState } from "react"
import DurationInput from "./DurationInput"
import { formatDuration, parseDuration } from "./durationTime"
import { factions, isRecruitable, type FactionId } from "./game/gameData"
import type { UnitLossAction, UnitLossCommand } from "./game/unitLosses"

export default function UnitLossDialog({ faction, defaultTime, action, validate, onSave, onClose }: {
    faction: FactionId; defaultTime: number; action?: UnitLossAction
    validate: (command: UnitLossCommand) => string | null
    onSave: (command: UnitLossCommand) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [time, setTime] = useState(() => formatDuration(Math.ceil(action?.commandTime ?? defaultTime)))
    const [unitId, setUnitId] = useState(action?.unitId ?? (faction === "light" ? "worker" : "slave"))
    const commandTime = parseDuration(time)
    const timeValid = commandTime !== null && Number.isInteger(commandTime)
    const command: UnitLossCommand = { type: "lose-unit", commandTime: commandTime ?? 0, unitId }
    const error = timeValid ? validate(command) : "Enter a valid whole-second time from 00:00 to 29:59."
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => { if (previousFocus?.isConnected) previousFocus.focus() }
    }, [])
    const workerId = faction === "light" ? "worker" : "slave"
    const units = factions[faction].items.filter(isRecruitable)
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="unit-loss-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, select, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="unit-loss-dialog-title">Lose unit</h2>
            <form onSubmit={event => { event.preventDefault(); if (timeValid && !error) onSave(command) }}>
                <DurationInput wholeSeconds label="Command time (mm:ss)" value={time} onChange={setTime} aria-invalid={!timeValid} />
                <label>Unit type<select value={unitId} onChange={event => setUnitId(event.target.value)}>
                    <optgroup label="Workers">{units.filter(unit => unit.id === workerId).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                    <optgroup label="Units">{units.filter(unit => unit.kind === "unit" && unit.id !== workerId).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                    <optgroup label="Heroes">{units.filter(unit => unit.kind === "hero").map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                </select></label>
                <p className="scroll-time-hint">The unit must be alive and fully recruited. Workers assigned to construction cannot be lost. Wood gatherers are lost before gold miners.</p>
                {error && <p role="alert">{error}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!timeValid || !!error}>{action ? "Save event" : "Add event"}</button></div>
            </form>
        </div>
    </div>
}
