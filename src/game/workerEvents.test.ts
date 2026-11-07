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

const settings = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 1, goldWorkers: 0, woodWorkers: 1, orderDelay: 1, constructionStartDelay: 4 }
const idle = (time: number, count = 1) => createWorkerEvent({ type: "make-idle", commandTime: time, count }, "light")
const active = (time: number, travelDuration = 0) => createWorkerEvent({ type: "make-active", commandTime: time, count: 1, travelDuration }, "light")

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
