import { simulateBuildOrder } from "./buildSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { factions, type FactionId, type PlannerItem } from "./gameData"
import { workerAllocationAt } from "./resourceSimulation"
import { createManualWorkerMove } from "./manualWorkerMoves"
import { createWorkerEvent } from "./workerEvents"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { createUnitKilledAction } from "./unitsKilled"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createScrollAction } from "./scrolls"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 2, goldWorkers: 2, woodWorkers: 0, orderDelay: 1, initialGoldTravelReduction: 0,
    goldTravelTime: 4, goldGatherTime: 3, woodTravelTime: 2, woodGatherTime: 6, woodTravelTimeIncreaseBase: 0 }
const move = (commandTime: number, count = 1) => createManualWorkerMove({ type: "move-gold-miner-to-wood", commandTime, count })
const moveToGold = (commandTime: number, count = 1) => createManualWorkerMove({ type: "move-wood-gatherer-to-gold", commandTime, count })
const simulate = (items: PlannerItem[], settings = economy, faction: FactionId = "light", previous?: ReturnType<typeof simulateBuildOrder>) =>
    simulateBuildOrder(items, settings, 4, 200, settings.foodPerFarm, factions[faction].startingTownHall, { until: 60, previous })

test("a move to gold redirects the farthest empty wood gatherer and keeps the longer trip", () => {
    const settings = { ...economy, workerCount: 3, goldWorkers: 0, woodWorkers: 3, woodTravelTime: 8, maxWoodTravelTime: 8 }
    const result = simulate([moveToGold(2)], settings)

    expect(result.plan[0].manualMove).toEqual({ completed: 1, endTime: 2 })
    expect(workerAllocationAt(settings, result.orderedPlan, 2)).toMatchObject({ gold: 1, wood: 2 })
    // Workers 1 and 2 leave at 1s, so both have 7s to the forest while worker 0 has 6s.
    expect(result.deliveries.find(delivery => delivery.gold > 0)).toEqual({ time: 16, worker: 1, gold: settings.goldPerTrip, wood: 0 })
})

test.each([293, 305])("a %ss wood load extends the projection through the move and its subsequent gold delivery", woodGatherTime => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 1, woodGatherTime }
    const result = simulate([moveToGold(2)], settings)
    const woodDeposit = woodGatherTime + 2

    expect(result.plan[0]).toMatchObject({ finishTime: woodDeposit, manualMove: { completed: 1, endTime: woodDeposit } })
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: woodDeposit, wood: settings.woodPerTrip, gold: 0 },
        { time: woodDeposit + 11, wood: 0, gold: settings.goldPerTrip },
    ])
    expect(workerAllocationAt(settings, result.orderedPlan, woodDeposit)).toMatchObject({ gold: 1, wood: 0 })
})

test.each([undefined, 3])("a move to gold rejects the full request under a limit of %s", explicitLimit => {
    const settings = { ...economy, workerCount: 5, goldWorkers: 3, woodWorkers: 2 }
    const limits = explicitLimit === undefined ? [] : [createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 0, limit: explicitLimit })]
    const result = simulate([...limits, moveToGold(1, 2)], settings)

    expect(result.plan.at(-1)).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: 1 },
        blockedReason: `Only ${explicitLimit === undefined ? 1 : 0} gold slots available for 2 requested. Increase the gold limit or reduce the worker count.` })
    expect(workerAllocationAt(settings, result.orderedPlan, 45)).toMatchObject({ gold: 3, wood: 2 })
})

