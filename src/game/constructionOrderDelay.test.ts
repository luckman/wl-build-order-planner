import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions, type FactionId } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createScrollAction } from "./scrolls"
import { createResourcesCollectedAction } from "./resourcesCollected"

const settings = { ...economyFromProfile(initialGameProfile), startingGold: 100000, startingWood: 100000,
    startingMana: 100, baseManaLimit: 100, workerCount: 20, goldWorkers: 0, woodWorkers: 0 }
const item = (faction: FactionId, id: string) => factions[faction].items.find(candidate => candidate.id === id)!

test.each([0, 0.1, 1, 2.5])("Citadel completion spaces Goblin Lab and Altar commands by %ss", orderDelay => {
    const faction = factions.dark
    const lab = item("dark", "goblin-lab")
    const altar = item("dark", "altar-of-heroes")
    const order = buildOrderWithDependencies(faction, [], lab)
    const { plan } = simulateBuildOrder([...order, altar], { ...settings, orderDelay }, 0, 100, 20, "Citadel")
    expect(plan.every(action => !action.blocked)).toBe(true)
    const upgrade = plan.find(action => action.item.id === "citadel-lvl-2")!
    const labAction = plan.find(action => action.item.id === lab.id)!
    const altarAction = plan[plan.length - 1]
    expect(labAction.commandTime).toBe(upgrade.finishTime! + orderDelay)
    expect(altarAction.commandTime).toBe(labAction.commandTime! + orderDelay)
})

test.each(["light", "dark"] as const)("%s construction and upgrades share spacing, while recruitment does not wait", faction => {
    const farm = item(faction, faction === "light" ? "farm" : "pigsty")
    const worker = item(faction, faction === "light" ? "worker" : "slave")
    const upgrade = { ...item(faction, faction === "light" ? "castle-lvl-2" : "citadel-lvl-2"),
        requirements: [], prerequisites: [] }
    const orderDelay = 2.5
    for (const order of [[farm, upgrade], [upgrade, farm], [farm, worker, upgrade]]) {
        const { plan } = simulateBuildOrder(order, { ...settings, orderDelay }, 0, 100, 20,
            factions[faction].startingTownHall)
        expect(plan.every(action => !action.blocked)).toBe(true)
        expect(plan[0].commandTime).toBe(orderDelay)
        if (order.length === 3) expect(plan[1].commandTime).toBe(orderDelay)
        expect(plan[plan.length - 1].commandTime).toBe(order.length === 3
            ? plan[1].finishTime : 2 * orderDelay)
    }
    const { plan } = simulateBuildOrder([worker, farm], { ...settings, orderDelay }, 0, 100, 20,
        factions[faction].startingTownHall)
    expect(plan.map(action => action.commandTime)).toEqual([orderDelay, 2 * orderDelay])
})

test.each(["light", "dark"] as const)("%s consecutive building upgrades keep command spacing", faction => {
    const barracks = item(faction, "barracks")
    const upgrade = { ...item(faction, "barracks-lvl-2"), requirements: [], prerequisites: [] }
    const { plan } = simulateBuildOrder([barracks, barracks, upgrade, upgrade], settings, 0, 100, 20,
        factions[faction].startingTownHall)
    expect(plan.every(action => !action.blocked)).toBe(true)
    expect(plan[2].commandTime).toBe(plan[0].finishTime! + settings.orderDelay)
    expect(plan[3].commandTime).toBe(plan[2].commandTime! + settings.orderDelay)
})

test("a successful scroll spaces construction; a blocked scroll does not", () => {
    const barracks = item("light", "barracks")
    for (const startingMana of [0, 100]) {
        const scroll = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 1.5 }, "light")
        const { plan } = simulateBuildOrder([barracks, barracks, scroll], { ...settings, startingMana }, 0, 100, 20, "Castle")
        expect(plan[2].blocked).toBe(startingMana === 0)
        expect(plan[1].commandTime).toBe(startingMana === 0 ? 2 : 2.5)
    }
})

test("resource events do not reset command spacing", () => {
    const barracks = item("light", "barracks")
    const event = createResourcesCollectedAction({ type: "resources-collected", commandTime: 1.5, gold: 1, wood: 1 })
    const { plan } = simulateBuildOrder([barracks, barracks, event], settings, 0, 100, 20, "Castle")
    expect(plan.map(action => action.commandTime)).toEqual([1, 2, 1.5])
})
