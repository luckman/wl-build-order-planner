import { createUnitKilledAction, foodUsedAt } from "./unitsKilled"
import { simulateBuildOrder } from "./buildSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { buildOrderWithDependencies, factions, type FactionId, type PlannerItem } from "./gameData"
import { resourceAt, workerAllocationAt, WorkerEconomy } from "./resourceSimulation"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"

const settings = { ...economyFromProfile(initialGameProfile), startingGold: 100000, startingWood: 100000 }
const unitKilledEvent = (unitId: string, commandTime: number, faction: FactionId = "light") =>
    createUnitKilledAction({ type: "unit-is-killed", unitId, commandTime }, faction)
const simulate = (items: PlannerItem[], economy = settings, food = 200, townHall = "Castle") =>
    simulateBuildOrder(items, economy, economy.workerCount * 2, food, economy.foodPerFarm, townHall)

test.each(["light", "dark"] as const)("%s kills validate initial workers, release food instantly and cannot kill more than exist", faction => {
    const id = faction === "light" ? "worker" : "slave"
    const { plan } = simulate(Array.from({ length: 6 }, () => unitKilledEvent(id, 0, faction)), settings, 200, factions[faction].startingTownHall)
    expect(plan.map(action => action.blocked)).toEqual([false, false, false, false, false, true])
    expect(plan.map(action => action.workerId)).toEqual([4, 0, 1, 2, 3, null])
    expect(foodUsedAt(plan, 10, 0)).toBe(0)
    expect(workerAllocationAt(settings, plan, 0)).toEqual({ total: 0, gold: 0, wood: 0, busyOrIdle: 0 })
    expect(plan[0]).toMatchObject({ commandTime: 0, startTime: 0, finishTime: 0, foodReleased: 2, cost: { gold: 0, wood: 0 } })
})

test("only fully recruited units can be killed, regardless of kill source-row position", () => {
    const unit = factions.light.items.find(item => item.id === "swordsman")!
    const prefix = buildOrderWithDependencies(factions.light, [], unit)
    const finish = simulate(prefix).plan.find(action => action.item === unit)!.finishTime!
    const kills = [unitKilledEvent(unit.id, finish - 0.001), unitKilledEvent(unit.id, finish), unitKilledEvent(unit.id, finish)]
    const { plan } = simulate([...kills, ...prefix])
    expect(plan.slice(0, 3).map(action => action.blocked)).toEqual([true, false, true])
    expect(foodUsedAt(plan, 10, finish - 0.001)).toBe(13)
    expect(foodUsedAt(plan, 10, finish)).toBe(10)
})

test("a future kill releases food and unblocks recruitment at that exact timestamp", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const { plan } = simulate([worker, worker, unitKilledEvent("worker", 30)], settings, 12)
    expect(plan[0].commandTime).toBe(1)
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 30 })
    expect(plan[2]).toMatchObject({ blocked: false, foodReleased: 2 })
    expect(foodUsedAt(plan, 10, 29.999)).toBe(12)
    expect(foodUsedAt(plan, 10, 30)).toBe(12)
})

test("construction workers cannot be killed, including travel, and other wood gatherers precede miners", () => {
    const farm = factions.light.items.find(item => item.id === "farm")!
    const { plan } = simulate([farm, unitKilledEvent("worker", 2)])
    expect(plan[0].workerId).toBe(4)
    expect(plan[1].workerId).toBe(0)
    const onlyWorker = { ...settings, workerCount: 1, woodWorkers: 1, goldWorkers: 0 }
    const single = simulate([farm, unitKilledEvent("worker", 2)], onlyWorker).plan
    expect(single[1].blocked).toBe(true)
    expect(single[1].blockedReason).toContain("construction")
    const after = simulate([farm, unitKilledEvent("worker", Math.ceil(single[0].workerReturnTime!))], onlyWorker).plan
    expect(after[1].blocked).toBe(false)
})

