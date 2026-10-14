import { useEffect, useRef, useState } from "react"

import DurationInput from "./DurationInput"

import { formatDuration, parseDuration } from "./durationTime"

import type { AddResourcesCommand, ResourceAction } from "./game/resourceEvents"



export default function ResourceDialog({ defaultTime, action, onSave, onClose, validationError }: {

    defaultTime: number; action?: ResourceAction; validationError?: string | null

    onSave: (command: AddResourcesCommand) => void; onClose: () => void

}) {

    const dialog = useRef<HTMLDivElement>(null)

    const [time, setTime] = useState(() => formatDuration(Math.ceil(action?.commandTime ?? defaultTime)))

    const [gold, setGold] = useState(String(action?.resourceGold ?? 300))

    const [wood, setWood] = useState(String(action?.resourceWood ?? 300))

    const commandTime = parseDuration(time)

    const valid = commandTime !== null && Number.isInteger(commandTime) && [gold, wood].every(value => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0)

    useEffect(() => {

        const previousFocus = document.activeElement as HTMLElement | null

        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()

        return () => { if (previousFocus?.isConnected) previousFocus.focus() }

    }, [])

    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>

        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="resource-dialog-title"

            onKeyDown={event => {

                if (event.key === "Escape") { event.stopPropagation(); onClose() }

                if (event.key === "Tab") {

                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, button:not(:disabled)"))

                    const first = controls[0], last = controls[controls.length - 1]

                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }

                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }

                }

            }}>

            <h2 id="resource-dialog-title">{action ? "Edit Add resources" : "Add resources"}</h2>

            <p>Gold and wood are added instantly at the command time, with no delays.</p>

            <form onSubmit={event => { event.preventDefault(); if (valid && !validationError) onSave({ type: "add-resources", commandTime: commandTime!, gold: Number(gold), wood: Number(wood) }) }}>

                <DurationInput wholeSeconds label="Command time (mm:ss)" value={time} onChange={setTime} />

                <label>Gold<input type="number" min="0" step="any" value={gold} onChange={event => setGold(event.target.value)} /></label>

                <label>Wood<input type="number" min="0" step="any" value={wood} onChange={event => setWood(event.target.value)} /></label>

                {!valid && <p role="alert">Enter a valid time from 00:00 to 29:59 and non-negative resource amounts.</p>}

                {validationError && <p role="alert">{validationError}</p>}

                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid || !!validationError}>{action ? "Save event" : "Add resources"}</button></div>

            </form>

        </div>

    </div>

}

