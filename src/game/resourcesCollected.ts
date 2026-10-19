import { validateCommandTime } from "./plannerLimits"
import type { PlannerItem } from "./gameData"

export type ResourcesCollectedCommand = { type: "resources-collected"; commandTime: number; gold: number; wood: number }
export type ResourcesCollectedAction = PlannerItem & { kind: "resources-collected"; commandTime: number; collectedGold: number; collectedWood: number }

export function createResourcesCollectedAction(command: ResourcesCollectedCommand): ResourcesCollectedAction {
    for (const field of ["commandTime", "gold", "wood"] as const) {
        if (typeof command[field] !== "number" || !Number.isFinite(command[field]))
            throw new Error(`Resources collected ${field} must be a finite number.`)
    }
    validateCommandTime(command.commandTime)
    return { id: "resources-collected", name: "Resources collected", kind: "resources-collected", icon: "resourcesCollected",
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [],
        commandTime: command.commandTime, collectedGold: command.gold, collectedWood: command.wood }
}
export function resourcesCollectedCommand(item: ResourcesCollectedAction): ResourcesCollectedCommand {
    return { type: "resources-collected", commandTime: item.commandTime, gold: item.collectedGold, wood: item.collectedWood }
}
export function isTimedEvent(item: PlannerItem) {
    return item.kind === "scroll" || item.kind === "resources-collected" || item.kind === "mana-well" || item.kind === "unit-is-killed"
}
