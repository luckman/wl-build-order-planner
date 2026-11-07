import type { ScheduledAction } from "./buildSimulation"
import type { PlannerItem } from "./gameData"
import type { EconomySettings, ResourceDelivery } from "./resourceSimulation"
import { isConstruction } from "./constructionSettings"
import { MAX_PLAN_ACTIONS, MAX_PLAN_SECONDS } from "./plannerLimits"
import { isTimedEvent } from "./resourcesCollected"

export type PreparationSchedule = { commands: Map<number, number>; blocked: Map<number, string> }
export type PreparationReuse = {
    minimumPrefixLength: number
    acceptedBeforeFinal: PreparationSchedule[]
}
type Result = {
    plan: ScheduledAction[]
    orderedPlan: ScheduledAction[]
    preparationFailures: Map<number, string>
    candidateEventTimes: number[]
    projectDeliveries: (horizon: number) => ResourceDelivery[]
}
type Replay = (schedule: PreparationSchedule, collectCandidatesThrough?: number) => Result

/** Replays discard obsolete reservations. The engine remains responsible for all
 * purchase readiness, worker selection, fixed events and movement rules. */
export function schedulePreparation(items: PlannerItem[], economy: EconomySettings, run: Replay) {
    const prepared = items.flatMap((item, index) => (item.construction?.preparationDuration ?? 0) > 0 ? [index] : [])
    const schedule: PreparationSchedule = { commands: new Map(), blocked: new Map() }
    let result = run(schedule)
    const baseline = result
    for (const index of prepared) schedule.commands.set(index, result.plan[index].commandTime ?? items[index].construction!.preparationDuration!)
    const seen = new Set<string>()
    for (let pass = 0; pass < MAX_PLAN_ACTIONS * 4 + 32; pass++) {
        result = run(schedule)
        const key = JSON.stringify([...schedule.commands])
        const repeated = seen.has(key)
        seen.add(key)
        let changed = false
        // Future departures must not discard an earlier command that can otherwise
        // succeed. Probe without the later reservations before moving their commands.
        const starved = result.plan.findIndex((action, index) => !isTimedEvent(items[index]) && action.blocked && !baseline.plan[index].blocked &&
            !schedule.blocked.has(index))
        if (starved >= 0) {
            const later = [...schedule.commands.keys()].filter(index => index > starved)
                .sort((a, b) => (schedule.commands.get(a)! - items[a].construction!.preparationDuration!) -
                    (schedule.commands.get(b)! - items[b].construction!.preparationDuration!) || a - b)
            const commands = new Map(schedule.commands)
            later.forEach(index => commands.delete(index))
            const probe = run({ commands, blocked: schedule.blocked })
            if (!probe.plan[starved].blocked && later.length) {
                const index = later[0], duration = items[index].construction!.preparationDuration!
                schedule.commands.set(index, Math.max(probe.plan[index].commandTime ?? MAX_PLAN_SECONDS,
                    probe.plan[starved].finishTime ?? 0) + duration)
                continue
            }
        }
        for (const index of prepared) {
            if (schedule.blocked.has(index)) continue
            const item = items[index], action = result.plan[index]
            const preparation = item.construction!.preparationDuration!
            const failure = result.preparationFailures.get(index)
            if (failure && item.construction?.useIdleWorker) {
                schedule.blocked.set(index, failure)
                schedule.commands.delete(index)
                changed = true
                break
            } else if (action.blocked || failure || repeated) {
                const commands = new Map(schedule.commands)
                // Later reservations cannot be allowed to make this probe conclude
                // that an earlier command is impossible.
                for (const later of commands.keys()) if (later >= index) commands.delete(later)
                const probe = run({ commands, blocked: schedule.blocked }).plan[index]
                const next = probe.commandTime === null ? Infinity : Math.max(probe.commandTime + preparation, (schedule.commands.get(index) ?? 0) + (repeated ? preparation : 0))
                if (probe.blocked || next > MAX_PLAN_SECONDS) {
                    schedule.blocked.set(index, action.blockedReason ?? failure ?? "Preparation cannot fit within the plan limit.")
                    schedule.commands.delete(index)
                } else schedule.commands.set(index, next)
                changed = true
                break
            } else if (action.commandTime !== schedule.commands.get(index)) {
                schedule.commands.set(index, action.commandTime!)
                changed = true
                break
            }
        }
        if (!changed) return { ...refinePreparation(items, economy, schedule, result, run), preparation: schedule }
    }
    throw new Error("Construction preparation scheduling did not converge.")
}

