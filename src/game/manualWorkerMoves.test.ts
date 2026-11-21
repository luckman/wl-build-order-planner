import { simulateBuildOrder } from "./buildSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { factions, type FactionId, type PlannerItem } from "./gameData"
import { workerAllocationAt } from "./resourceSimulation"
import { createManualWorkerMove } from "./manualWorkerMoves"
import { createWorkerEvent } from "./workerEvents"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { createUnitKilledAction } from "./unitsKilled"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 2, goldWorkers: 2, woodWorkers: 0, orderDelay: 1, initialGoldTravelReduction: 0,
    goldTravelTime: 4, goldGatherTime: 3, woodTravelTime: 2, woodGatherTime: 6, woodTravelTimeIncreaseBase: 0 }
const move = (commandTime: number, count = 1) => createManualWorkerMove({ type: "move-gold-miner-to-wood", commandTime, count })
const simulate = (items: PlannerItem[], settings = economy, faction: FactionId = "light", previous?: ReturnType<typeof simulateBuildOrder>) =>
    simulateBuildOrder(items, settings, 4, 200, settings.foodPerFarm, factions[faction].startingTownHall, { until: 60, previous })

test.each(["light", "dark"] as const)("%s miners complete queued gold deliveries before moving to wood", faction => {
    const result = simulate([move(1, 2)], economy, faction)
    expect(result.plan[0]).toMatchObject({ commandTime: 1, finishTime: 14, manualMove: { completed: 2 } })
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: 11, gold: economy.goldPerTrip, wood: 0 },
        { time: 14, gold: economy.goldPerTrip, wood: 0 },
    ])
    expect(workerAllocationAt(economy, result.orderedPlan, 11)).toMatchObject({ gold: 1, wood: 1 })
    expect(workerAllocationAt(economy, result.orderedPlan, 14)).toMatchObject({ gold: 0, wood: 2 })
})

test("a late standalone manual move projects far enough to finish the pending delivery", () => {
    const result = simulate([move(1200)], { ...economy, workerCount: 1, goldWorkers: 1 })
    expect(result.plan[0]).toMatchObject({ commandTime: 1200, finishTime: 1210, manualMove: { completed: 1 } })
})

test("too few original gold workers blocks the whole batch", () => {
    const result = simulate([move(1, 3)])
    expect(result.plan[0]).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: 1 },
        blockedReason: "Only 2 source workers available for 3 requested." })
    expect(workerAllocationAt(economy, result.orderedPlan, 30)).toMatchObject({ gold: 2, wood: 0 })
})

test("earlier pending moves take the worker before a same-time new move", () => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 1 }
    const result = simulate([move(11), move(1), move(1)], settings)
    expect(result.plan.map(action => action.manualMove)).toEqual([
        { completed: 0, endTime: 11, reason: "Only 0 source workers available for 1 requested." },
        { completed: 1, endTime: 11 },
        { completed: 0, endTime: 11, reason: "Only 0 source workers remain for 1 outstanding." },
    ])
})

test("leaving the source closes a partial move and a worker returning to gold does not restart it", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 12, count: 2 }, "light")
    const active = createWorkerEvent({ type: "make-active", commandTime: 13, count: 2 }, "light")
    const result = simulate([move(1, 2), idle, active])
    expect(result.plan[0].manualMove).toEqual({
        completed: 1, endTime: 12, reason: "Only 0 source workers remain for 1 outstanding.",
    })
    expect(workerAllocationAt(economy, result.orderedPlan, 45)).toMatchObject({ gold: 1, wood: 1 })
})

test("manual moves run before automatic switches and the same worker cannot bounce back", () => {
    const limit = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 11, limit: 5 })
    const settings = { ...economy, workerCount: 1, goldWorkers: 1 }
    const result = simulate([move(1), limit], settings)
    expect(result.plan[0].manualMove).toEqual({ completed: 1, endTime: 11 })
    expect(workerAllocationAt(settings, result.orderedPlan, 11)).toMatchObject({ gold: 0, wood: 1 })
    expect(result.deliveries).toContainEqual({ time: 21, gold: 0, wood: economy.woodPerTrip, worker: 0 })
})

