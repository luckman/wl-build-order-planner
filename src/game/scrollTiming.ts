import type { ScheduledAction } from "./buildSimulation"
import { manaAt, type EconomySettings } from "./resourceSimulation"
import { GOLD_RUSH } from "./scrolls"

/** Resolve once when adding a command; later simulation never changes its timestamp. */
export function earliestScrollTime(settings: EconomySettings, plan: ScheduledAction[], minimumTime: number): number | null {
    const scrollTimes = plan.filter(action => action.item.kind === "scroll" && action.commandTime !== null)
        .map(action => action.commandTime!)
    if (scrollTimes.length) minimumTime = Math.max(minimumTime,
        Math.max(...scrollTimes) + (settings.timeBetweenScrolls ?? 10) + settings.orderDelay)
    const manaCheckTime = Math.max(0, minimumTime - settings.orderDelay)
    const capacityTimes = plan.filter(action => !action.blocked && action.item.id === "tower-of-mana" &&
        action.item.kind === "building" && action.finishTime !== null && action.finishTime > manaCheckTime)
        .map(action => action.finishTime!).sort((a, b) => a - b)
    for (const time of [manaCheckTime, ...capacityTimes]) {
        const state = manaAt(settings, plan, time)
        if (state.mana + 1e-9 >= GOLD_RUSH.manaCost) return Math.max(minimumTime, time + settings.orderDelay)
        if (state.limit >= GOLD_RUSH.manaCost && settings.manaPerMinute > 0) {
            // Round upwards to milliseconds so numeric rounding cannot produce insufficient mana.
            const candidate = Math.ceil((time + (GOLD_RUSH.manaCost - state.mana) * 60 / settings.manaPerMinute + settings.orderDelay) * 1000 - 1e-7) / 1000
            if (Number.isFinite(candidate)) return candidate
        }
    }
    return null
}