test("a pending move preserves its first switch and closes when a recruit takes the final slot at a wood delivery", () => {
    const recruit = factions.light.items.find(item => item.id === "worker")!
    const opening = { ...economy, goldWorkers: 0, woodWorkers: 2 }
    const recruitFinish = simulate([recruit], opening).plan[0].finishTime!
    const settings = { ...opening, woodGatherTime: recruitFinish - 4 }
    const limit = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 0, limit: 2, reassign: false })
    const order = [recruit, limit, moveToGold(2.5, 2), move(recruitFinish + 1)]
    const result = simulate(order, settings)

    expect(workerAllocationAt(settings, result.orderedPlan, 2.5)).toMatchObject({ gold: 1, wood: 1 })
    expect(result.plan[2]).toMatchObject({ blocked: false, manualMove: {
        completed: 1, endTime: recruitFinish, reason: expect.stringContaining("gold limit is full"),
    } })
    expect(result.deliveries).toContainEqual({ time: recruitFinish, worker: 0, gold: 0, wood: settings.woodPerTrip })
    expect(workerAllocationAt(settings, result.orderedPlan, recruitFinish)).toMatchObject({ gold: 2, wood: 1 })
    expect(result.plan[3].manualMove?.completed).toBe(1)
    expect(workerAllocationAt(settings, result.orderedPlan, 60)).toMatchObject({ gold: 1, wood: 2 })
    expect(result.deliveries.filter(delivery => delivery.worker === 0).every(delivery => delivery.gold === 0)).toBe(true)
})

test.each([10, 21])("a move to gold at %ss preserves a full boosted wood load", commandTime => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 8,
        maxWoodTravelTime: 8, woodGatherTime: 12 }
    const boost = createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering", commandTime: 1 }, "light")
    const result = simulate([boost, moveToGold(commandTime)], settings)

    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: 28 })
    expect(workerAllocationAt(settings, result.orderedPlan, 27)).toMatchObject({ gold: 0, wood: 1 })
    expect(workerAllocationAt(settings, result.orderedPlan, 28)).toMatchObject({ gold: 1, wood: 0 })
    expect(result.deliveries.slice(0, 2)).toMatchObject([{ time: 28, wood: 65 }, { time: 39, gold: settings.goldPerTrip }])
})

test("a move to gold carries its full load to a completed Sawmill before switching", () => {
    const settings = { ...economy, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 8,
        maxWoodTravelTime: 8, woodGatherTime: 14 }
    const sawmill = factions.light.items.find(item => item.id === "sawmill")!
    const result = simulate([{ ...sawmill, construction: { useIdleWorker: true, outwardDuration: 0 } }, moveToGold(10)], settings)

    expect(result.plan[0]).toMatchObject({ finishTime: 21 })
    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: 22.5 })
    expect(result.deliveries.slice(0, 2)).toMatchObject([
        { time: 22.5, worker: 0, gold: 0, wood: settings.woodPerTrip },
        { time: 33.5, worker: 0, gold: settings.goldPerTrip, wood: 0 },
    ])
})

test("a zero-cargo wood builder can switch from the site on the command timestamp", () => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 7 } }, moveToGold(26)], settings)

    expect(result.plan[0]).toMatchObject({ finishTime: 26, workerId: 0 })
    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: 26 })
    expect(workerAllocationAt(settings, result.orderedPlan, 26)).toMatchObject({ gold: 1, wood: 0, buildingOrTravelling: 0 })
    expect(result.deliveries[0]).toMatchObject({ time: 40, worker: 0, gold: settings.goldPerTrip, wood: 0 })
})

test("a same-time Make idle can select a wood builder with an instantaneous return before a new move", () => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, orderDelay: 3,
        woodTravelTime: 8, maxWoodTravelTime: 8 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const building = { ...farm, construction: { outwardDuration: 0, returnDuration: 0 } }
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 28, count: 1 }, "light")
    const move = moveToGold(28)
    const idleFirst = simulate([building, idle, move], settings)
    const moveFirst = simulate([building, move, idle], settings)

    expect(idleFirst.plan[1]).toMatchObject({ blocked: false })
    expect(idleFirst.plan[2]).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: 28 } })
    expect(workerAllocationAt(settings, idleFirst.orderedPlan, 28)).toMatchObject({ idle: 1, gold: 0 })
    expect(moveFirst.plan[1].manualMove).toEqual({ completed: 1, endTime: 28 })
})

