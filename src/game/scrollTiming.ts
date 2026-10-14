import { manaWellCountAt } from "./manaWells"
import type { ScheduledAction } from "./buildSimulation"
import { manaAt, type EconomySettings } from "./resourceSimulation"
import { SCROLLS, type ScrollId, scrollCooldown } from "./scrolls"

/** Resolve once when adding a command; later simulation never changes its timestamp. */
export function earliestScrollTime(settings: EconomySettings, plan: ScheduledAction[], minimumTime: number, scrollId: ScrollId = "gold-rush"): number | null {
    const scroll = SCROLLS[scrollId]
    const scrollTimes = plan.filter(action => action.item.kind === "scroll" && action.commandTime !== null)
        .map(action => action.commandTime!)
    if (scrollTimes.length) minimumTime = Math.max(minimumTime,
        Math.max(...scrollTimes) + scrollCooldown(settings) + settings.orderDelay)
    const manaCheckTime = Math.max(0, minimumTime - settings.orderDelay)
    const capacityTimes = plan.filter(action => !action.blocked && action.item.id === "tower-of-mana" &&
        action.item.kind === "building" && action.finishTime !== null && action.finishTime > manaCheckTime)
        .map(action => action.finishTime!).sort((a, b) => a - b)
    const wellTimes = plan.filter(action => !action.blocked && action.item.kind === "mana-well" &&
        action.commandTime !== null && action.commandTime > manaCheckTime).map(action => action.commandTime!)
    const changeTimes = Array.from(new Set([manaCheckTime, ...capacityTimes, ...wellTimes])).sort((a, b) => a - b)
    for (const [index, time] of changeTimes.entries()) {
        const state = manaAt(settings, plan, time)
        if (state.mana + 1e-9 >= scroll.manaCost) return Math.max(minimumTime, time + settings.orderDelay)
        const income = settings.manaPerMinute + manaWellCountAt(plan, time) * (settings.manaFromManaWells ?? 0)
        if (state.limit >= scroll.manaCost && income > 0) {
            // Round upwards to milliseconds so numeric rounding cannot produce insufficient mana.
            const candidate = Math.ceil((time + (scroll.manaCost - state.mana) * 60 / income + settings.orderDelay) * 1000 - 1e-7) / 1000
            if (Number.isFinite(candidate) && candidate - settings.orderDelay <= (changeTimes[index + 1] ?? Infinity)) return candidate
        }
    }
    return null
}
