import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { workerAllocationAt } from "./resourceSimulation"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createScrollAction } from "./scrolls"
import { createUnitKilledAction } from "./unitsKilled"

const economy = {
    ...economyFromProfile(initialGameProfile),
    startingGold: 1000, startingWood: 1000, workerCount: 1, goldWorkers: 0, woodWorkers: 1,
    orderDelay: 1, goldTravelTime: 3, goldGatherTime: 4, initialGoldTravelReduction: 0,
    woodTravelTime: 8, woodGatherTime: 12, woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 10,
}
const farm = factions.light.items.find(item => item.id === "farm")!
const sawmill = factions.light.items.find(item => item.id === "sawmill")!
const worker = factions.light.items.find(item => item.id === "worker")!
const limit = (commandTime: number, count: number) =>
    createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit: count })
const funds = (commandTime: number, gold: number) =>
    createResourcesCollectedAction({ type: "resources-collected", commandTime, gold, wood: 0 })
const simulate = (items: PlannerItem[], settings = economy) =>
    simulateBuildOrder(items, settings, settings.workerCount * 2, 20, settings.foodPerFarm, "Castle", { until: 90 })

test.each([[0, 36], [1, 36], [7, 40]])("an empty wood builder reaches gold directly with a %s-second return leg", (returnDuration, firstGold) => {
    const order = [{ ...farm, construction: { outwardDuration: 0, returnDuration } }, limit(0, 0), limit(26, 1)]
    const result = simulate(order)

    expect(result.plan[0]).toMatchObject({ finishTime: 26, workerId: 0 })
    expect(workerAllocationAt(economy, result.orderedPlan, 25)).toMatchObject({ gold: 0, wood: 0, buildingOrTravelling: 1 })
    expect(workerAllocationAt(economy, result.orderedPlan, 26)).toMatchObject({ gold: 1, wood: 0, buildingOrTravelling: 0 })
    expect(result.deliveries[0]).toMatchObject({ time: firstGold, worker: 0, gold: economy.goldPerTrip, wood: 0 })
})

test.each([
    { building: farm, returnDuration: 2, firstWood: 54 },
    { building: farm, returnDuration: 12, firstWood: 58 },
    { building: sawmill, returnDuration: 2, firstWood: 43.5 },
])(
    "an empty gold builder goes directly to wood after $building.name with a $returnDuration-second return leg",
    ({ building, returnDuration, firstWood }) => {
        const settings = { ...economy, goldWorkers: 1, woodWorkers: 0 }
        const result = simulate([{ ...building, construction: { outwardDuration: 0, returnDuration } }, limit(2, 0)], settings)
        const finish = result.plan[0].finishTime!

        expect(workerAllocationAt(settings, result.orderedPlan, finish - 0.1)).toMatchObject({ gold: 0, wood: 0, buildingOrTravelling: 1 })
        expect(workerAllocationAt(settings, result.orderedPlan, finish)).toMatchObject({ gold: 0, wood: 1, buildingOrTravelling: 0 })
        expect(result.deliveries[0]).toMatchObject({ time: firstWood, worker: 0, gold: 0, wood: settings.woodPerTrip })
    },
)

test.each([[12, 55], [21, 56]])("wood saved at a %s-second construction command is delivered before switching", (commandTime, woodDeposit) => {
    const settings = { ...economy, startingGold: 0 }
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 2 } }, funds(commandTime - 1, farm.gold),
        limit(0, 0), limit(commandTime + 1, 1)], settings)
    const build = result.plan[0]

    expect(build).toMatchObject({ commandTime, workerReturnTime: commandTime + 27 })
    expect(workerAllocationAt(settings, result.orderedPlan, build.finishTime!)).toMatchObject({ gold: 0, wood: 0, buildingOrTravelling: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, woodDeposit - 0.1)).toMatchObject({ gold: 0, wood: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, woodDeposit)).toMatchObject({ gold: 1, wood: 0 })
    expect(result.deliveries.filter(delivery => delivery.worker === 0).slice(0, 2)).toMatchObject([
        { time: woodDeposit, gold: 0, wood: settings.woodPerTrip },
        { time: woodDeposit + 10, gold: settings.goldPerTrip, wood: 0 },
    ])
})