test.each([[12, 55], [21, 56]])("wood saved by construction at %ss is delivered before a manual move", (commandTime, woodDeposit) => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, startingGold: 0,
        woodTravelTime: 8, maxWoodTravelTime: 10, woodGatherTime: 12 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const funds = createResourcesCollectedAction({ type: "resources-collected", commandTime: commandTime - 1, gold: farm.gold, wood: 0 })
    const result = simulate([{ ...farm, construction: { outwardDuration: 0, returnDuration: 2 } }, funds, moveToGold(commandTime + 1)], settings)

    expect(result.plan[2].manualMove).toEqual({ completed: 1, endTime: woodDeposit })
    expect(workerAllocationAt(settings, result.orderedPlan, result.plan[0].finishTime!)).toMatchObject({ gold: 0, wood: 0, buildingOrTravelling: 1 })
    expect(result.deliveries.filter(delivery => delivery.worker === 0).slice(0, 2)).toMatchObject([
        { time: woodDeposit, gold: 0, wood: settings.woodPerTrip }, { time: woodDeposit + 11, gold: settings.goldPerTrip, wood: 0 },
    ])
})

test("an idle builder cannot satisfy a move to gold", () => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 0 }
    const farm = factions.light.items.find(item => item.id === "farm")!
    const result = simulate([{ ...farm, construction: { useIdleWorker: true, outwardDuration: 0 } }, moveToGold(26)], settings)

    expect(result.plan[1]).toMatchObject({ blocked: true, blockedReason: "Only 0 source workers available for 1 requested." })
    expect(workerAllocationAt(settings, result.orderedPlan, 26)).toMatchObject({ gold: 0, wood: 0, idle: 1 })
})

test("same-time opposite moves follow Build order and never move a worker twice", () => {
    const settings = { ...economy, goldWorkers: 1, woodWorkers: 1, woodTravelTime: 16, maxWoodTravelTime: 16 }
    const limit = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 0, limit: 1 })
    const away = move(11)
    const toward = moveToGold(11)
    const result = simulate([limit, away, toward], settings)
    const reversed = simulate([limit, toward, away], settings)

    expect(result.plan.slice(1).map(action => action.manualMove)).toEqual([{ completed: 1, endTime: 11 }, { completed: 1, endTime: 11 }])
    expect(result.deliveries.find(delivery => delivery.worker === 1 && delivery.gold > 0)).toMatchObject({ time: 23 })
    expect(reversed.plan[1]).toMatchObject({ blocked: true, manualMove: { completed: 0, endTime: 11 } })
    expect(workerAllocationAt(settings, reversed.orderedPlan, 11)).toMatchObject({ gold: 0, wood: 2 })

    const onlyMiner = simulate([limit, away, toward], { ...settings, workerCount: 1, woodWorkers: 0 })
    expect(onlyMiner.plan[2]).toMatchObject({ blocked: true, blockedReason: "Only 0 source workers available for 1 requested." })
})

test("a same-time manual move to gold takes the slot before automatic reassignment", () => {
    const settings = { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 8 }
    const limit = (commandTime: number, limit: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit })
    const result = simulate([limit(0, 0), moveToGold(2), limit(2, 1)], settings)

    expect(result.plan[1].manualMove).toEqual({ completed: 1, endTime: 2 })
    expect(workerAllocationAt(settings, result.orderedPlan, 2)).toMatchObject({ gold: 1, wood: 0 })
})

test("editing a later limit recalculates a pending move to gold and its deliveries", () => {
    const settings = { ...economy, workerCount: 5, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 0, woodGatherTime: 60 }
    const buildings = ["farm", "barracks", "sawmill", "tower-of-mana"].map(id => ({
        ...factions.light.items.find(item => item.id === id)!,
        construction: { useIdleWorker: true, outwardDuration: 0 },
    }))
    const swordsman = factions.light.items.find(item => item.id === "swordsman")!
    const closeGold = (commandTime: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit: 0, reassign: false })
    const prefix = [...buildings, swordsman, moveToGold(1)]
    const previous = simulate([...prefix, closeGold(50)], settings)
    const edited = [...prefix, closeGold(80)]
    const result = simulate(edited, settings, "light", previous)

    expect(previous.plan[5].manualMove).toMatchObject({ completed: 0, endTime: 60.5, reason: expect.stringContaining("gold limit is full") })
    expect(result).toEqual(simulate(edited, settings))
    expect(result.plan[5].manualMove).toEqual({ completed: 1, endTime: 60.5 })
    expect(workerAllocationAt(settings, result.orderedPlan, 61)).toMatchObject({ gold: 1, wood: 0 })
    expect(result.deliveries.find(delivery => delivery.gold > 0)).toMatchObject({ worker: 0, time: 71.5 })
})

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
