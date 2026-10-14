import { validateCommandTime } from "./plannerLimits"
import { factions, isRecruitable, type FactionId, type PlannerItem } from "./gameData"

export type UnitKilledCommand = { type: "unit-is-killed"; commandTime: number; unitId: string }
export type UnitKilledAction = PlannerItem & { kind: "unit-is-killed"; commandTime: number; unitId: string }
export function createUnitKilledAction(command: UnitKilledCommand, faction: FactionId): UnitKilledAction {
    if (command.type !== "unit-is-killed" || !Number.isFinite(command.commandTime) || command.commandTime < 0)
        throw new Error("Unit is killed commandTime must be a finite non-negative number.")
    validateCommandTime(command.commandTime)
    const unit = factions[faction].items.find(item => item.id === command.unitId && isRecruitable(item))
    if (!unit) throw new Error(`Unknown unit ID ${String(command.unitId)} for ${faction}.`)
    return { id: "unit-is-killed", name: "Unit is killed", kind: "unit-is-killed", unitId: unit.id,
        icon: faction === "light" ? "lightUnitIsKilled" : "darkUnitIsKilled", commandTime: command.commandTime,
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}
export function unitKilledCommand(item: UnitKilledAction): UnitKilledCommand {
    return { type: "unit-is-killed", unitId: item.unitId, commandTime: item.commandTime }
}

type FoodAction = { item: PlannerItem; blocked: boolean; commandTime: number | null; foodReleased?: number }
/** Food is reserved at recruitment command time and released only by successful kills. */
export function foodUsedAt(actions: FoodAction[], initialFoodUsed: number, time: number) {
    return actions.reduce((food, action) => action.blocked || action.commandTime === null || action.commandTime > time
        ? food : food + (isRecruitable(action.item) ? action.item.food : 0) - (action.foodReleased ?? 0), initialFoodUsed)
}
