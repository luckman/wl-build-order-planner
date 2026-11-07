import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createWorkerEvent } from "./workerEvents"
import { workerAllocationAt } from "./resourceSimulation"
import { createScrollAction } from "./scrolls"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createResourcesCollectedAction } from "./resourcesCollected"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodTravelTime: 4, woodGatherTime: 12, woodTravelTimeIncreaseBase: 0 }
const run = (items: PlannerItem[], settings = economy, faction: "light" | "dark" = "light") =>
    simulateBuildOrder(items, settings, 2, 200, 20, factions[faction].startingTownHall, 200)

test.each(["light", "dark"] as const)("%s full preparation fits after zero and reserves the worker before purchase", faction => {
    const farm = { ...factions[faction].items.find(item => item.id === (faction === "light" ? "farm" : "pigsty"))!, construction: { preparationDuration: 10 } }
    const result = run([farm], economy, faction)
    expect(result.plan[0]).toMatchObject({ departureTime: 0, commandTime: 10, startTime: 13, finishTime: 38, workerReturnTime: 41 })
    expect(result.deliveries.some(delivery => delivery.worker >= 0 && delivery.time < 41)).toBe(false)
})

test("resource-driven command shifts replay departure and retain the delivery that funds construction", () => {
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 10 } }
    const settings = { ...economy, startingWood: 150, woodPerTrip: 50 }
    const result = run([farm], settings)
    // The worker must deliver at 20 before departing, then prepare for ten seconds.
    expect(result.plan[0]).toMatchObject({ departureTime: 20, commandTime: 30 })
    expect(result.deliveries[0]).toMatchObject({ time: 20, wood: 50 })
    expect(workerAllocationAt(settings, result.plan, 25)).toMatchObject({ wood: 0, buildingOrTravelling: 1 })
})

test("a later row can depart before an earlier command without taking the same worker", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 20 } }
    const result = run([barracks, farm], { ...economy, workerCount: 2, woodWorkers: 2 })
    expect(result.plan[0]).toMatchObject({ commandTime: 1, workerId: 1 })
    expect(result.plan[1]).toMatchObject({ commandTime: 20, departureTime: 0, workerId: 0 })
})

test("prepared commands can share a command time with zero order delay", () => {
    const barracks = { ...factions.light.items.find(item => item.id === "barracks")!, construction: { preparationDuration: 10 } }
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 8 } }
    const { plan } = run([barracks, farm], { ...economy, workerCount: 2, woodWorkers: 2, orderDelay: 0 })
    expect(plan[0]).toMatchObject({ blocked: false, commandTime: 10, departureTime: 0, workerId: 0 })
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 10, departureTime: 2, workerId: 1 })
})

test("the earliest prepared command after a fractional order delay preserves the funding delivery", () => {
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 20 } }
    const sawmill = { ...factions.light.items.find(item => item.id === "sawmill")!, construction: { preparationDuration: 0.75 } }
    const settings = { ...economy, workerCount: 2, woodWorkers: 2, orderDelay: 0.5, startingWood: 150, woodPerTrip: 150 }
    const { plan, deliveries } = run([farm, sawmill], settings)
    expect(deliveries[0]).toMatchObject({ time: 20.5, wood: 150, worker: 1 })
    expect(plan[0]).toMatchObject({ blocked: false, commandTime: 21, departureTime: 1, workerId: 0 })
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 21.5, departureTime: 20.75, workerId: 1 })
})

test("a lone builder completes its earlier job before starting a later preparation", () => {
    const farm = factions.light.items.find(item => item.id === "farm")!
    const barracks = { ...factions.light.items.find(item => item.id === "barracks")!, construction: { preparationDuration: 20 } }
    const result = run([farm, barracks])
    expect(result.plan[0]).toMatchObject({ commandTime: 1, finishTime: 29 })
    expect(result.plan[1]).toMatchObject({ departureTime: 29, commandTime: 49 })
})

test("idle preparation requires an idle worker at departure and ignores future idle events", () => {
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 10, useIdleWorker: true } }
    const idle = (time: number) => createWorkerEvent({ type: "make-idle", commandTime: time, count: 1 }, "light")
    expect(run([idle(0), farm]).plan[1]).toMatchObject({ blocked: false, departureTime: 0, commandTime: 10 })
    const rejected = run([idle(5), farm])
    expect(rejected.plan[1].blocked).toBe(true)
    expect(rejected.plan[1].blockedReason).toContain("idle worker at preparation departure")
    expect(rejected.deliveries).toEqual(run([idle(5)]).deliveries)
})

test("preparation captures the reactivation remainder at departure rather than purchase", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 0, count: 1 }, "light")
    const active = createWorkerEvent({ type: "make-active", commandTime: 0, count: 1, travelDuration: 10 }, "light")
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 10, outwardDuration: 0, returnDuration: 4 } }
    const result = run([idle, active, farm], { ...economy, orderDelay: 13 })
    expect(result.plan[2]).toMatchObject({ departureTime: 3, commandTime: 13, finishTime: 38, workerReturnTime: 45 })
})

test("Whip speeds outward travel but leaves the preparation offset exact", () => {
    const cast = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 1 }, "dark")
    const farm = { ...factions.dark.items.find(item => item.id === "pigsty")!, construction: { preparationDuration: 10, outwardDuration: 10 } }
    const result = run([farm, cast], { ...economy, startingMana: 500, baseManaLimit: 500 }, "dark")
    expect(result.plan[0]).toMatchObject({ departureTime: 0, commandTime: 10 })
    expect(result.plan[0].startTime! - result.plan[0].commandTime!).toBeCloseTo(10 / 1.15)
})

