import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createWorkerEvent } from "./workerEvents"
import { workerAllocationAt } from "./resourceSimulation"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { createScrollAction } from "./scrolls"
import { buildOrderWithDependencies } from "./gameData"
import { createUnitKilledAction } from "./unitsKilled"
import { createGoldMinerLimit } from "./goldMinerLimit"
import { createResourcesCollectedAction } from "./resourcesCollected"

const settings = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 1, goldWorkers: 0, woodWorkers: 1, orderDelay: 1, constructionStartDelay: 4 }
const idle = (time: number, count = 1) => createWorkerEvent({ type: "make-idle", commandTime: time, count }, "light")
const active = (time: number, travelDuration = 0) => createWorkerEvent({ type: "make-active", commandTime: time, count: 1, travelDuration }, "light")

test.each(["light", "dark"] as const)("%s recruits use the current gold limit, including a limit at their finish time", factionId => {
    const faction = factions[factionId]
    const worker = faction.items.find(item => item.id === (factionId === "light" ? "worker" : "slave"))!
    const args = [settings, 2, 200, settings.foodPerFarm, faction.startingTownHall] as const
    const limit = (commandTime: number, limit: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime, limit, reassign: false })
    const recruits = Array.from({ length: 10 }, (_, index) => ({ ...worker, orderId: `worker-${index}` }))
    const baseline = simulateBuildOrder(recruits, ...args)
    const first = baseline.plan[0].finishTime!
    const second = baseline.plan[1].finishTime!
    const fifth = baseline.plan[4].finishTime!
    const allocation = (result: typeof baseline, time: number) => workerAllocationAt(settings, result.orderedPlan, time)
    expect(allocation(baseline, baseline.plan[9].finishTime!)).toMatchObject({ gold: 4, wood: 7 })
    const order = [...recruits, limit(second, 0), limit(fifth, 5)]
    const result = simulateBuildOrder(order, ...args)
    expect(allocation(result, first)).toMatchObject({ gold: 1, wood: 1 })
    expect(allocation(result, second)).toMatchObject({ gold: 1, wood: 2 })
    expect(allocation(result, result.plan[9].finishTime!)).toMatchObject({ gold: 5, wood: 6 })
    expect(result.deliveries.some(delivery => delivery.worker === 2 && delivery.wood > 0)).toBe(true)
    expect(result.deliveries.some(delivery => delivery.worker === 2 && delivery.gold > 0)).toBe(false)
    const edited = [...recruits, limit(second, 0), limit(fifth, 0)]
    expect(simulateBuildOrder(edited, ...args, { previous: result })).toEqual(simulateBuildOrder(edited, ...args))
})

test("a gold limit at an authored fractional recruit finish time takes effect before the recruit", () => {
    const economy = { ...settings, startingGold: 0, orderDelay: 0.2 }
    const worker = factions.light.items.find(item => item.id === "worker")!
    const resources = createResourcesCollectedAction({ type: "resources-collected", commandTime: 8.1, gold: 150, wood: 0 })
    const limit = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 26.12, limit: 0 })
    const result = simulateBuildOrder([worker, resources, limit], economy, 2, 200, economy.foodPerFarm, "Castle")
    expect(result.plan[0].finishTime).toBeCloseTo(26.12)
    expect(workerAllocationAt(economy, result.plan, 26.12)).toMatchObject({ gold: 0, wood: 2 })
    expect(result.deliveries.some(delivery => delivery.worker === 1 && delivery.wood > 0)).toBe(true)
    expect(result.deliveries.some(delivery => delivery.worker === 1 && delivery.gold > 0)).toBe(false)
})

