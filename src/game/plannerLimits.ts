import { MAX_SAWMILL_WOOD_TRAVEL_TIME } from "./gatheringRules"

/** Shared supported-plan policy. The opening allocation is not a subsequent action. */
export const MAX_PLAN_SECONDS = 30 * 60
export const MAX_COMMAND_SECONDS = MAX_PLAN_SECONDS - 1
export const MAX_PLAN_ACTIONS = 100
export const ACTION_LIMIT_MESSAGE = `Build orders support at most ${MAX_PLAN_ACTIONS} actions after the opening allocation.`
export const MAX_SIMULATION_STEPS = 200000
export const MAX_TIMELINE_SAMPLES = Math.ceil(MAX_PLAN_SECONDS / 5) + 1

export function validateActionCount(count: number) {
    if (count > MAX_PLAN_ACTIONS) throw new Error(ACTION_LIMIT_MESSAGE)
}

export function validatePlanTime(time: number, label = "Command time") {
    if (!Number.isFinite(time) || time < 0 || time > MAX_PLAN_SECONDS)
        throw new Error(`${label} must be between 00:00 and 30:00.`)
}

export function validateCommandTime(time: number) {
    if (!Number.isFinite(time) || time < 0 || time > MAX_COMMAND_SECONDS) throw new Error("Command time must be between 00:00 and 29:59.")
}

export function validateEconomyDurations(settings: {
    goldGatherTime: number; woodGatherTime: number; goldTravelTime: number; woodTravelTime: number;
    sawmillWoodTravelTime: number; initialGoldTravelReduction: number; constructionStartDelay: number; orderDelay: number;
    timeBetweenScrolls?: number;
}, maximumWorkers = MAX_PLAN_ACTIONS + 5) {
    for (const [key, value] of Object.entries(settings)) {
        if (["goldGatherTime", "woodGatherTime", "goldTravelTime", "woodTravelTime", "sawmillWoodTravelTime",
            "initialGoldTravelReduction", "constructionStartDelay", "orderDelay", "timeBetweenScrolls"].includes(key))
            validatePlanTime(value, key)
    }
    // Overestimate both resources using the full worker count for each. Each trip
    // has three transitions, each of which may require a separate event-loop step.
    // Reserve another 10% of the runtime budget for construction and initial arrivals.
    const workers = maximumWorkers
    const goldGatherTime = Math.max(0.001, settings.goldGatherTime)
    const goldCycle = goldGatherTime + 2 * settings.goldTravelTime
    const goldTripsPerSecond = Math.min(1 / goldGatherTime, workers / goldCycle)
    const woodCycle = Math.max(0.001, settings.woodGatherTime) + 2 * Math.min(settings.woodTravelTime, settings.sawmillWoodTravelTime, MAX_SAWMILL_WOOD_TRAVEL_TIME)
    const steps = 6 * MAX_PLAN_SECONDS * (goldTripsPerSecond + workers / woodCycle)
    if (steps > MAX_SIMULATION_STEPS * 0.9)
        throw new Error("Gathering cycles are too short for the supported simulation budget. Increase gathering or travel times, or reduce mining time reductions.")
}
