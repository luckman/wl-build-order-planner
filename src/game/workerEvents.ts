import { MAX_PLAN_ACTIONS, validateCommandTime, validatePlanTime } from "./plannerLimits"
import type { PlannerItem } from "./gameData"

export type WorkerEventCommand = { type: "make-idle" | "make-active"; commandTime: number; count: number; travelDuration?: number }
export type WorkerEventAction = PlannerItem & { kind: "worker-event"; workerEvent: WorkerEventCommand["type"]; commandTime: number; count: number; travelDuration: number }

export function createWorkerEvent(command: WorkerEventCommand): WorkerEventAction {
    validateCommandTime(command.commandTime)
    if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > MAX_PLAN_ACTIONS + 5)
        throw new Error(`Worker count must be a positive integer no greater than ${MAX_PLAN_ACTIONS + 5}.`)
    const travelDuration = command.type === "make-active" ? command.travelDuration ?? 0 : 0
    validatePlanTime(travelDuration, "Reactivation travel")
    return { id: command.type, name: command.type === "make-idle" ? "Make idle" : "Make active",
        kind: "worker-event", workerEvent: command.type, commandTime: command.commandTime, count: command.count, travelDuration,
        icon: "lightWorker", gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}

export function workerEventCommand(item: WorkerEventAction): WorkerEventCommand {
    return { type: item.workerEvent, commandTime: item.commandTime, count: item.count,
        ...(item.workerEvent === "make-active" ? { travelDuration: item.travelDuration } : {}) }
}
