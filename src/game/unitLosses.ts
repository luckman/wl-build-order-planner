import { validateCommandTime } from "./plannerLimits"
import { factions, isRecruitable, type FactionId, type PlannerItem } from "./gameData"

export type UnitLossCommand = { type: "lose-unit"; commandTime: number; unitId: string }
export type UnitLossAction = PlannerItem & { kind: "unit-loss"; commandTime: number; unitId: string }
export function createUnitLossAction(command: UnitLossCommand, faction: FactionId): UnitLossAction {
    if (command.type !== "lose-unit" || !Number.isFinite(command.commandTime) || command.commandTime < 0)
        throw new Error("Lose unit commandTime must be a finite non-negative number.")
    validateCommandTime(command.commandTime)
    const unit = factions[faction].items.find(item => item.id === command.unitId && isRecruitable(item))
    if (!unit) throw new Error(`Unknown unit ID ${String(command.unitId)} for ${faction}.`)
    return { id: "lose-unit", name: "Lose unit", kind: "unit-loss", unitId: unit.id,
        icon: faction === "light" ? "lightLoseUnit" : "darkLoseUnit", commandTime: command.commandTime,
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}
export function unitLossCommand(item: UnitLossAction): UnitLossCommand {
    return { type: "lose-unit", unitId: item.unitId, commandTime: item.commandTime }
}

type FoodAction = { item: PlannerItem; blocked: boolean; commandTime: number | null; foodReleased?: number }
/** Food is reserved at recruitment command time and released only by successful losses. */
export function foodUsedAt(actions: FoodAction[], initialFoodUsed: number, time: number) {
    return actions.reduce((food, action) => action.blocked || action.commandTime === null || action.commandTime > time
        ? food : food + (isRecruitable(action.item) ? action.item.food : 0) - (action.foodReleased ?? 0), initialFoodUsed)
}
