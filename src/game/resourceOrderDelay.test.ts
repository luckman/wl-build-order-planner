import { simulateBuildOrder } from "./buildSimulation"
import { factions } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createUnitKilledAction } from "./unitsKilled"

const worker = factions.light.items.find(item => item.id === "worker")!
const farm = { ...factions.light.items.find(item => item.id === "farm")!, limit: undefined }
const settings = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    workerCount: 2, goldWorkers: 0, woodWorkers: 0, orderDelay: 2.5 }
const collected = (time: number, gold: number, wood: number) =>
    createResourcesCollectedAction({ type: "resources-collected", commandTime: time, gold, wood })

test.each(["gold", "wood"] as const)("commands wait after collected %s becomes sufficient", resource => {
    const economy = { ...settings, [resource === "gold" ? "startingGold" : "startingWood"]: 0 }
    const { plan } = simulateBuildOrder([farm, collected(10, farm.gold, farm.wood)], economy, 0, 100, 20, "Castle")
    expect(plan[0].commandTime).toBe(12.5)
})

test("earlier spending reserves resources without reusing their previous readiness", () => {
    const { plan } = simulateBuildOrder([farm, farm, collected(10, farm.gold, farm.wood)],
        { ...settings, startingGold: farm.gold, startingWood: farm.wood }, 0, 100, 20, "Castle")
    expect(plan.slice(0, 2).map(action => action.commandTime)).toEqual([2.5, 12.5])
})

test("food from a completed farm waits for order delay", () => {
    const { plan } = simulateBuildOrder([farm, worker], settings, 4, 4, 20, "Castle")
    expect(plan[1].commandTime).toBe(plan[0].finishTime! + settings.orderDelay)
})

test("food released by a kill waits for order delay", () => {
    const kill = createUnitKilledAction({ type: "unit-is-killed", commandTime: 10, unitId: "worker" }, "light")
    const { plan } = simulateBuildOrder([worker, kill], settings, 4, 4, 20, "Castle")
    expect(plan[0].commandTime).toBe(12.5)
})

test("worker return has no extra order delay when resources are already ready", () => {
    const { plan } = simulateBuildOrder([farm, farm], { ...settings, workerCount: 1 }, 0, 100, 20, "Castle")
    expect(plan[1].commandTime).toBe(plan[0].workerReturnTime)
})

test("natural gathering waits and resource waits overlap rather than stack", () => {
    const economy = { ...settings, startingGold: 0, startingWood: 0, goldWorkers: 1, woodWorkers: 1 }
    const { plan, deliveries } = simulateBuildOrder([farm], economy, 0, 100, 20, "Castle")
    const ready = (resource: "gold" | "wood", cost: number) => {
        let total = 0
        return deliveries.find(event => { total += event[resource]; return total >= cost })!.time
    }
    expect(plan[0].commandTime).toBe(Math.max(ready("gold", farm.gold), ready("wood", farm.wood)) + settings.orderDelay)
})

test("zero order delay permits commands at resource availability", () => {
    const { plan } = simulateBuildOrder([farm, collected(10, farm.gold, farm.wood)],
        { ...settings, startingGold: 0, startingWood: 0, orderDelay: 0 }, 0, 100, 20, "Castle")
    expect(plan[0].commandTime).toBe(10)
})

test("construction start delay defaults to three seconds", () => {
    expect(initialGameProfile.delays.constructionStartDelay).toBe(3)
})

test.each([0.1, 0.3, 1, 2.5])("fractional resource availability respects the exact %ss delay", orderDelay => {
    const { plan } = simulateBuildOrder([farm, collected(12.1, farm.gold, farm.wood)],
        { ...settings, startingGold: 0, startingWood: 0, orderDelay }, 0, 100, 20, "Castle")
    expect(plan[0].commandTime).toBe(12.1 + orderDelay)
})

test("food released once cannot unlock multiple recruits using the same food", () => {
    const kill = createUnitKilledAction({ type: "unit-is-killed", commandTime: 10, unitId: "worker" }, "light")
    const { plan } = simulateBuildOrder([worker, worker, kill], settings, 4, 4, 20, "Castle")
    expect(plan[0].commandTime).toBe(12.5)
    expect(plan[1].blocked).toBe(true)
})
