import { useState } from "react"
import EventTimeDialog from "./EventTimeDialog"
import { createWorkerEvent, type WorkerEventAction, type WorkerEventCommand } from "./game/workerEvents"

export default function WorkerEventDialog({ type, action, defaultTime, onClose, onSave, validationError }: {
    type: WorkerEventCommand["type"]; action?: WorkerEventAction; defaultTime: number; validationError?: string | null
    onClose: () => void; onSave: (command: WorkerEventCommand) => void
}) {
    const [count, setCount] = useState(String(action?.count ?? 1))
    const [travel, setTravel] = useState(String(action?.travelDuration ?? 0))
    const name = type === "make-idle" ? "Make idle" : "Make active"
    const command = (time: number): WorkerEventCommand => ({ type, commandTime: time, count: Number(count), travelDuration: Number(travel) })
    return <EventTimeDialog name={name} title={action ? `Edit ${name}` : name} commandTime={action?.commandTime ?? defaultTime}
        submitLabel={action ? "Save event" : "Add event"} onClose={onClose} onSave={time => onSave(command(time))}
        validateTime={time => {
            if (!count.trim() || !travel.trim()) return "Enter a count and travel duration."
            try { createWorkerEvent(command(time)); return validationError ?? null } catch (error) { return (error as Error).message }
        }}>
        <label>Worker count<input type="number" min="1" step="1" value={count} onChange={event => setCount(event.target.value)} /></label>
        {type === "make-active" && <label>Reactivation travel (seconds)<input type="number" min="0" step="any" value={travel} onChange={event => setTravel(event.target.value)} /></label>}
    </EventTimeDialog>
}
