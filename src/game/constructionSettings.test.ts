import { createUnitKilledAction } from "./unitsKilled"
import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createWorkerEvent } from "./workerEvents"
import { createScrollAction } from "./scrolls"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { workerAllocationAt } from "./resourceSimulation"
import { createResourcesCollectedAction } from "./resourcesCollected"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }

test.each([[0, 43.5], [50, 57.75], [100, 72]] as const)(
    "%i%% changes only worker-adjusted construction, then delays builder return and recruitment",
    (timeModifier, finishTime) => {
        const { items, startingTownHall } = factions.light
        const barracks: PlannerItem = { ...items.find(item => item.id === "barracks")!,
            construction: { timeModifier, preparationDuration: 10, outwardDuration: 5, returnDuration: 7 } }
        const swordsman = items.find(item => item.id === "swordsman")!
        const settings = { ...economy, workerLevel: 24, orderDelay: 1 }
        const { plan } = simulateBuildOrder([barracks, swordsman], settings, 10, 200, 20, startingTownHall)
        expect(plan[0]).toMatchObject({ departureTime: 0, commandTime: 10, startTime: 15, finishTime, workerReturnTime: finishTime + 7 })
        expect(plan[1].startTime).toBe(finishTime + 1)
        expect(workerAllocationAt(settings, plan, finishTime + 6).buildingOrTravelling).toBe(1)
        expect(workerAllocationAt(settings, plan, finishTime + 7).buildingOrTravelling).toBe(0)
    },
)
test.each(["light", "dark"] as const)("%s construction travel overrides are per occurrence and preserve explicit zero", faction => {
    const farm = factions[faction].items.find(item => item.id === "barracks")!
    const custom = { ...farm, construction: { outwardDuration: 0, returnDuration: 7 } }
    const run = (items: PlannerItem[], delay: number) => simulateBuildOrder(items, { ...economy, constructionStartDelay: delay }, 10, 200, 20, factions[faction].startingTownHall).plan
    const plan = run([custom, farm], 3)
    expect(plan[0].startTime).toBe(plan[0].commandTime)
    expect(plan[0].workerReturnTime! - plan[0].finishTime!).toBe(7)
    expect(plan[1].startTime! - plan[1].commandTime!).toBe(3)
    const items = parseBuildOrder(serializeBuildOrder(faction, initialGameProfile, plan)).buildOrder
    expect(items[0]).toMatchObject({ construction: { outwardDuration: 0, returnDuration: 7 } })
    expect(items[1].construction).toBeUndefined()
    expect(run(items, 5)[0].startTime).toBe(run(items, 5)[0].commandTime)
    expect(run(items, 5)[1].startTime! - run(items, 5)[1].commandTime!).toBe(5)
})

test.each(["light", "dark"] as const)("%s JSON and share links preserve modifiers and default older orders to normal", faction => {
    const { items, startingTownHall } = factions[faction]
    const building = items.find(item => item.id === (faction === "light" ? "farm" : "pigsty"))!
    const custom: PlannerItem = { ...building, construction: { timeModifier: 50 } }
    const run = (orders: PlannerItem[]) => simulateBuildOrder(orders, economy, 10, 200, 20, startingTownHall).plan
    const barracks = items.find(item => item.id === "barracks")!
    const plan = run([custom, barracks])
    const json = serializeBuildOrder(faction, initialGameProfile, plan)
    const link = createShareableLink("https://example.com", faction, initialGameProfile, plan)
    for (const result of [parseBuildOrder(json), parseShareableLink(new URL(link).hash)!]) {
        expect(result.buildOrder.map(item => item.construction?.timeModifier)).toEqual([50, undefined])
        expect(run(result.buildOrder).map(action => action.finishTime! - action.startTime!)).toEqual([37.5, 30])
    }
})

test.each(["light", "dark"] as const)("%s upgrade travel settings apply only to the requested occurrence and survive sharing", faction => {
    const upgrade = { ...factions[faction].items.find(item => item.id === (faction === "light" ? "castle-lvl-2" : "citadel-lvl-2"))!,
        construction: { outwardDuration: 3, returnDuration: 0 } }
    const order = buildOrderWithDependencies(factions[faction], [], upgrade)
    const plan = simulateBuildOrder(order, economy, 10, 200, 20, factions[faction].startingTownHall).plan
    const action = plan[plan.length - 1]
    expect(action.startTime! - action.commandTime!).toBe(3)
    // The upgrade reuses a builder with two seconds of unfinished return.
    expect(action.workerReturnTime! - action.finishTime!).toBe(2)
    const link = createShareableLink("https://example.com", faction, initialGameProfile, plan)
    const items = parseShareableLink(new URL(link).hash)!.buildOrder
    expect(items[items.length - 1].construction).toEqual({ outwardDuration: 3, returnDuration: 0 })
    expect(items.slice(0, -1).every(item => !item.construction)).toBe(true)
})

