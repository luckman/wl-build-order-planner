import { simulateBuildOrder } from "./buildSimulation"
import { factions, type FactionId, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { workerAllocationAt } from "./resourceSimulation"
import { createWorkerEvent } from "./workerEvents"

const economy = {
    ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 1, goldWorkers: 1, woodWorkers: 0, orderDelay: 1,
    goldTravelTime: 4, goldGatherTime: 3, initialGoldTravelReduction: 0,
    woodTravelTime: 4, woodGatherTime: 12, woodTravelTimeIncreaseBase: 0,
}
const limit = (commandTime: number, limit: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit, reassign: false })
const idle = (commandTime: number, count = 1, faction: FactionId = "light") =>
    createWorkerEvent({ type: "make-idle", commandTime, count }, faction)
const active = (commandTime: number, travelDuration: number, count = 1, faction: FactionId = "light") =>
    createWorkerEvent({ type: "make-active", commandTime, count, travelDuration }, faction)
const simulate = (items: PlannerItem[], settings = economy, faction: FactionId = "light") =>
    simulateBuildOrder(items, settings, 2, 200, settings.foodPerFarm, factions[faction].startingTownHall, 45)

test.each(["light", "dark"] as const)("%s reactivation sends a former miner to wood when gold is full", faction => {
    const result = simulate([idle(0, 1, faction), active(1, 4, 1, faction), limit(1, 0)], economy, faction)

    expect(result.plan[1]).toMatchObject({ blocked: false, commandTime: 1, finishTime: 1 })
    expect(workerAllocationAt(economy, result.orderedPlan, 4)).toMatchObject({ idle: 0, gold: 0, wood: 0, buildingOrTravelling: 1 })
    expect(workerAllocationAt(economy, result.orderedPlan, 5)).toMatchObject({ gold: 0, wood: 1, buildingOrTravelling: 0 })
    // Four seconds of reactivation, twelve of chopping, and four returning with wood.
    expect(result.deliveries[0]).toMatchObject({ time: 21, gold: 0, wood: economy.woodPerTrip })
})

test("each former miner checks the remaining slot while the other workers are still reactivating", () => {
    const settings = { ...economy, workerCount: 3, goldWorkers: 3 }
    const result = simulate([idle(0, 3), limit(1, 1), active(1, 4, 2), active(1, 4)], settings)

    expect(workerAllocationAt(settings, result.orderedPlan, 4)).toMatchObject({ idle: 0, buildingOrTravelling: 3 })
    expect(workerAllocationAt(settings, result.orderedPlan, 5)).toMatchObject({ gold: 1, wood: 2, buildingOrTravelling: 0 })
    expect(result.deliveries.slice(0, 3)).toMatchObject([
        { time: 12, gold: economy.goldPerTrip, wood: 0 },
        { time: 21, gold: 0, wood: economy.woodPerTrip },
        { time: 21, gold: 0, wood: economy.woodPerTrip },
    ])
})

test("a gold-assigned builder occupies the available gold slot", () => {
    const settings = { ...economy, workerCount: 2, goldWorkers: 2 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const result = simulate([idle(0), limit(0, 1), farm, active(2, 3)], settings)

    expect(result.plan[2]).toMatchObject({ blocked: false, commandTime: 1, workerId: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, 5)).toMatchObject({ gold: 0, wood: 1, buildingOrTravelling: 1 })
    expect(result.deliveries[0]).toMatchObject({ time: 21, gold: 0, wood: economy.woodPerTrip })
})

test("reactivation before the first explicit limit restores saved gold assignments above the profile threshold", () => {
    const settings = { ...economy, workerCount: 3, goldWorkers: 3, goldTravelTime: 0.25 }
    const result = simulate([idle(0, 3), active(1, 4, 3), limit(20, 5)], settings)

    expect(workerAllocationAt(settings, result.orderedPlan, 5)).toMatchObject({ gold: 3, wood: 0 })
    expect(result.deliveries[0]).toMatchObject({ time: 8.25, gold: economy.goldPerTrip, wood: 0 })
})

test("an open gold slot does not change a worker's saved wood assignment or progress", () => {
    const settings = { ...economy, goldWorkers: 0, woodWorkers: 1 }
    const result = simulate([idle(6), limit(7, 5), active(10, 10)], settings)

    expect(workerAllocationAt(settings, result.orderedPlan, 20)).toMatchObject({ gold: 0, wood: 1 })
    // The worker resumes the wood gathered between 00:04 and 00:06.
    expect(result.deliveries[0]).toMatchObject({ time: 34, gold: 0, wood: economy.woodPerTrip })
})