/** A later departure can restore an earlier delivery. Refine against observable
 * event boundaries so a conservative replay does not impose an unnecessary wait. */
function refinePreparation(items: PlannerItem[], economy: EconomySettings, schedule: PreparationSchedule, result: Result, run: Replay) {
    // A default tail cannot change earlier catalog commands. Remember how much
    // of the prefix the search needed to generate candidates and reject trials.
    const reuse: PreparationReuse = { minimumPrefixLength: 0, acceptedBeforeFinal: [] }
    const lastFixedCommand = Math.max(0, ...result.plan.filter(action => isTimedEvent(action.item))
        .map(action => action.commandTime!))
    const requireCatalogThrough = (trial: Result, time: number) => {
        const index = trial.plan.findIndex(action => !isTimedEvent(action.item) &&
            action.commandTime !== null && action.commandTime >= time)
        reuse.minimumPrefixLength = Math.max(reuse.minimumPrefixLength, index < 0 ? Infinity : index + 1)
    }
    const recordAccepted = (trial: Result) => {
        if (trial.plan.some(action => action.blocked)) reuse.minimumPrefixLength = Infinity
        if (lastFixedCommand > 0) requireCatalogThrough(trial, lastFixedCommand)
    }
    recordAccepted(result)
    for (const [index, command] of schedule.commands) {
        const preparation = items[index].construction!.preparationDuration!
        const commands = new Map(schedule.commands)
        commands.delete(index)
        const probe = run({ commands, blocked: schedule.blocked }, command)
        requireCatalogThrough(probe, command)
        const times = [0, ...probe.candidateEventTimes, ...probe.plan.flatMap(action =>
            [action.commandTime, action.startTime, action.finishTime, action.workerReturnTime].filter((time): time is number => time !== null))]
        const candidates = Array.from(new Set([command, probe.plan[index].commandTime ?? command, preparation,
            ...times.flatMap(time => [time + preparation, time + economy.orderDelay])]))
            .filter(time => time >= preparation && time <= command).sort((a, b) => a - b)
        let earliestCommandTime = -Infinity
        if (isConstruction(items[index])) {
            // Accepted trials keep earlier active reservations at their fixed command times.
            for (const [earlierIndex, fixedCommand] of commands) {
                if (earlierIndex < index && !schedule.blocked.has(earlierIndex) && isConstruction(items[earlierIndex])) {
                    earliestCommandTime = Math.max(earliestCommandTime, fixedCommand + economy.orderDelay)
                }
            }
        }
        const wasSuccessful = result.plan.map(action => !action.blocked)
        const evaluate = (time: number) => {
            const candidate = new Map(schedule.commands)
            candidate.set(index, time)
            const trial = run({ commands: candidate, blocked: schedule.blocked })
            const blocked = trial.plan.findIndex((action, i) => wasSuccessful[i] && action.blocked)
            const invalidPreparation = [...candidate].find(([i, expected]) =>
                trial.preparationFailures.has(i) || trial.plan[i].commandTime !== expected)
            if (invalidPreparation) {
                reuse.minimumPrefixLength = Math.max(reuse.minimumPrefixLength, invalidPreparation[0] + 1)
            } else if (blocked >= 0) {
                const catalogBlock = trial.plan.findIndex((action, i) => wasSuccessful[i] && action.blocked && !isTimedEvent(action.item))
                if (catalogBlock >= 0) reuse.minimumPrefixLength = Math.max(reuse.minimumPrefixLength, catalogBlock + 1)
                else requireCatalogThrough(trial, lastFixedCommand)
            } else {
                return trial
            }
            return null
        }
        for (const time of candidates) {
            if (time < earliestCommandTime) continue
            const refined = evaluate(time)
            if (refined) {
                if (time !== command) {
                    reuse.acceptedBeforeFinal.push({ commands: new Map(schedule.commands), blocked: new Map(schedule.blocked) })
                    recordAccepted(refined)
                }
                schedule.commands.set(index, time)
                result = refined
                break
            }
        }
    }
    return { ...result, reuse }
}
