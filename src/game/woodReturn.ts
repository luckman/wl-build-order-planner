import type { PlannerItem } from "./gameData"
import { goldMinerLimitTimeKey } from "./goldMinerLimit"
import { validateCommandTime } from "./plannerLimits"

export const WOOD_RETURN_NAME = "Bring wood back to base"
export const WOOD_RETURN_ICON = "resourcesCollected"

export type WoodReturnMode = { mode: "immediate"; target?: never } | { mode: "target"; target: number }
export type WoodReturnCommand = { type: "bring-wood-back-to-base"; commandTime: number } & WoodReturnMode
export type WoodReturnAction = Extract<PlannerItem, { kind: "wood-return" }>
export type WoodReturnResult = {
    workerId: number | null
    departedAt: number | null
    endTime: number | null
    delivered: number
    reason?: string
}

export function maxWoodReturnTarget(capacity: number) {
    return Math.floor(capacity - 1)
}

export function woodReturnTargetError(target: number, capacity: number) {
    const max = maxWoodReturnTarget(capacity)
    if (max < 1) return "This profile has no valid partial wood target."
    if (!Number.isSafeInteger(target) || target < 1 || target > max) {
        return `Wood target must be a whole number from 1 to ${max} for this profile.`
    }
    return null
}

export function createWoodReturn({ type, commandTime, mode, target }: WoodReturnCommand): WoodReturnAction {
    validateCommandTime(commandTime)
    if (mode === "target") {
        if (!Number.isSafeInteger(target) || target < 1) throw new Error("Wood target must be a positive whole number.")
    } else if (mode !== "immediate" || target !== undefined) {
        throw new Error("Invalid wood return mode.")
    }
    return {
        id: type, kind: "wood-return", name: WOOD_RETURN_NAME, icon: WOOD_RETURN_ICON,
        commandTime: goldMinerLimitTimeKey(commandTime),
        ...(mode === "target" ? { mode, target } : { mode }),
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [],
    }
}

export function woodReturnCommand(item: WoodReturnAction): WoodReturnCommand {
    return { type: "bring-wood-back-to-base", commandTime: item.commandTime,
        ...(item.mode === "target" ? { mode: item.mode, target: item.target } : { mode: item.mode }) }
}
