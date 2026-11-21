import type { PlannerItem } from "./gameData"
import { goldMinerLimitTimeKey } from "./goldMinerLimit"
import { validateCommandTime } from "./plannerLimits"

export const WOOD_RETURN_NAME = "Bring wood back to base"
export const WOOD_RETURN_ICON = "resourcesCollected"

export type WoodReturnCommand = { type: "bring-wood-back-to-base"; commandTime: number; mode: "immediate" }
export type WoodReturnAction = Extract<PlannerItem, { kind: "wood-return" }>
export type WoodReturnResult = {
    workerId: number | null
    departedAt: number | null
    endTime: number | null
    delivered: number
    reason?: string
}

export function createWoodReturn({ type, commandTime, mode }: WoodReturnCommand): WoodReturnAction {
    validateCommandTime(commandTime)
    if (mode !== "immediate") throw new Error("Invalid wood return mode.")
    return {
        id: type, kind: "wood-return", name: WOOD_RETURN_NAME, icon: WOOD_RETURN_ICON,
        commandTime: goldMinerLimitTimeKey(commandTime), mode,
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [],
    }
}

export function woodReturnCommand(item: WoodReturnAction): WoodReturnCommand {
    return { type: "bring-wood-back-to-base", commandTime: item.commandTime, mode: item.mode }
}
