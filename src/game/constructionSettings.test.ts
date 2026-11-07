import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createWorkerEvent } from "./workerEvents"
import { createScrollAction } from "./scrolls"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { workerAllocationAt } from "./resourceSimulation"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
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

test.each(["light", "dark"] as const)("%s upgrade travel settings apply only to the requested occurrence and survive sharing", faction => {
    const upgrade = { ...factions[faction].items.find(item => item.id === (faction === "light" ? "castle-lvl-2" : "citadel-lvl-2"))!,
        construction: { outwardDuration: 3, returnDuration: 0 } }
    const order = buildOrderWithDependencies(factions[faction], [], upgrade)
    const plan = simulateBuildOrder(order, economy, 10, 200, 20, factions[faction].startingTownHall).plan
    const action = plan[plan.length - 1]
    expect(action.startTime! - action.commandTime!).toBe(3)
    expect(action.workerReturnTime).toBe(action.finishTime)
    const link = createShareableLink("https://example.com", faction, initialGameProfile, plan)
    const items = parseShareableLink(new URL(link).hash)!.buildOrder
    expect(items[items.length - 1].construction).toEqual({ outwardDuration: 3, returnDuration: 0 })
    expect(items.slice(0, -1).every(item => !item.construction)).toBe(true)
})

test("a shorter return override cannot erase remaining reactivation travel", () => {
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 0, count: 1 })
    const active = createWorkerEvent({ type: "make-active", commandTime: 0, count: 1, travelDuration: 10 })
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
    const idle = (commandTime: number) => createWorkerEvent({ type: "make-idle", commandTime, count: 1 })
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
