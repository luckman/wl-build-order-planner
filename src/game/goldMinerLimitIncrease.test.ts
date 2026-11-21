import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { workerAllocationAt } from "./resourceSimulation"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createScrollAction } from "./scrolls"
import { createUnitKilledAction } from "./unitsKilled"

const economy = {
    ...economyFromProfile(initialGameProfile),
    workerCount: 3, goldWorkers: 0, woodWorkers: 3, orderDelay: 1,
    goldTravelTime: 2, goldGatherTime: 3,
    woodTravelTime: 8, maxWoodTravelTime: 8, woodTravelTimeIncreaseBase: 0, woodGatherTime: 12,
}
const limit = (commandTime: number, count: number, reassign = true) =>
    createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit: count, reassign })
const simulate = (items: PlannerItem[], settings = economy, previous?: ReturnType<typeof simulateBuildOrder>) =>
    simulateBuildOrder(items, settings, settings.workerCount * 2, 20, settings.foodPerFarm, "Castle", { until: 90, previous })

test("a checked increase redirects the farthest empty outbound worker, breaking ties by worker order", () => {
    const result = simulate([limit(0, 0), limit(2, 1)])
    expect(workerAllocationAt(economy, result.orderedPlan, 2)).toMatchObject({ gold: 1, wood: 2 })
    // Workers 1 and 2 left one second after worker 0. At command time their seven remaining
    // seconds exceed gold travel (two seconds). Worker 1 wins the tie and deposits at 2 + 7 + 3 + 2.
    expect(result.deliveries.find(delivery => delivery.gold > 0)).toEqual({ time: 14, worker: 1, wood: 0, gold: economy.goldPerTrip })
    expect(result.deliveries.filter(delivery => delivery.wood > 0).slice(0, 2)).toMatchObject([
        { time: 28, worker: 0, wood: 50 },
        { time: 29, worker: 2, wood: 50 },
    ])
})

test.each([10, 21])("an increase at %ss preserves the worker's full boosted wood load", time => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const lumberGathering = createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering", commandTime: 1 }, "light")
    const result = simulate([lumberGathering, limit(0, 0), limit(time, 1)], settings)
    expect(workerAllocationAt(settings, result.orderedPlan, 27)).toMatchObject({ gold: 0, wood: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, 28)).toMatchObject({ gold: 1, wood: 0 })
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: 28, wood: 65, gold: 0 },
        { time: 35, wood: 0, gold: settings.goldPerTrip },
    ])
})

test("a worker delivers a full load to a completed Sawmill before taking the gold journey", () => {
    const settings = { ...economy, workerCount: 2, woodWorkers: 1, startingGold: 1000, startingWood: 1000, woodGatherTime: 14 }
    const sawmill = factions.light.items.find(item => item.id === "sawmill")!
    const result = simulate([{ ...sawmill, construction: { useIdleWorker: true, outwardDuration: 0 } },
        limit(0, 0), limit(10, 1)], settings)
    expect(result.plan[0]).toMatchObject({ blocked: false, finishTime: 21 })
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: 22.5, worker: 0, wood: 50, gold: 0 },
        { time: 29.5, worker: 0, wood: 0, gold: settings.goldPerTrip },
    ])
})

test("an unchecked increase survives saving and reopening and takes no wood gatherers", () => {
    const result = simulate([limit(0, 0), limit(2, 1, false)])
    const saved = serializeBuildOrder("light", initialGameProfile, result.plan)
    const reopened = parseBuildOrder(saved)
    expect(reopened.buildOrder[1]).toMatchObject({ kind: "limit-gold-miners", goldLimit: 1, reassign: false })
    const replay = simulate(reopened.buildOrder)
    expect(workerAllocationAt(economy, replay.orderedPlan, 45)).toMatchObject({ gold: 0, wood: 3 })
    expect(replay.deliveries.every(delivery => delivery.gold === 0)).toBe(true)
})

test("a later limit replaces permission to use existing wood gatherers", () => {
    const original = [limit(0, 0), limit(10, 1)]
    const previous = simulate(original)
    expect(previous.deliveries.find(delivery => delivery.gold > 0)).toMatchObject({ worker: 0, time: 35, gold: economy.goldPerTrip })
    const revised = [...original, limit(11, 2, false)]
    const result = simulate(revised, economy, previous)
    expect(result).toEqual(simulate(revised))
    expect(workerAllocationAt(economy, result.orderedPlan, 60)).toMatchObject({ gold: 0, wood: 3 })
    expect(result.deliveries.every(delivery => delivery.gold === 0)).toBe(true)
})