test("excess miners deliver before switching, including miners still outbound or queued", () => {
    const economy = { ...settings, workerCount: 3, goldWorkers: 3, woodWorkers: 0,
        goldTravelTime: 2, goldGatherTime: 3, initialGoldTravelReduction: 0,
        woodTravelTime: 3, woodGatherTime: 5, woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 9 }
    const event = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 1, limit: 1, reassign: false })
    const result = simulateBuildOrder([event], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    const allocation = (time: number) => workerAllocationAt(economy, result.plan, time)
    expect(allocation(6)).toMatchObject({ gold: 3, wood: 0 })
    expect(allocation(7)).toMatchObject({ gold: 2, wood: 1 })
    expect(allocation(10)).toMatchObject({ gold: 1, wood: 2 })
    expect(result.deliveries.slice(0, 3)).toEqual([7, 10, 13].map((time, worker) => ({ time, worker, gold: economy.goldPerTrip, wood: 0 })))
    for (const [worker, time] of [[0, 18], [1, 21]]) {
        expect(result.deliveries.find(delivery => delivery.worker === worker && delivery.wood > 0)?.time).toBe(time)
        expect(result.deliveries.filter(delivery => delivery.worker === worker && delivery.gold > 0)).toHaveLength(1)
    }
    expect(result.deliveries.filter(delivery => delivery.worker === 2 && delivery.gold > 0).length).toBeGreaterThan(1)
})

test("an explicit limit reconciles the opening assignment even when the profile limit was the same", () => {
    const economy = { ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0,
        goldTravelTime: 2, goldGatherTime: 3, initialGoldTravelReduction: 0 }
    const event = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 0, limit: 3 })
    const result = simulateBuildOrder([event], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    expect(workerAllocationAt(economy, result.plan, 0)).toMatchObject({ gold: 4, wood: 0 })
    expect(workerAllocationAt(economy, result.plan, 10)).toMatchObject({ gold: 3, wood: 1 })
})

test("a replacement limit takes effect before deciding whether a miner who deposits at that time must switch", () => {
    const economy = { ...settings, workerCount: 3, goldWorkers: 3, woodWorkers: 0,
        goldTravelTime: 2.5, goldGatherTime: 3.11, initialGoldTravelReduction: 0, orderDelay: 1 }
    const limit = (time: number, count: number) => createGoldMinerLimit({ type: "limit-gold-miners", commandTime: time, limit: count, reassign: false })
    const result = simulateBuildOrder([limit(1, 1), limit(11.22, 3)], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    expect(result.deliveries.find(({ worker, gold }) => worker === 1 && gold > 0)?.time).toBeCloseTo(11.22)
    expect(workerAllocationAt(economy, result.plan, 11.22)).toMatchObject({ gold: 2, wood: 1 })
    expect(result.deliveries.some(({ worker, wood }) => worker === 1 && wood > 0)).toBe(false)
})

test("a resource-only command leaves both projections on the same side of a fractional deposit", () => {
    const economy = { ...settings, workerCount: 1, goldWorkers: 1, woodWorkers: 0,
        goldTravelTime: 0.07, goldGatherTime: 0.99, initialGoldTravelReduction: 0 }
    const event = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 0.5, limit: 0 })
    const resources = createResourcesCollectedAction({ type: "resources-collected", commandTime: 1.13, gold: 150, wood: 0 })
    const result = simulateBuildOrder([event, resources], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    const deposit = result.deliveries.find(({ worker, gold }) => worker === 0 && gold > 0)!
    expect(deposit.time).toBeGreaterThan(1.13)
    expect(workerAllocationAt(economy, result.plan, 1.13)).toMatchObject({ gold: 1, wood: 0 })
    expect(workerAllocationAt(economy, result.plan, deposit.time)).toMatchObject({ gold: 0, wood: 1 })
})

