import { useEffect, useRef, useState } from "react"
import type { PlannerItem } from "./game/gameData"
import { parseConstructionSettings, type ConstructionSettings } from "./game/constructionSettings"

export default function ConstructionDialog({ item, buildingName, globalDelay, editing, onSave, onClose, validationError }: {
    item: PlannerItem; buildingName: string; globalDelay: number; editing: boolean; validationError?: string | null
    onSave: (settings: ConstructionSettings) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [outward, setOutward] = useState<string | undefined>(item.construction?.outwardDuration?.toString())
    const [back, setBack] = useState<string | undefined>(item.construction?.returnDuration?.toString())
    const [preparation, setPreparation] = useState(String(item.construction?.preparationDuration ?? 0))
    const [useIdleWorker, setUseIdleWorker] = useState(item.construction?.useIdleWorker ?? false)
    const [helpHovered, setHelpHovered] = useState(false)
    const [helpFocused, setHelpFocused] = useState(false)
    const helpOpen = helpHovered || helpFocused
    const settings: ConstructionSettings = { useIdleWorker, preparationDuration: Number(preparation), ...(outward !== undefined ? { outwardDuration: Number(outward) } : {}),
        ...(back !== undefined ? { returnDuration: Number(back) } : {}) }
    let error = validationError
    try {
        if (!preparation.trim()) throw new Error("Enter a preparation duration.")
        if (outward?.trim() === "" || back?.trim() === "") throw new Error("Enter a travel duration or use global.")
        parseConstructionSettings(settings)
    } catch (failure) { error = (failure as Error).message }
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null
        dialog.current?.querySelector<HTMLInputElement>("input")?.focus()
        return () => { if (previous?.isConnected) previous.focus() }
    }, [])
    const upgrade = item.kind === "upgrade"
    const globalSeconds = `${Number.isInteger(globalDelay) ? globalDelay.toFixed(1) : globalDelay} s`
    const resetLabel = `Use global (${globalSeconds})`
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog construction-dialog panel" role="dialog" aria-modal="true" aria-labelledby="construction-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") {
                    event.stopPropagation()
                    if (helpFocused) {
                        setHelpHovered(false)
                        setHelpFocused(false)
                    } else onClose()
                }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <div className="construction-dialog-heading">
                <h2 id="construction-dialog-title">{editing ? "Edit" : "Configure"} {buildingName} {upgrade ? "Upgrade" : "Construction"}</h2>
                <div onPointerEnter={event => { if (event.pointerType === "mouse") setHelpHovered(true) }}
                    onPointerLeave={() => setHelpHovered(false)}>
                    <button type="button" className="timeline-help-button" aria-label="Construction timing help"
                        aria-describedby="construction-timing-help"
                        onFocus={() => setHelpFocused(true)} onBlur={() => setHelpFocused(false)}
                        onClick={event => { event.currentTarget.focus(); setHelpFocused(true) }}>?</button>
                    <div id="construction-timing-help" className="timeline-help-tooltip construction-timing-help" role="tooltip" hidden={!helpOpen}>
                        <p><strong>Preparation</strong> reserves the worker before the command. A gathering worker stops gathering at that point.</p>
                        <p><strong>Outward travel</strong> starts when you issue the command. You need the resources at that moment. Work starts when the worker arrives.</p>
                        <p><strong>Return travel</strong> starts when work finishes. Idle builders skip this trip.</p>
                    </div>
                </div>
            </div>
            {upgrade && item.level !== undefined && <p className="construction-target-level">Target level {item.level}</p>}
            {/* Keep accepting valid imported durations that are finer than the input's step. */}
            <form noValidate onSubmit={event => { event.preventDefault(); if (!error) onSave(settings) }}>
                <div className="construction-duration-row">
                    <label htmlFor="construction-preparation">Preparation (s)</label>
                    <input id="construction-preparation" type="number" min="0" step="0.1" inputMode="decimal" value={preparation}
                        onChange={event => setPreparation(event.target.value)} />
                </div>
                <label className="construction-idle"><input type="checkbox" checked={useIdleWorker}
                    onChange={event => setUseIdleWorker(event.target.checked)} />Use idle worker</label>
                {([
                    { id: "construction-outward", label: "Outward travel", value: outward, set: setOutward, disabled: false },
                    { id: "construction-return", label: "Return travel", value: back, set: setBack, disabled: useIdleWorker },
                ]).map(field => <div key={field.id} className={`construction-duration-row${field.disabled ? " construction-inactive" : ""}`}>
                    <label htmlFor={field.id}>{field.label} (s)</label>
                    <input id={field.id} type="number" min="0" step="0.1" inputMode="decimal" disabled={field.disabled} value={field.value ?? globalDelay}
                        className="construction-travel-input"
                        aria-describedby={`${field.id}-source${field.disabled ? " construction-return-help" : ""}`}
                        onChange={event => field.set(event.target.value)} />
                    <div className="construction-source">
                        <span id={`${field.id}-source`}>{field.value === undefined ? `Global: ${globalSeconds}` : "Custom"}</span>
                        {field.value !== undefined && <button type="button" className="construction-reset" disabled={field.disabled}
                            onClick={event => {
                                const input = event.currentTarget.form?.elements.namedItem(field.id)
                                if (input instanceof HTMLInputElement) input.focus()
                                field.set(undefined)
                            }} aria-label={`${resetLabel} for ${field.label.toLowerCase()}`}>{resetLabel}</button>}
                    </div>
                    {field.disabled && <p id="construction-return-help" className="construction-return-help">
                        Idle builders skip return travel and remain idle
                    </p>}
                </div>)}
                {error && <p role="alert">{error}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!!error}>{editing ? "Save order" : "Add order"}</button></div>
            </form>
        </div>
    </div>
}
