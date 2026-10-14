import { validateCommandTime } from "./plannerLimits"
import type { PlannerItem } from "./gameData"

export type AddResourcesCommand = { type: "add-resources"; commandTime: number; gold: number; wood: number }
export type ResourceAction = PlannerItem & { kind: "resource"; commandTime: number; resourceGold: number; resourceWood: number }

export function createResourceAction(command: AddResourcesCommand): ResourceAction {
    for (const field of ["commandTime", "gold", "wood"] as const) {
        if (typeof command[field] !== "number" || !Number.isFinite(command[field]) || command[field] < 0)
            throw new Error(`Add resources ${field} must be a finite non-negative number.`)
    }
    validateCommandTime(command.commandTime)
    return { id: "add-resources", name: "Add resources", kind: "resource", icon: "addResources",
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [],
        commandTime: command.commandTime, resourceGold: command.gold, resourceWood: command.wood }
}
export function resourceCommand(item: ResourceAction): AddResourcesCommand {
    return { type: "add-resources", commandTime: item.commandTime, gold: item.resourceGold, wood: item.resourceWood }
}
export function isTimedEvent(item: PlannerItem) {
    return item.kind === "scroll" || item.kind === "resource" || item.kind === "mana-well" || item.kind === "unit-loss"
}
