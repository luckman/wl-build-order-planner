import { MAX_PLAN_ACTIONS, validateCommandTime, validatePlanTime } from "./plannerLimits"
import type { FactionId, PlannerItem } from "./gameData"

export type WorkerEventCommand = { type: "make-idle" | "make-active"; commandTime: number; count: number; travelDuration?: number }
export type WorkerEventAction = PlannerItem & { kind: "worker-event"; workerEvent: WorkerEventCommand["type"]; commandTime: number; count: number; travelDuration: number }

export function workerEventIdentity(type: WorkerEventCommand["type"], faction: FactionId) {
    const [worker, workerIcon] = faction === "light" ? ["Worker", "lightWorker"] as const : ["Slave", "darkSlave"] as const
    const state = type === "make-idle" ? "idle" : "active"
    return { name: `Make ${worker} ${state}`, icon: `${workerIcon}${state === "idle" ? "Idle" : "Active"}` as const }
}

export function parseWorkerEvent(command: WorkerEventCommand) {
    validateCommandTime(command.commandTime)
    if (!Number.isSafeInteger(command.count) || command.count < 1 || command.count > MAX_PLAN_ACTIONS + 5)
        throw new Error(`Worker count must be a positive integer no greater than ${MAX_PLAN_ACTIONS + 5}.`)
    const travelDuration = command.type === "make-active" ? command.travelDuration ?? 0 : 0
    validatePlanTime(travelDuration, "Reactivation travel")
    return { ...command, travelDuration }
}

export function createWorkerEvent(command: WorkerEventCommand, faction: FactionId): WorkerEventAction {
    const { type, commandTime, count, travelDuration } = parseWorkerEvent(command)
    return { id: type, ...workerEventIdentity(type, faction),
        kind: "worker-event", workerEvent: type, commandTime, count, travelDuration,
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}

export function workerEventCommand(item: WorkerEventAction): WorkerEventCommand {
    return { type: item.workerEvent, commandTime: item.commandTime, count: item.count,
        ...(item.workerEvent === "make-active" ? { travelDuration: item.travelDuration } : {}) }
}
