import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createScrollAction } from "./scrolls"
import { createWorkerEvent } from "./workerEvents"

const economy = { ...economyFromProfile(initialGameProfile), workerCount: 3, goldWorkers: 1, woodWorkers: 2,
    goldGatherTime: 10, goldTravelTime: 0, orderDelay: 0, constructionStartDelay: 0,
    startingGold: 1000, startingWood: 1000 }
const simulate = (items: PlannerItem[], settings = economy, until?: number) =>
    simulateBuildOrder(items, settings, 6, 20, settings.foodPerFarm, "Castle", until)
const farm = factions.light.items.find(item => item.id === "farm")!

test("an empty build projects five minutes of deliveries including the boundary", () => {
    const { deliveries } = simulate([])

    expect(deliveries.filter(({ gold }) => gold > 0).map(({ time }) => time))
        .toEqual(Array.from({ length: 30 }, (_, index) => (index + 1) * 10))
    expect(deliveries.every(({ time }) => time <= 300)).toBe(true)
})

test("a long builder return keeps deliveries available through the timeline margin", () => {
    const { plan, deliveries } = simulate([{ ...farm, construction: { returnDuration: 345 } }])

    expect(plan[0]).toMatchObject({ blocked: false, finishTime: 25, workerReturnTime: 370 })
    expect(deliveries[deliveries.length - 1]?.time).toBe(400)
})

test("the projection follows the latest finish even when the last row finishes first", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const { orderedPlan, deliveries } = simulate([{ ...barracks, construction: { outwardDuration: 70 } }, farm])

    expect(orderedPlan.map(action => action.finishTime)).toEqual([100, 25])
    expect(deliveries[deliveries.length - 1]?.time).toBe(400)
})

test("the projection covers the timeline margin after a blocked fixed-time event", () => {
    const active = createWorkerEvent({ type: "make-active", commandTime: 400, count: 1 }, "light")
    const { plan, deliveries } = simulate([active])

    expect(plan[0]).toMatchObject({ blocked: true, commandTime: 400, finishTime: null })
    expect(deliveries[deliveries.length - 1]?.time).toBe(430)
})

test("the projection includes a successful scroll's effect duration", () => {
    const cast = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 9 }, "light")
    const { plan, deliveries } = simulate([cast], { ...economy, startingMana: 100, baseManaLimit: 100 })

    expect(plan[0]).toMatchObject({ blocked: false, commandTime: 9, finishTime: 40 })
    expect(deliveries[deliveries.length - 1]?.time).toBe(340)
})

test("a late successful event projects through the 30-minute cap", () => {
    const funds = createResourcesCollectedAction({ type: "resources-collected", commandTime: 1550, gold: 100, wood: 0 })
    const { plan, deliveries } = simulate([funds])

    expect(plan[0]).toMatchObject({ blocked: false, finishTime: 1550 })
    expect(deliveries[deliveries.length - 1]?.time).toBe(1800)
})

test("a late delivery can fund construction within the search limit", () => {
    const settings = { ...economy, startingWood: 150, woodGatherTime: 1000, woodTravelTime: 0, woodTravelTimeIncreaseBase: 0 }

    expect(simulate([farm], settings).plan[0]).toMatchObject({ blocked: false, commandTime: 1000 })
    const limited = simulate([farm], settings, 999)
    expect(limited.plan[0]).toMatchObject({ blocked: true, commandTime: null })
    expect(limited.deliveries[limited.deliveries.length - 1]?.time).toBe(300)
})
