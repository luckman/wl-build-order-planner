import { useEffect, useRef, useState } from "react"

import DurationInput from "./DurationInput"
import { formatDuration, parseDuration, MAX_DURATION_SECONDS } from "./durationTime"

export default function ScrollDialog({ minimumTime, automaticTime, onAdd, onClose }: {
    minimumTime: number; automaticTime: number | null
    onAdd: (time: number) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [automatic, setAutomatic] = useState(true)
    const [manualTime, setManualTime] = useState(() => formatDuration(automaticTime ?? minimumTime))
    const commandTime = automatic ? automaticTime : parseDuration(manualTime)
    const valid = commandTime !== null && Number.isFinite(commandTime) && commandTime >= minimumTime && commandTime <= MAX_DURATION_SECONDS
    useEffect(() => {
        const previousFocus = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => previousFocus?.focus()
    }, [])
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="scroll-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input:not(:disabled), select, button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="scroll-dialog-title">Use Gold Rush</h2>
            <p>50 mana · starts after 1 second · +10 gold per mine exit for 30 seconds.</p>
            <p>Only level 1 scroll effects are currently supported.</p>
            <form onSubmit={event => { event.preventDefault(); if (valid) onAdd(commandTime!) }}>
                <label className="scroll-automatic"><input type="checkbox" checked={automatic}
                    onChange={event => setAutomatic(event.target.checked)} /> Use after the last scroll as soon as enough mana is available</label>
                <DurationInput label="Command time (mm:ss)" disabled={automatic}
                    value={automatic ? automaticTime === null || automaticTime > MAX_DURATION_SECONDS ? "" : formatDuration(automaticTime) : manualTime}
                    onChange={setManualTime} />
                <p className="scroll-time-hint">The timestamp is fixed when added. Click its Build order row to change it.</p>
                {automatic && automaticTime === null && <p role="alert">Enough mana cannot be reached with the current plan. Choose a manual timestamp to add a blocked command.</p>}
                {!automatic && !valid && <p role="alert">Enter a valid mm:ss time between {formatDuration(minimumTime)} and 99:59.</p>}
                {automatic && automaticTime !== null && automaticTime > MAX_DURATION_SECONDS && <p role="alert">The earliest available command exceeds the maximum time of 99:59.</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid}>Add scroll</button></div>
            </form>
        </div>
    </div>
}
