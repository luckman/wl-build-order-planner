import { useState } from "react"
import EventTimeDialog from "./EventTimeDialog"
import { maxWoodReturnTarget, woodReturnTargetError, WOOD_RETURN_NAME, type WoodReturnAction, type WoodReturnCommand,
    type WoodReturnMode } from "./game/woodReturn"

export default function WoodReturnDialog({ action, defaultTime, woodCapacity, onClose, onSave, validationError }: {
    action?: WoodReturnAction; defaultTime: number; woodCapacity: number; validationError?: string | null
    onClose: () => void; onSave: (command: WoodReturnCommand) => void
}) {
    const [mode, setMode] = useState<WoodReturnMode["mode"]>(action?.mode ?? "immediate")
    const [target, setTarget] = useState(String(action?.target ?? 1))
    const maxTarget = maxWoodReturnTarget(woodCapacity)
    return <EventTimeDialog name={WOOD_RETURN_NAME} title={action ? `Edit ${WOOD_RETURN_NAME}` : WOOD_RETURN_NAME}
        commandTime={action?.commandTime ?? defaultTime} submitLabel={action ? "Save event" : "Add event"}
        onClose={onClose} hint="At command time, the available woodcutter carrying the most wood is selected."
        validateTime={() => validationError ?? (mode === "target" ? woodReturnTargetError(Number(target), woodCapacity) : null)}
        onSave={commandTime => onSave({ type: "bring-wood-back-to-base", commandTime,
            ...(mode === "target" ? { mode, target: Number(target) } : { mode }) })}>
        <div role="radiogroup" aria-label="Return mode" className="wood-return-options">
            <label className="scroll-automatic">
                <input type="radio" name="wood-return-mode" checked={mode === "immediate"} onChange={() => setMode("immediate")} />
                Return immediately
            </label>
            <div className="wood-return-target-row">
                <label className="scroll-automatic">
                    <input type="radio" name="wood-return-mode" checked={mode === "target"} onChange={() => setMode("target")} />
                    Wait for target
                </label>
                <div className="wood-return-target">
                    <input aria-label="Wood target" type="number" min="1" max={maxTarget} step="1" value={target}
                        disabled={mode !== "target"} onChange={event => setTarget(event.target.value)} />
                    <small>{maxTarget > 0 ? `1–${maxTarget} wood` : "No valid target"}</small>
                </div>
            </div>
        </div>
    </EventTimeDialog>
}