test.each([[6, 22, 29], [7, 16, 23]])("a miner starting for the forest uses the right route when the Sawmill finishes at %ss", (seconds, firstWood, secondWood) => {
    const economy = { ...settings, workerCount: 2, goldWorkers: 1, woodWorkers: 1, constructionStartDelay: 0,
        goldTravelTime: 2, goldGatherTime: 3, initialGoldTravelReduction: 0, woodTravelTime: 3,
        sawmillWoodTravelTime: 1, woodGatherTime: 5, woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 9 }
    const sawmill = { ...factions.light.items.find(item => item.id === "sawmill")!, seconds }
    const event = createGoldMinerLimit({ type: "limit-gold-miners", commandTime: 1, limit: 0 })
    const result = simulateBuildOrder([sawmill, event], economy, 4, 200, economy.foodPerFarm, "Castle", 40)
    expect(result.plan[0].finishTime).toBe(seconds + 1)
    expect(result.deliveries.filter(({ worker, wood }) => worker === 0 && wood > 0).slice(0, 2).map(({ time }) => time)).toEqual([firstWood, secondWood])
})

test.each(["light", "dark"] as const)("%s worker batches are atomic, fixed-time and exclude idle workers from construction", faction => {
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, settings, 2, 200, settings.foodPerFarm, factions[faction].startingTownHall, 120)
    const farm = factions[faction].items.find(item => item.id === (faction === "light" ? "farm" : "pigsty"))!
    const result = run([idle(0, 2), idle(1), active(10), farm])
    expect(result.plan[0]).toMatchObject({ blocked: true, commandTime: 0 })
    expect(result.plan[1].blocked).toBe(false)
    expect(result.plan[2].blocked).toBe(false)
    expect(result.plan[3].commandTime).toBe(10)
    expect(workerAllocationAt(settings, result.plan, 5)).toMatchObject({ total: 1, idle: 1, wood: 0 })
    expect(run([idle(0), idle(1)]).plan[1]).toMatchObject({ blocked: true, commandTime: 1 })
})

test("reactivation travel is paid once, preserves wood progress, and construction retains its remainder", () => {
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, settings, 2, 200, settings.foodPerFarm, "Castle", 120)
    const farm = factions.light.items.find(item => item.id === "farm")!
    const plain = run([idle(3), active(10, 10)])
    expect(plain.deliveries.filter(d => d.time > 3).every(d => d.time >= 20)).toBe(true)
    const result = run([idle(0), active(0, 10), { ...farm }])
    expect(result.plan[2].commandTime).toBe(1)
    expect(result.plan[2].workerReturnTime! - result.plan[2].finishTime!).toBe(9)
})

test("worker events round-trip through files and sharing", () => {
    const plan = simulateBuildOrder([idle(1), active(20, 7)], settings, 2, 200, settings.foodPerFarm, "Castle", 120).plan
    const parsed = parseBuildOrder(serializeBuildOrder("light", initialGameProfile, plan))
    expect(parsed.buildOrder).toEqual(plan.map(a => a.item))
    const link = createShareableLink("https://example.com", "light", initialGameProfile, plan)
    expect(parseShareableLink(new URL(link).hash)!.buildOrder).toEqual(parsed.buildOrder)
})

test("reactivation resumes retained wood without an extra journey and Whip preserves movement progress", () => {
    const economy = { ...settings, woodTravelTime: 4, woodGatherTime: 12, woodPerTrip: 50,
        woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 5, startingMana: 500, baseManaLimit: 500 }
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, economy, 2, 200, economy.foodPerFarm, "Citadel", 120)
    // Four seconds outward, two gathering, idle, ten reactivation, ten work, four return.
    expect(run([idle(6), active(10, 10)]).deliveries[0]).toMatchObject({ time: 34, wood: 50 })
    const cast = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 11 }, "dark")
    const result = run([idle(0), active(10, 10), cast])
    // The cast starts at 12, after two normal-speed seconds of the reactivation journey.
    expect(result.deliveries[0].time).toBeCloseTo(12 + 8 / 1.15 + 10 + 4 / 1.15)
})

