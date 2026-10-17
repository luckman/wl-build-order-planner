import { createResourcesCollectedAction } from "./resourcesCollected"
import { simulateBuildOrder } from "./buildSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { factions } from "./gameData"
import { resourceAt } from "./resourceSimulation"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"

const economy = { ...economyFromProfile(initialGameProfile), startingGold: 0, startingWood: 0,
    goldWorkers: 0, woodWorkers: 0, workerCount: 1, orderDelay: 10, constructionStartDelay: 4 }
const simulate = (items: Parameters<typeof simulateBuildOrder>[0], townHall = "Castle") =>
    simulateBuildOrder(items, economy, 2, 20, 20, townHall)

test("resources arrive at the exact timestamp, including zero, without any delays", () => {
    const events = [0, 0.5, 12.25].map(commandTime => createResourcesCollectedAction({ type: "resources-collected", commandTime, gold: 300, wood: 250 }))
    const result = simulate(events)
    expect(result.plan.map(action => [action.commandTime, action.startTime, action.finishTime])).toEqual([
        [0, 0, 0], [0.5, 0.5, 0.5], [12.25, 12.25, 12.25] ])
    expect(result.plan.every(action => !action.blocked && action.workerId === null && !action.manaCost)).toBe(true)
    expect(resourceAt(economy, result.deliveries, [], 0.499)).toMatchObject({ gold: 300, wood: 250 })
    expect(resourceAt(economy, result.deliveries, [], 0.5)).toMatchObject({ gold: 600, wood: 500 })
    expect(resourceAt(economy, result.deliveries, [], 12.25)).toMatchObject({ gold: 900, wood: 750 })
})

test.each(["light", "dark"] as const)("%s resource events unblock earlier rows and survive JSON round trips", faction => {
    const event = createResourcesCollectedAction({ type: "resources-collected", commandTime: 15.5, gold: 300, wood: 300 })
    const worker = factions[faction].items.find(item => item.id === (faction === "light" ? "worker" : "slave"))!
    const result = simulate([worker, event], factions[faction].startingTownHall)
    expect(result.plan[0]).toMatchObject({ blocked: false, commandTime: 25.5 })
    expect(result.orderedPlan.map(action => action.item)).toEqual([event, worker])
    const parsed = parseBuildOrder(serializeBuildOrder(faction, initialGameProfile, result.plan, true))
    expect(parsed.buildOrder[1]).toEqual(event)
    expect(JSON.parse(serializeBuildOrder(faction, initialGameProfile, result.plan)).buildOrder[2]).toEqual({
        type: "resources-collected", commandTime: 15.5, gold: 300, wood: 300 })
})

test.each([-1, Infinity, NaN])("invalid event values are rejected: %s", value => {
    for (const field of ["gold", "wood", "commandTime"] as const)
        expect(() => createResourcesCollectedAction({ type: "resources-collected", commandTime: 1, gold: 300, wood: 300, [field]: value })).toThrow()
})
