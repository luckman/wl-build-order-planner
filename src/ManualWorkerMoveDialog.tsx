import { useState } from "react"
import EventTimeDialog from "./EventTimeDialog"
import { createManualWorkerMove, manualWorkerMoveIdentities, type ManualWorkerMoveAction, type ManualWorkerMoveCommand,
    type ManualWorkerMoveType } from "./game/manualWorkerMoves"

export default function ManualWorkerMoveDialog({ type, action, defaultTime, onClose, onSave, validationError }: {
    type: ManualWorkerMoveType; action?: ManualWorkerMoveAction; defaultTime: number; validationError?: string | null
    onClose: () => void; onSave: (command: ManualWorkerMoveCommand) => void
}) {
    const [count, setCount] = useState(String(action?.count ?? 1))
    const { name } = manualWorkerMoveIdentities[type]
    const command = (commandTime: number): ManualWorkerMoveCommand => ({ type, commandTime, count: Number(count) })
    return <EventTimeDialog name={name} title={action ? `Edit ${name}` : name} commandTime={action?.commandTime ?? defaultTime}
        submitLabel={action ? "Save event" : "Add event"} onClose={onClose} onSave={time => onSave(command(time))}
        hint={type === "move-gold-miner-to-wood"
            ? "Miners deliver their gold before moving to wood. The gold miner limit stays unchanged."
            : "Workers travelling to the forest switch immediately. Others finish and deliver their wood first."}
        validateTime={time => {
            try { createManualWorkerMove(command(time)); return validationError ?? null } catch (error) { return (error as Error).message }
        }}>
        <label>Worker count<input type="number" min="1" step="1" value={count} onChange={event => setCount(event.target.value)} /></label>
    </EventTimeDialog>
}
