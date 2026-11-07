import type { CSSProperties } from "react"
import type { ScheduledAction } from "./game/buildSimulation"
import { isConstruction } from "./game/constructionSettings"
import { formatDuration } from "./durationTime"

export function timelineBounds(action: ScheduledAction) {
    return isConstruction(action.item)
        ? { start: action.departureTime ?? action.commandTime!, end: action.workerReturnEndTime ?? action.workerReturnTime ?? action.finishTime! }
        : { start: action.commandTime!, end: action.finishTime! }
}

/** All phases belong to one editable occurrence; zero-length journeys have no segment. */
export default function ConstructionPhases({ action, icon, descriptionId, timing }: {
    action: ScheduledAction; icon: string; descriptionId: string; timing?: string
}) {
    const bounds = timelineBounds(action)
    const duration = bounds.end - bounds.start
    const phases = [
        { kind: "preparation", name: "Preparation", start: bounds.start, end: action.commandTime! },
        { kind: "outward", name: "Outward travel", start: action.commandTime!, end: action.startTime! },
        { kind: "construction", name: action.item.kind === "upgrade" ? "Upgrade" : "Construction", start: action.startTime!, end: action.finishTime! },
        { kind: "return", name: "Return travel", start: action.finishTime!, end: bounds.end },
    ].filter(phase => phase.end > phase.start).map(phase => ({
        ...phase,
        description: `${phase.name} ${formatDuration(phase.start).replace(/^0(?=\d:)/, "")} to ${formatDuration(phase.end).replace(/^0(?=\d:)/, "")}`,
    }))
    const position = (start: number, end: number) => ({ left: `${(start - bounds.start) / duration * 100}%`, width: `${(end - start) / duration * 100}%` })
    const caption = position(action.startTime!, action.finishTime!)
    return <>
        <span id={descriptionId} role="img" aria-label={[timing, ...phases.map(phase => phase.description)].filter(Boolean).join(". ")}>
            {phases.map(phase => <span key={phase.kind} className={`construction-phase phase-${phase.kind}`}
                aria-label={phase.description} style={position(phase.start, phase.end)} />)}
        </span>
        <span className="construction-caption" style={{ "--caption-left": caption.left, "--caption-width": caption.width } as CSSProperties}>
            <img src={icon} alt="" /><span>{action.item.name}</span>
        </span>
    </>
}