test("delayed initial gatherers are counted once and can be made idle before activation", () => {
    const economy = { ...settings, workerCount: 5, woodWorkers: 5, orderDelay: 2 }
    const result = simulateBuildOrder([idle(0)], economy, 10, 200, economy.foodPerFarm, "Castle", 120)
    expect(workerAllocationAt(economy, result.plan, 0)).toMatchObject({ total: 5, idle: 1, wood: 0, buildingOrTravelling: 4 })
    expect(workerAllocationAt(economy, result.plan, 3)).toMatchObject({ total: 5, idle: 1, wood: 4, buildingOrTravelling: 0 })
})

test("a future hero death can release the level-one Altar tier for a different hero", () => {
    const economy = { ...settings, workerCount: 5, woodWorkers: 5 }
    const faction = factions.light
    const miriel = faction.items.find(item => item.id === "miriel")!
    const gilbert = faction.items.find(item => item.id === "gilbert")!
    const prefix = buildOrderWithDependencies(faction, buildOrderWithDependencies(faction, [], gilbert).filter(item => item !== gilbert), miriel)
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, economy, 10, 200, economy.foodPerFarm, "Castle", 500)
    const deathTime = run(prefix).plan.find(action => action.item === miriel)!.finishTime! + 10
    const killed = createUnitKilledAction({ type: "unit-is-killed", unitId: miriel.id, commandTime: deathTime }, "light")
    const result = run([...prefix, gilbert, killed])
    expect(result.plan.find(action => action.item === gilbert)).toMatchObject({ blocked: false, commandTime: deathTime })
})

test("idle selection excludes in-mine workers and gold reactivation discards interrupted cargo", () => {
    const economy = { ...settings, goldWorkers: 1, woodWorkers: 0, goldTravelTime: 4, goldGatherTime: 3, initialGoldTravelReduction: 0 }
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    expect(run([idle(5)]).plan[0]).toMatchObject({ blocked: true, commandTime: 5 })
    const result = run([idle(8), active(10)])
    expect(result.deliveries[0]).toMatchObject({ time: 17, gold: economy.goldPerTrip })
})

test("reactivation retains a completed wood load instead of gathering another", () => {
    const economy = { ...settings, woodTravelTime: 4, woodGatherTime: 12, woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 5 }
    const result = simulateBuildOrder([idle(17), active(30)], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    expect(result.deliveries[0]).toMatchObject({ time: 34, wood: economy.woodPerTrip })
})

test.each(["light", "dark"] as const)("%s worker losses strictly select their group in displayed event order", faction => {
    const unitId = faction === "light" ? "worker" : "slave"
    const loss = (workerGroup?: "gathering" | "idle") => createUnitKilledAction({ type: "unit-is-killed", commandTime: 5, unitId, workerGroup }, faction)
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, settings, 2, 200, settings.foodPerFarm, factions[faction].startingTownHall, 40)
    expect(run([idle(5), loss("idle")]).plan[1]).toMatchObject({ blocked: false, foodReleased: 2 })
    expect(run([loss("idle"), idle(5)]).plan[0]).toMatchObject({ blocked: true, foodReleased: 0 })
    expect(run([idle(5), loss()]).plan[1]).toMatchObject({ blocked: true, foodReleased: 0 })
    expect(run([idle(5), active(5), loss("gathering")]).plan[2].blocked).toBe(false)
    const plan = run([idle(5), loss("idle")]).plan
    expect(parseBuildOrder(serializeBuildOrder(faction, initialGameProfile, plan)).buildOrder[1]).toMatchObject({ workerGroup: "idle" })
})

test("reactivation cannot invent a resource assignment for an unallocated initial worker", () => {
    const economy = { ...settings, goldWorkers: 0, woodWorkers: 0 }
    const result = simulateBuildOrder([active(0)], economy, 2, 200, economy.foodPerFarm, "Castle", 40)
    expect(result.plan[0]).toMatchObject({ blocked: true, commandTime: 0 })
    expect(result.deliveries).toEqual([])
    expect(workerAllocationAt(economy, result.plan, 0)).toMatchObject({ idle: 1, total: 1, wood: 0, gold: 0 })
})
