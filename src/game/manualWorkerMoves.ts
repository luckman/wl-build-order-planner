import type { PlannerItem } from "./gameData"
import { goldMinerLimitTimeKey } from "./goldMinerLimit"
import { validateCommandTime } from "./plannerLimits"

export const manualWorkerMoveIdentities = {
    "move-gold-miner-to-wood": { name: "Move gold miner to wood", icon: "moveGoldMinerToWood", source: "gold", destination: "wood" },
    "move-wood-gatherer-to-gold": { name: "Move wood gatherer to gold", icon: "moveWoodGathererToGold", source: "wood", destination: "gold" },
} as const

export type ManualWorkerMoveType = keyof typeof manualWorkerMoveIdentities
export type ManualWorkerMoveSource = typeof manualWorkerMoveIdentities[ManualWorkerMoveType]["source"]
export type ManualWorkerMoveCommand = { type: ManualWorkerMoveType; commandTime: number; count: number }
export type ManualWorkerMoveAction = Extract<PlannerItem, { kind: "manual-worker-move" }>
export type ManualWorkerMoveResult = { completed: number; endTime: number | null; reason?: string }

export function createManualWorkerMove({ type, commandTime, count }: ManualWorkerMoveCommand): ManualWorkerMoveAction {
    validateCommandTime(commandTime)
    if (!Number.isSafeInteger(count) || count < 1) throw new Error("Worker count must be a positive whole number.")
    const { name, icon } = manualWorkerMoveIdentities[type]
    return { id: type, name, icon, kind: "manual-worker-move", move: type, commandTime: goldMinerLimitTimeKey(commandTime), count,
        gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}

export function manualWorkerMoveCommand(item: ManualWorkerMoveAction): ManualWorkerMoveCommand {
    return { type: item.move, commandTime: item.commandTime, count: item.count }
}

export function recordManualWorkerMoveBoundary(
    action: ManualWorkerMoveAction, commandTime: number, alignmentTimes: Map<number, number>,
    sourcesByTime: Map<number, Set<ManualWorkerMoveSource>>,
) {
    alignmentTimes.set(goldMinerLimitTimeKey(commandTime), commandTime)
    const sources = sourcesByTime.get(commandTime) ?? new Set<ManualWorkerMoveSource>()
    sources.add(manualWorkerMoveIdentities[action.move].source)
    sourcesByTime.set(commandTime, sources)
}
