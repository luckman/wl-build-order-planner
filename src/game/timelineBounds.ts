import type { ScheduledAction } from "./buildSimulation"
import { isConstruction } from "./constructionSettings"
import { MAX_PLAN_SECONDS } from "./plannerLimits"

export const TIMELINE_WINDOW_SECONDS = 120

export function timelineBounds(action: ScheduledAction) {
    return isConstruction(action.item)
        ? { start: action.departureTime ?? action.commandTime!, end: action.workerReturnEndTime ?? action.workerReturnTime ?? action.finishTime! }
        : { start: action.commandTime!, end: action.finishTime! }
}

export function timelineEnd(plan: ScheduledAction[]) {
    const lastVisibleTime = Math.max(0, ...plan.map(action => action.blocked ? action.commandTime ?? 0 : timelineBounds(action).end))
    return Math.min(MAX_PLAN_SECONDS, Math.max(TIMELINE_WINDOW_SECONDS, lastVisibleTime + 30))
}
