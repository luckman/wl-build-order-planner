import type { WorkerCasualtyGroup } from "./game/gameData"
import { useEffect, useMemo, useRef, useState } from "react"
import DurationInput from "./DurationInput"
import { formatDuration, parseDuration } from "./durationTime"
import { factions, isRecruitable, type FactionId } from "./game/gameData"
import type { UnitKilledAction, UnitKilledCommand } from "./game/unitsKilled"

export default function UnitKilledDialog({ faction, defaultTime, action, validate, onSave, onClose }: {
    faction: FactionId; defaultTime: number; action?: UnitKilledAction
    validate: (command: UnitKilledCommand) => string | null
    onSave: (command: UnitKilledCommand) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [time, setTime] = useState(() => formatDuration(Math.ceil(action?.commandTime ?? defaultTime)))
    const [unitId, setUnitId] = useState(action?.unitId ?? (faction === "light" ? "worker" : "slave"))
    const [workerGroup, setWorkerGroup] = useState<WorkerCasualtyGroup>(action?.workerGroup ?? "gathering")
    const commandTime = parseDuration(time)
    const timeValid = commandTime !== null && Number.isInteger(commandTime)
    const workerId = faction === "light" ? "worker" : "slave"
    const command = useMemo<UnitKilledCommand>(() => ({ type: "unit-is-killed", commandTime: commandTime ?? 0, unitId,
        ...(unitId === workerId ? { workerGroup } : {}) }), [commandTime, unitId, workerGroup, workerId])
    const error = useMemo(() => timeValid ? validate(command) : "Enter a valid whole-second time from 00:00 to 29:59.",
        [command, timeValid, validate])
    const idleUnavailable = useMemo(() => unitId === workerId && workerGroup !== "idle" && !!validate({ ...command, workerGroup: "idle" }),
        [command, unitId, validate, workerGroup, workerId])
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => { if (previousFocus?.isConnected) previousFocus.focus() }
    }, [])
    const units = factions[faction].items.filter(isRecruitable)
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="unit-is-killed-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, select, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="unit-is-killed-dialog-title">Unit is killed</h2>
            <form onSubmit={event => { event.preventDefault(); if (timeValid && !error) onSave(command) }}>
                <DurationInput wholeSeconds label="Command time (mm:ss)" value={time} onChange={setTime} aria-invalid={!timeValid} />
                <label>Unit type<select value={unitId} onChange={event => setUnitId(event.target.value)}>
                    <optgroup label="Workers">{units.filter(unit => unit.id === workerId).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                    <optgroup label="Units">{units.filter(unit => unit.kind === "unit" && unit.id !== workerId).map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                    <optgroup label="Heroes">{units.filter(unit => unit.kind === "hero").map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>
                </select></label>
                {unitId === workerId && <label>Worker group<select value={workerGroup} onChange={event => setWorkerGroup(event.target.value as WorkerCasualtyGroup)}>
                    <option value="gathering">Gathering worker</option>
                    <option value="idle" disabled={idleUnavailable}>Idle worker</option>
                </select></label>}
                <p className="scroll-time-hint">The unit must be alive and fully recruited. Workers assigned to construction cannot be killed. Wood gatherers are killed before gold miners.</p>
                {error && <p role="alert">{error}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!timeValid || !!error}>{action ? "Save event" : "Add event"}</button></div>
            </form>
        </div>
    </div>
}
