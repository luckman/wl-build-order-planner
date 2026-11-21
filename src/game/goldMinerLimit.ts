import { formatDuration } from "../durationTime"
import type { PlannerItem } from "./gameData"
import { validateCommandTime } from "./plannerLimits"

export const GOLD_MINER_LIMIT_NAME = "Limit gold miners"
export const MAX_EXPLICIT_GOLD_MINERS = 5
export const OPENING_GOLD_LIMIT_WARNING = "This limit is below the opening allocation. Consider reducing the number of starting gold miners."

export type GoldMinerLimitCommand = {
    type: "limit-gold-miners"
    commandTime: number
    limit: number
    reassign?: boolean
}
export type GoldMinerLimitAction = Extract<PlannerItem, { kind: "limit-gold-miners" }>

export function createGoldMinerLimit({ commandTime, limit, reassign = true }: GoldMinerLimitCommand): GoldMinerLimitAction {
    validateCommandTime(commandTime)
    if (!Number.isInteger(limit) || limit < 0 || limit > MAX_EXPLICIT_GOLD_MINERS)
        throw new Error(`Gold miner limit must be a whole number from 0 to ${MAX_EXPLICIT_GOLD_MINERS}.`)
    if (typeof reassign !== "boolean") throw new Error("Gold miner reassignment must be true or false.")
    return { id: "limit-gold-miners", kind: "limit-gold-miners", name: GOLD_MINER_LIMIT_NAME, icon: "limitGoldMiners",
        commandTime: goldMinerLimitTimeKey(commandTime), goldLimit: limit, reassign, gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}

export function goldMinerLimitCommand(item: GoldMinerLimitAction): GoldMinerLimitCommand {
    return { type: "limit-gold-miners", commandTime: item.commandTime, limit: item.goldLimit, reassign: item.reassign }
}

export function goldMinerLimitTimeConflict(commandTime: number) {
    return `Limit gold miners already has an event at ${formatDuration(commandTime)}.`
}

export function timestampRoundoff(time: number) {
    return 4 * Number.EPSILON * Math.max(1, Math.abs(time))
}

// Shared command input is precise to milliseconds. Remove arithmetic roundoff
// around those values while preserving finer timestamps from imported plans.
export function goldMinerLimitTimeKey(time: number) {
    const milliseconds = Math.round(time * 1000) / 1000
    return Math.abs(milliseconds - time) <= timestampRoundoff(time) ? milliseconds : time
}

export function alignTimeWithGoldMinerLimit(time: number, limitTimes: ReadonlyMap<number, number>) {
    return limitTimes.size ? limitTimes.get(goldMinerLimitTimeKey(time)) ?? time : time
}

export function goldMinerLimitCollision(items: PlannerItem[]): string | null {
    const times = new Set<number>()
    for (const item of items) {
        if (item.kind !== "limit-gold-miners") continue
        const time = goldMinerLimitTimeKey(item.commandTime)
        if (times.has(time)) return goldMinerLimitTimeConflict(time)
        times.add(time)
    }
    return null
}

export function profileGoldMinerLimit({ goldTravelTime, goldGatherTime }: { goldTravelTime: number; goldGatherTime: number }) {
    return Math.max(1, Math.ceil((2 * goldTravelTime + goldGatherTime) / Math.max(0.001, goldGatherTime)))
}

export function goldMinerLimitBefore(events: GoldMinerLimitAction[], profileLimit: number, time: number) {
    const commandTime = goldMinerLimitTimeKey(time)
    let previous = profileLimit
    let previousTime = -Infinity
    for (const event of events) {
        if (event.commandTime >= commandTime || event.commandTime < previousTime) continue
        previous = event.goldLimit
        previousTime = event.commandTime
    }
    return previous
}