test("killed workers stop income, do not return or resurrect, and preview allocation matches scheduling", () => {
    const kills = [unitKilledEvent("worker", 1), unitKilledEvent("worker", 8)]
    const { plan, deliveries } = simulate(kills)
    expect(deliveries.some(delivery => delivery.worker === 4 && delivery.time > 1)).toBe(false)
    expect(deliveries.some(delivery => delivery.worker === 0 && delivery.time > 8)).toBe(false)
    expect(workerAllocationAt(settings, plan, 0).total).toBe(5)
    expect(workerAllocationAt(settings, plan, 1)).toEqual({ total: 4, gold: 4, wood: 0, busyOrIdle: 0 })
    expect(workerAllocationAt(settings, plan, 600)).toEqual({ total: 3, gold: 3, wood: 0, busyOrIdle: 0 })
    const baseline = simulate([])
    expect(resourceAt(settings, deliveries, [], 120).gold).toBeLessThan(resourceAt(settings, baseline.deliveries, [], 120).gold)
})

test("losing a miner releases the mine slot and losing a delayed wood gatherer cannot revive it", () => {
    const economy = new WorkerEconomy({ ...settings, workerCount: 3, goldWorkers: 1, woodWorkers: 2, orderDelay: 10 })
    expect(economy.selectWorkerToKill()!.id).toBe(1)
    economy.killWorker(1)
    expect(economy.selectWorkerToKill()!.id).toBe(2)
    economy.killWorker(2)
    economy.advanceTo(4)
    expect(economy.workers[0].state).toBe("gathering")
    economy.killWorker(0)
    economy.advanceTo(100)
    expect(economy.workers.every(worker => worker.state === "killed")).toBe(true)
    expect(economy.deliveries).toEqual([])
})

test.each(["miriel", "gilbert"])("%s can be recruited, killed and recruited again with only a level-1 altar", heroId => {
    const faction = "light"
    const hero = factions[faction].items.find(item => item.id === heroId)!
    const prefix = buildOrderWithDependencies(factions[faction], [], hero)
    const townHall = factions[faction].startingTownHall
    const initial = simulate(prefix, settings, 200, townHall).plan
    const finish = initial.find(action => action.item === hero)!.finishTime!
    const kill = unitKilledEvent(hero.id, Math.ceil(finish) + 1, faction)
    const order = buildOrderWithDependencies(factions[faction], [...prefix, kill], hero)
    const { plan } = simulate(order, settings, 200, townHall)
    const recruitments = plan.filter(action => action.item.id === hero.id)
    expect(recruitments).toHaveLength(2)
    expect(recruitments.every(action => !action.blocked && action.finishTime !== null)).toBe(true)
    expect(recruitments[0].finishTime!).toBeLessThan(kill.commandTime)
    expect(order.filter(item => item.id === "altar-of-heroes")).toHaveLength(1)
    expect(order.some(item => item.kind === "upgrade" && item.buildingId === "altar-of-heroes")).toBe(false)
    expect(plan.find(action => action.item === kill)).toMatchObject({ blocked: false, foodReleased: hero.food })
    expect(plan[plan.length - 1].commandTime).toBe(kill.commandTime)
})

test.each(["light", "dark"] as const)("%s kills survive JSON and revalidate when recruitment is removed", faction => {
    const id = faction === "light" ? "worker" : "slave"
    const items = [unitKilledEvent(id, 1, faction)]
    const plan = simulate(items, settings, 200, factions[faction].startingTownHall).plan
    const json = serializeBuildOrder(faction, initialGameProfile, plan, true)
    expect(parseBuildOrder(json).buildOrder).toEqual(items)
    expect(JSON.parse(json).buildOrder[1]).toMatchObject({ type: "unit-is-killed", unitId: id, commandTime: 1 })
    const doc = JSON.parse(json)
    doc.buildOrder[1].unitId = faction === "light" ? "goon" : "swordsman"
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("Unknown unit ID")
    doc.buildOrder[1].unitId = "farm"
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("Unknown unit ID")
    doc.buildOrder[1].unitId = id
    doc.buildOrder[1].commandTime = -1
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("commandTime")
})


test("new workers keep distinct IDs after earlier kills and can be killed at completion", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const readyAt = simulate([worker]).plan[0].finishTime!
    const kills = Array.from({ length: 5 }, () => unitKilledEvent("worker", 0))
    const { plan } = simulate([worker, ...kills, unitKilledEvent("worker", readyAt)])
    expect(plan.every(action => !action.blocked)).toBe(true)
    expect(plan[plan.length - 1].workerId).toBe(5)
    expect(foodUsedAt(plan, 10, readyAt)).toBe(0)
    expect(workerAllocationAt(settings, plan, readyAt)).toEqual({ total: 0, gold: 0, wood: 0, busyOrIdle: 0 })
})