test("a pending gold builder takes one direct route at construction finish", () => {
    const farm = factions.light.items.find(item => item.id === "farm")!
    const building = { ...farm, construction: { outwardDuration: 2, returnDuration: 7 } }
    const settings = { ...economy, workerCount: 1, goldWorkers: 1, constructionStartDelay: 2 }
    const result = simulate([building, move(4)], settings)
    const finish = result.plan[0].finishTime!
    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: finish })
    expect(workerAllocationAt(settings, result.orderedPlan, finish)).toMatchObject({ gold: 0, wood: 1 })
    expect(result.deliveries[0]).toMatchObject({ time: finish + 15, gold: 0, wood: economy.woodPerTrip })
})

test("a builder moving to wood on Sawmill completion takes the maximum first forest trip", () => {
    const sawmill = factions.light.items.find(item => item.id === "sawmill")!
    const settings = { ...economy, workerCount: 1, goldWorkers: 1, maxWoodTravelTime: 10, sawmillWoodTravelTime: 1 }
    const result = simulate([{ ...sawmill, construction: { outwardDuration: 0, returnDuration: 2 } }, move(2)], settings)
    const finish = result.plan[0].finishTime!
    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: finish })
    expect(result.deliveries[0]).toMatchObject({ time: finish + 17, gold: 0, wood: economy.woodPerTrip })
})

test("a casualty before a new same-time move can kill a builder with an instantaneous return", () => {
    const farm = factions.light.items.find(item => item.id === "farm")!
    const settings = { ...economy, workerCount: 1, goldWorkers: 1 }
    const building = { ...farm, construction: { outwardDuration: 0, returnDuration: 0 } }
    const finish = simulate([building], settings).plan[0].finishTime!
    const casualty = createUnitKilledAction({ type: "unit-is-killed", unitId: "worker", commandTime: finish }, "light")
    const result = simulate([building, casualty, move(finish)], settings)
    expect(result.plan[1]).toMatchObject({ blocked: false, workerId: 0 })
    expect(result.plan[2]).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: finish } })
    expect(workerAllocationAt(settings, result.orderedPlan, finish).total).toBe(0)
})

test("same-time new moves follow Build order with Make idle after completed recruits", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const settings = { ...economy, workerCount: 1, goldWorkers: 1 }
    const recruitTime = simulate([worker], settings).plan[0].finishTime!
    const idle = createWorkerEvent({ type: "make-idle", commandTime: recruitTime, count: 1 }, "light")
    const afterMove = simulate([worker, move(recruitTime, 2), idle], settings)
    const beforeMove = simulate([worker, idle, move(recruitTime, 2)], settings)
    expect(afterMove.plan[1].manualMove).toEqual({
        completed: 0, endTime: recruitTime, reason: "Only 1 source workers remain for 2 outstanding.",
    })
    expect(beforeMove.plan[2]).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: recruitTime } })
})

test("recalculation from a pending-move checkpoint matches a fresh simulation", () => {
    const settings = { ...economy, goldTravelTime: 20, goldGatherTime: 60, workerCount: 5, goldWorkers: 1 }
    const buildings = ["farm", "barracks", "sawmill", "tower-of-mana"].map(id => ({
        ...factions.light.items.find(item => item.id === id)!,
        construction: { useIdleWorker: true, outwardDuration: 0 },
    }))
    const swordsman = factions.light.items.find(item => item.id === "swordsman")!
    const prefix = [...buildings, swordsman, move(1)]
    const limit = (commandTime: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit: 2, reassign: false })
    const previous = simulate([...prefix, limit(80)], settings)
    const edited = [...prefix, limit(90)]
    const result = simulate(edited, settings, "light", previous)
    expect(result).toEqual(simulate(edited, settings))
    expect(result.plan[5].manualMove).toEqual({ completed: 1, endTime: 100 })
    expect(workerAllocationAt(settings, result.orderedPlan, 100)).toMatchObject({ gold: 0, wood: 1 })
})