test.each(["light", "dark"] as const)("%s upgrade preparation can precede purchase prerequisites and survives file round-trip", faction => {
    const upgrade = { ...factions[faction].items.find(item => item.id === (faction === "light" ? "castle-lvl-2" : "citadel-lvl-2"))!, construction: { preparationDuration: 40 } }
    const order = buildOrderWithDependencies(factions[faction], [], upgrade)
    const settings = { ...economy, workerCount: 5, woodWorkers: 5 }
    const result = run(order, settings, faction)
    const action = result.plan[result.plan.length - 1]
    expect(action.blocked).toBe(false)
    expect(action.commandTime! - action.departureTime!).toBe(40)
    const prerequisites = result.plan.slice(0, -1)
    expect(prerequisites.some(prerequisite => prerequisite.finishTime! > action.departureTime!)).toBe(true)
    expect(prerequisites.every(prerequisite => prerequisite.finishTime! + settings.orderDelay <= action.commandTime!)).toBe(true)
    const restored = parseBuildOrder(serializeBuildOrder(faction, initialGameProfile, result.plan)).buildOrder
    expect(run(restored, settings, faction).plan.map(action => action.commandTime)).toEqual(result.plan.map(action => action.commandTime))
})

test("a rejected preparation leaves neither a reservation nor lost income and does not block a later valid order", () => {
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { preparationDuration: 1799 } }
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const rejected = run([farm, barracks])
    const baseline = run([barracks])
    expect(rejected.plan[0].blocked).toBe(true)
    expect(rejected.plan[1].commandTime).toBe(baseline.plan[0].commandTime)
    expect(rejected.deliveries).toEqual(baseline.deliveries)
})

test("a long later preparation cannot starve an earlier valid command", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const result = run([barracks, { ...barracks, construction: { preparationDuration: 50 } }])
    expect(result.plan[0]).toMatchObject({ blocked: false, commandTime: 1, finishTime: 34 })
    expect(result.plan[1]).toMatchObject({ blocked: false, departureTime: 34, commandTime: 84 })
})

test("rolling back an impossible idle reservation rechecks later idle departures", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 0, count: 1 }, "light")
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const result = run([idle,
        { ...barracks, construction: { preparationDuration: 1799, useIdleWorker: true } },
        { ...barracks, construction: { preparationDuration: 10, useIdleWorker: true } }])
    expect(result.plan[1].blocked).toBe(true)
    expect(result.plan[2]).toMatchObject({ blocked: false, departureTime: 0, commandTime: 10 })
})

test("multiple later preparations cannot invalidate an earlier prepared command", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const farm = factions.light.items.find(item => item.id === "farm")!
    const result = simulateBuildOrder([
        { ...barracks, construction: { preparationDuration: 1 } },
        { ...barracks, construction: { preparationDuration: 100 } },
        { ...farm, construction: { preparationDuration: 50 } },
    ], economy, 2, 200, 20, "Castle", 500)
    expect(result.plan.map(action => action.commandTime)).toEqual([1, 134, 217])
    expect(result.plan.map(action => action.departureTime)).toEqual([0, 34, 167])
})

test("fixed-time worker eligibility is independent of the event's source row position", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 5, count: 1 }, "light")
    const barracks = { ...factions.light.items.find(item => item.id === "barracks")!, construction: { preparationDuration: 10 } }
    const before = run([idle, barracks])
    const after = run([barracks, idle])
    expect(before.plan[0]).toMatchObject({ blocked: true, commandTime: 5 })
    expect(before.plan[1]).toMatchObject({ blocked: false, departureTime: 0, commandTime: 10 })
    expect(after.plan[0]).toEqual(before.plan[1])
    expect(after.plan[1]).toEqual(before.plan[0])
})

test("a prepared build waits for late resources and resolves a worker event after the final command", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const farm = factions.light.items.find(item => item.id === "farm")!
    const funds = createResourcesCollectedAction({ type: "resources-collected", commandTime: 1400, gold: 0, wood: farm.wood })
    const active = createWorkerEvent({ type: "make-active", commandTime: 1700, count: 1 }, "light")
    const { plan, orderedPlan } = simulateBuildOrder([
        { ...barracks, construction: { preparationDuration: 10 } }, farm, funds, active,
    ], { ...economy, startingWood: barracks.wood, woodPerTrip: 0 }, 2, 200, 20, "Castle")

    expect(plan[0]).toMatchObject({ blocked: false, departureTime: 0, commandTime: 10 })
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 1401 })
    expect(plan[3]).toMatchObject({ blocked: true, commandTime: 1700, blockedReason: "Make Worker active: not enough eligible workers for count 1." })
    expect(orderedPlan).toEqual([plan[0], plan[2], plan[1], plan[3]])
})

test.each([[1, 35, 168], [20, 54, 187]])("the earliest later departure moves when preparations are [0,%s,100]", (middle, secondCommand, thirdCommand) => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const farm = factions.light.items.find(item => item.id === "farm")!
    const result = simulateBuildOrder([barracks,
        { ...barracks, construction: { preparationDuration: middle } },
        { ...farm, construction: { preparationDuration: 100 } },
    ], economy, 2, 200, 20, "Castle", 600)
    expect(result.plan.map(action => action.commandTime)).toEqual([1, secondCommand, thirdCommand])
    expect(result.plan.every(action => !action.blocked)).toBe(true)
})
