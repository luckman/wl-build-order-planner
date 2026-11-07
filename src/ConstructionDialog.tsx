import { useEffect, useRef, useState } from "react"
import type { PlannerItem } from "./game/gameData"
import { parseConstructionSettings, type ConstructionSettings } from "./game/constructionSettings"

export default function ConstructionDialog({ item, globalDelay, editing, onSave, onClose, validationError }: {
    item: PlannerItem; globalDelay: number; editing: boolean; validationError?: string | null
    onSave: (settings: ConstructionSettings) => void; onClose: () => void
}) {
    const dialog = useRef<HTMLDivElement>(null)
    const [outward, setOutward] = useState<string | undefined>(item.construction?.outwardDuration?.toString())
    const [back, setBack] = useState<string | undefined>(item.construction?.returnDuration?.toString())
    const [preparation, setPreparation] = useState(String(item.construction?.preparationDuration ?? 0))
    const [useIdleWorker, setUseIdleWorker] = useState(item.construction?.useIdleWorker ?? false)
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
    return <div className="scroll-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
        <div ref={dialog} className="scroll-dialog panel" role="dialog" aria-modal="true" aria-labelledby="construction-dialog-title"
            onKeyDown={event => {
                if (event.key === "Escape") { event.stopPropagation(); onClose() }
                if (event.key === "Tab") {
                    const controls = Array.from(dialog.current!.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled)"))
                    const first = controls[0], last = controls[controls.length - 1]
                    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
                    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
                }
            }}>
            <h2 id="construction-dialog-title">{editing ? "Edit" : "Configure"} {item.name}</h2>
            <form onSubmit={event => { event.preventDefault(); if (!error) onSave(settings) }}>
                <label>Preparation (seconds)<input type="number" min="0" step="any" value={preparation} onChange={event => setPreparation(event.target.value)} /></label>
                <p>Preparation reserves the worker this many seconds before the scheduled command.</p>
                <label><input type="checkbox" checked={useIdleWorker} onChange={event => setUseIdleWorker(event.target.checked)} />Use idle worker</label>
                {([{ label: "Outward travel (seconds)", value: outward, set: setOutward, disabled: false },
                    { label: "Return travel (seconds)", value: back, set: setBack, disabled: useIdleWorker }]).map(field => <div key={field.label}>
                    <label>{field.label}<input type="number" min="0" step="any" disabled={field.disabled} value={field.value ?? globalDelay}
                        onChange={event => field.set(event.target.value)} /></label>
                    <span>{field.value === undefined ? `Global: ${globalDelay}s` : "Override"}</span>
                    <button type="button" disabled={field.value === undefined || (field.disabled)} onClick={() => field.set(undefined)} aria-label={`Use global ${field.label.toLowerCase()}`}>Use global</button>
                </div>)}
                {useIdleWorker && <p>Idle builders become idle at completion and have no return travel. Your return override is retained.</p>}
                {error && <p role="alert">{error}</p>}
                <div className="scroll-dialog-buttons"><button type="button" onClick={onClose}>Cancel</button><button type="submit" disabled={!!error}>{editing ? "Save order" : "Add order"}</button></div>
            </form>
        </div>
    </div>
}
