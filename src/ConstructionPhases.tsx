import type { ScheduledAction } from "./game/buildSimulation"
import { isConstruction } from "./game/constructionSettings"
import { formatDuration } from "./durationTime"

export function timelineBounds(action: ScheduledAction) {
    return isConstruction(action.item)
        ? { start: action.departureTime ?? action.commandTime!, end: action.workerReturnEndTime ?? action.workerReturnTime ?? action.finishTime! }
        : { start: action.commandTime!, end: action.finishTime! }
}

/** All phases belong to one editable occurrence; zero-length journeys have no segment. */
export default function ConstructionPhases({ action, icon }: { action: ScheduledAction; icon: string }) {
    const bounds = timelineBounds(action)
    const duration = bounds.end - bounds.start
    const phases = [
        { kind: "preparation", name: "Preparation", text: "Prep", start: bounds.start, end: action.commandTime! },
        { kind: "outward", name: "Outward travel", text: "Out", start: action.commandTime!, end: action.startTime! },
        { kind: "construction", name: "Construction", text: "", start: action.startTime!, end: action.finishTime! },
        { kind: "return", name: "Return travel", text: "Return", start: action.finishTime!, end: bounds.end },
    ].filter(phase => phase.end > phase.start)
    const position = (start: number, end: number) => ({ left: `${(start - bounds.start) / duration * 100}%`, width: `${(end - start) / duration * 100}%` })
    return <>
        {phases.map(phase => <span key={phase.kind} className={`construction-phase phase-${phase.kind}`}
            aria-label={`${phase.name} ${formatDuration(phase.start).replace(/^0(?=\d:)/, "")} to ${formatDuration(phase.end).replace(/^0(?=\d:)/, "")}`}
            style={position(phase.start, phase.end)}>{phase.text}</span>)}
        <span className="construction-caption" style={position(action.startTime!, action.finishTime!)}>
            <img src={icon} alt="" /><span>{action.item.name}</span>
        </span>
    </>
}