test("a shorter return override cannot erase remaining reactivation travel", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 0, count: 1 }, "light")
    const active = createWorkerEvent({ type: "make-active", commandTime: 0, count: 1, travelDuration: 10 }, "light")
    const farm = { ...factions.light.items.find(item => item.id === "farm")!, construction: { returnDuration: 4 } }
    const plan = simulateBuildOrder([idle, active, farm], { ...economy, workerCount: 1, goldWorkers: 0, woodWorkers: 1, orderDelay: 3 }, 2, 200, 20, "Castle").plan
    expect(plan[2].commandTime).toBe(3)
    expect(plan[2].workerReturnTime! - plan[2].finishTime!).toBe(7)
})

test("Whip applies to overridden outward travel and construction clears its old return effect", () => {
    const cast = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 1 }, "dark")
    const farm = { ...factions.dark.items.find(item => item.id === "pigsty")!, construction: { outwardDuration: 10, returnDuration: 7 } }
    const plan = simulateBuildOrder([farm, cast], { ...economy, startingMana: 500, baseManaLimit: 500, workerCount: 1, goldWorkers: 0, woodWorkers: 1 }, 2, 200, 20, "Citadel").plan
    expect(plan[0].startTime! - plan[0].commandTime!).toBeCloseTo(10 / 1.15)
    expect(plan[0].workerReturnTime! - plan[0].finishTime!).toBe(7)
})

test.each(["light", "dark"] as const)("%s explicitly uses an idle builder, returns it idle at completion, and never waits for future idle events", faction => {
    const farm = { ...factions[faction].items.find(item => item.id === (faction === "light" ? "farm" : "pigsty"))!, construction: { useIdleWorker: true, returnDuration: 40 } }
    const idle = (commandTime: number) => createWorkerEvent({ type: "make-idle", commandTime, count: 1 }, faction)
    const run = (items: PlannerItem[]) => simulateBuildOrder(items, economy, 10, 200, 20, factions[faction].startingTownHall)
    const plan = run([idle(1), farm]).plan
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 1 })
    expect(plan[1].workerReturnTime).toBe(plan[1].finishTime)
    expect(workerAllocationAt(economy, plan, plan[1].finishTime!)).toMatchObject({ idle: 1, buildingOrTravelling: 0 })
    const rejected = run([farm, idle(20)])
    expect(rejected.plan[0].blocked).toBe(true)
    expect(rejected.plan[0].blockedReason).toContain("idle worker")
    expect(rejected.deliveries).toEqual(run([idle(20)]).deliveries)
})

test.each(["light", "dark"] as const)("%s chaining retains seven of twelve return seconds after five seconds of progress", faction => {
    const barracks = factions[faction].items.find(item => item.id === "barracks")!
    const farm = factions[faction].items.find(item => item.id === (faction === "light" ? "farm" : "pigsty"))!
    const first = { ...barracks, construction: { outwardDuration: 0, returnDuration: 12 } }
    const second = { ...barracks, construction: { outwardDuration: 0, returnDuration: 3 } }
    const third = { ...farm, construction: { outwardDuration: 0, returnDuration: 0 } }
    const economySettings = { ...economy, startingGold: barracks.gold, startingWood: barracks.wood,
        workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodPerTrip: 50 }
    const funds = createResourcesCollectedAction({ type: "resources-collected", commandTime: 35, gold: 10000, wood: 10000 })
    const result = simulateBuildOrder([first, second, third, funds], economySettings, 2, 200, 20, factions[faction].startingTownHall)
    expect(result.plan[0]).toMatchObject({ finishTime: 31, workerReturnEndTime: 36 })
    expect(result.plan[1]).toMatchObject({ commandTime: 36, finishTime: 66, workerReturnTime: 73, workerReturnEndTime: 66 })
    expect(result.plan[2]).toMatchObject({ commandTime: 66, finishTime: 91, workerReturnTime: 98 })
    expect(result.deliveries.some(delivery => delivery.worker >= 0 && delivery.time > 1 && delivery.time < 98 && delivery.wood > 0)).toBe(false)
})

test("Whip progress survives chained returns, while Make idle and casualties still exclude returning builders", () => {
    const barracks = factions.dark.items.find(item => item.id === "barracks")!
    const settings = { ...economy, startingGold: barracks.gold, startingWood: barracks.wood,
        workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodPerTrip: 50, startingMana: 500, baseManaLimit: 500 }
    const first = { ...barracks, construction: { outwardDuration: 0, returnDuration: 12 } }
    const funds = createResourcesCollectedAction({ type: "resources-collected", commandTime: 35, gold: 10000, wood: 10000 })
    const cast = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 31 }, "dark")
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 36, count: 1 }, "dark")
    const loss = createUnitKilledAction({ type: "unit-is-killed", unitId: "slave", commandTime: 36 }, "dark")
    const run = (returnDuration: number) => simulateBuildOrder([first, { ...barracks, construction: { outwardDuration: 0, returnDuration } }, funds, cast, idle, loss], settings, 2, 200, 20, "Citadel").plan
    const plan = run(0)
    expect(plan[1].commandTime).toBe(36)
    expect(plan[1].workerReturnTime! - plan[1].finishTime!).toBeCloseTo(6.4)
    expect(plan[4].blocked).toBe(true)
    expect(plan[5]).toMatchObject({ blocked: true, foodReleased: 0 })
    const longer = run(20)
    expect(longer[1].workerReturnTime! - longer[1].finishTime!).toBe(20)
})