test("a same-time recruit gets the remaining gold slot before a wood delivery can redirect a gatherer", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const starting = { ...economy, workerCount: 1, woodWorkers: 1, woodTravelTime: 4 }
    const recruitFinish = simulate([worker], starting).plan[0].finishTime!
    const settings = { ...starting, woodGatherTime: recruitFinish - 8 }
    const result = simulate([worker, limit(0, 0), limit(10, 1)], settings)
    expect(result.deliveries[0]).toMatchObject({ worker: 0, wood: 50, gold: 0 })
    expect(result.deliveries[0].time).toBeCloseTo(recruitFinish, 8)
    expect(result.deliveries.find(delivery => delivery.gold > 0)).toMatchObject({ worker: 1, gold: economy.goldPerTrip })
    expect(workerAllocationAt(settings, result.orderedPlan, 45)).toMatchObject({ gold: 1, wood: 1 })
})

test("a later casualty leaves a vacancy after automatic reassignment filled the limit", () => {
    const settings = { ...economy, workerCount: 2, woodWorkers: 2, startingGold: 1000, startingWood: 1000 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const casualty = createUnitKilledAction({ type: "unit-is-killed", unitId: "worker", commandTime: 3 }, "light")
    const order = [farm, limit(0, 0), limit(2, 1), casualty]
    const result = simulate(order, settings)
    expect(result.plan[0]).toMatchObject({ blocked: false, workerId: 0 })
    expect(result.plan[3]).toMatchObject({ blocked: false, workerId: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, 60)).toMatchObject({ total: 1, gold: 0, wood: 1 })
    expect(result.deliveries.every(delivery => delivery.gold === 0)).toBe(true)

    const worker = factions.light.items.find(item => item.id === "worker")!
    const withRecruit = simulate([...order, worker], settings)
    expect(workerAllocationAt(settings, withRecruit.orderedPlan, 60)).toMatchObject({ total: 2, gold: 1, wood: 1 })
    expect(withRecruit.deliveries.find(delivery => delivery.gold > 0)).toMatchObject({ worker: 2 })
})

test("a same-time casualty cannot restore permission after the recruit filled the cap", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1, startingGold: 1000, startingWood: 1000 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const worker = factions.light.items.find(item => item.id === "worker")!
    const prefix = [farm, worker, limit(0, 0), limit(2, 1)]
    const recruitFinish = simulate(prefix, settings).plan[1].finishTime!
    const casualty = createUnitKilledAction({ type: "unit-is-killed", unitId: "worker", commandTime: recruitFinish }, "light")
    const result = simulate([...prefix, casualty], settings)
    expect(result.plan[0].finishTime).toBeGreaterThan(recruitFinish)
    expect(result.plan[4]).toMatchObject({ blocked: false, workerId: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, 60)).toMatchObject({ total: 1, gold: 0, wood: 1 })
    expect(result.deliveries.every(delivery => delivery.gold === 0)).toBe(true)
})

test("a checkpoint keeps the permission while a later limit is edited", () => {
    const settings = { ...economy, workerCount: 5, woodWorkers: 1, startingGold: 10000, startingWood: 10000,
        woodTravelTime: 0, woodGatherTime: 60 }
    const buildings = ["farm", "barracks", "sawmill", "tower-of-mana"].map(id => ({
        ...factions.light.items.find(item => item.id === id)!,
        construction: { useIdleWorker: true, outwardDuration: 0 },
    }))
    const swordsman = factions.light.items.find(item => item.id === "swordsman")!
    const prefix = [...buildings, swordsman, limit(0, 0), limit(1, 1)]
    const previous = simulate([...prefix, limit(50, 2, false)], settings)
    expect(previous.deliveries.every(delivery => delivery.gold === 0)).toBe(true)
    const edited = [...prefix, limit(80, 2, false)]
    const result = simulate(edited, settings, previous)
    expect(result).toEqual(simulate(edited, settings))
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: 60.5, worker: 0, wood: 50, gold: 0 },
        { time: 67.5, worker: 0, wood: 0, gold: settings.goldPerTrip },
    ])
    expect(workerAllocationAt(settings, result.orderedPlan, 70)).toMatchObject({ gold: 1, wood: 0 })
})
