import { useEffect, useRef, useState } from "react"

import DurationInput from "./DurationInput"

import { formatDuration, parseDuration } from "./durationTime"

import type { ResourcesCollectedCommand, ResourcesCollectedAction } from "./game/resourcesCollected"



export default function ResourcesCollectedDialog({ defaultTime, action, onSave, onClose, validationError }: {

    defaultTime: number; action?: ResourcesCollectedAction; validationError?: string | null

    onSave: (command: ResourcesCollectedCommand) => void; onClose: () => void

}) {

    const dialog = useRef<HTMLDivElement>(null)

    const [time, setTime] = useState(() => formatDuration(Math.ceil(action?.commandTime ?? defaultTime)))

    const [gold, setGold] = useState(String(action?.collectedGold ?? 300))

    const [wood, setWood] = useState(String(action?.collectedWood ?? 300))

    const commandTime = parseDuration(time)

    const valid = commandTime !== null && Number.isInteger(commandTime) && [gold, wood].every(value => value.trim() !== "" && Number.isFinite(Number(value)))

    useEffect(() => {

        const previousFocus = document.activeElement as HTMLElement | null

        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()

        return () => { if (previousFocus?.isConnected) previousFocus.focus() }

    }, [])

    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>

        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="resources-collected-dialog-title"

            onKeyDown={event => {

                if (event.key === "Escape") { event.stopPropagation(); onClose() }

                if (event.key === "Tab") {

                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input, button:not(:disabled)"))

                    const first = controls[0], last = controls[controls.length - 1]

                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }

                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }

                }

            }}>

            <h2 id="resources-collected-dialog-title">{action ? "Edit Resources collected" : "Resources collected"}</h2>

            <p>Gold and wood are adjusted instantly at the command time, with no delays. Negative amounts subtract resources; balances cannot fall below zero.</p>

            <form onSubmit={event => { event.preventDefault(); if (valid && !validationError) onSave({ type: "resources-collected", commandTime: commandTime!, gold: Number(gold), wood: Number(wood) }) }}>

                <DurationInput wholeSeconds label="Command time (mm:ss)" value={time} onChange={setTime} />

                <label>Gold<input type="number" step="any" value={gold} onChange={event => setGold(event.target.value)} /></label>

                <label>Wood<input type="number" step="any" value={wood} onChange={event => setWood(event.target.value)} /></label>

                {!valid && <p role="alert">Enter a valid time from 00:00 to 29:59 and finite resource amounts.</p>}

                {validationError && <p role="alert">{validationError}</p>}

                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!valid || !!validationError}>{action ? "Save event" : "Resources collected"}</button></div>

            </form>

        </div>

    </div>

}