test("construction still discards interrupted gold cargo before an empty builder switches to wood", () => {
    const settings = { ...economy, startingGold: 0, goldWorkers: 1, woodWorkers: 0 }
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 2 } }, funds(7, farm.gold), limit(9, 0)], settings)

    expect(result.plan[0]).toMatchObject({ commandTime: 8, finishTime: 33 })
    expect(workerAllocationAt(settings, result.orderedPlan, 33)).toMatchObject({ gold: 0, wood: 1 })
    expect(result.deliveries.find(delivery => delivery.worker === 0)).toMatchObject({ time: 61, gold: 0, wood: settings.woodPerTrip })
})

test("a completed recruit fills the gold slot before a builder who finishes at the same time", () => {
    const recruitment = simulate([worker]).plan[0]
    const recruitTime = recruitment.finishTime! - recruitment.commandTime!
    const settings = { ...economy, startingGold: farm.gold }
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 2 } }, worker,
        funds(26 - recruitTime - economy.orderDelay, worker.gold), limit(0, 0), limit(2, 1)], settings)

    expect(result.plan[0]).toMatchObject({ finishTime: 26 })
    expect(result.plan[1].finishTime).toBeCloseTo(26, 8)
    expect(workerAllocationAt(settings, result.orderedPlan, 26.1)).toMatchObject({ gold: 1, wood: 0, buildingOrTravelling: 1 })
    expect(result.deliveries.find(delivery => delivery.worker >= 0 && delivery.gold > 0)).toMatchObject({ worker: 1 })
    expect(result.deliveries.find(delivery => delivery.wood > 0)).toMatchObject({ time: 48, worker: 0 })
})

test("a builder drawn from idle stays idle at the site even with an open gold slot", () => {
    const settings = { ...economy, woodWorkers: 0 }
    const result = simulate([{ ...farm, construction: { useIdleWorker: true, outwardDuration: 0, returnDuration: 12 } },
        limit(0, 0), limit(2, 1)], settings)

    expect(result.plan[0]).toMatchObject({ finishTime: 26, workerReturnTime: 26 })
    expect(workerAllocationAt(settings, result.orderedPlan, 26)).toMatchObject({ idle: 1, gold: 0, wood: 0, buildingOrTravelling: 0 })
    expect(result.deliveries).toEqual([])
})

test("a builder who returns instantly remains eligible for a same-time casualty when no switch is due", () => {
    const casualty = createUnitKilledAction({ type: "unit-is-killed", unitId: "worker", commandTime: 26 }, "light")
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 0 } }, limit(2, 0), casualty])

    expect(result.plan[0]).toMatchObject({ finishTime: 26 })
    expect(result.plan[2]).toMatchObject({ workerId: 0, blocked: false })
    expect(workerAllocationAt(economy, result.orderedPlan, 26)).toMatchObject({ total: 0, gold: 0, wood: 0 })
})

test("Whip starting at construction completion speeds up the chosen direct route once", () => {
    const settings = { ...economy, baseManaLimit: 500, startingMana: 500, darkWhipLevel: 1 }
    const pigsty = factions.dark.items.find(item => item.id === "pigsty")!
    const whip = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 25 }, "dark")
    const order = [{ ...pigsty, construction: { outwardDuration: 0, returnDuration: 7 } }, limit(0, 0), limit(2, 1), whip]
    const result = simulateBuildOrder(order, settings, 2, 20, settings.foodPerFarm, "Citadel", { until: 90 })

    expect(result.plan[0]).toMatchObject({ finishTime: 26 })
    expect(result.plan[3]).toMatchObject({ startTime: 26, blocked: false })
    expect(workerAllocationAt(settings, result.orderedPlan, 26)).toMatchObject({ gold: 1, wood: 0 })
    expect(result.deliveries[0]).toMatchObject({ worker: 0, gold: settings.goldPerTrip, wood: 0 })
    expect(result.deliveries[0].time).toBeCloseTo(26 + 7 / 1.15 + 3.5 + 3 / 1.15)
})
