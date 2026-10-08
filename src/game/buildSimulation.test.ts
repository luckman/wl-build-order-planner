import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions } from "./gameData"
import type { EconomySettings } from "./resourceSimulation"

const economy: EconomySettings = {
    startingGold: 2000,
    startingWood: 2000,
    workerCount: 1,
    goldWorkers: 0,
    woodWorkers: 1,
    goldPerTrip: 50,
    woodPerTrip: 50,
    goldOutboundTravel: 4,
    goldReturnTravel: 4,
    goldGatherTime: 3,
    woodOutboundTravel: 4,
    woodReturnTravel: 4,
    woodGatherTime: 12,
    constructionStartDelay: 4,
}

const abundantEconomy = { ...economy, startingGold: 100000, startingWood: 100000, workerCount: 20, woodWorkers: 0 }

test("Miriel waits for Altar completion, reserves ten food, and is unique across two Altars", () => {
    const faction = factions.light
    const altar = required(faction.items.find(item => item.id === "altar-of-heroes"))
    const miriel = required(faction.items.find(item => item.id === "miriel"))
    const dependencies = buildOrderWithDependencies(faction, [], altar)
    const { plan } = simulateBuildOrder([...dependencies, altar, miriel, miriel], abundantEconomy, 0, 100, 20, "Castle")
    const altars = plan.filter(action => action.item.id === altar.id)
    expect(altars.map(action => action.cost)).toEqual([{ gold: 150, wood: 100 }, { gold: 300, wood: 200 }])
    const heroes = plan.filter(action => action.item.id === miriel.id)
    expect(heroes[0]).toMatchObject({ blocked: false, cost: { gold: 650, wood: 250 }, workerId: null })
    expect(heroes[0].commandTime).toBe(altars[0].finishTime)
    expect(heroes[0].finishTime! - heroes[0].startTime!).toBe(45)
    expect(heroes[1]).toMatchObject({ blocked: true, commandTime: null })
    expect(heroes[1].blockedReason).toContain("Miriel limit reached")

    const foodBlocked = simulateBuildOrder([...dependencies, miriel], abundantEconomy, 21, 10, 20, "Castle")
    expect(foodBlocked.plan[foodBlocked.plan.length - 1].blocked).toBe(true) // Farm supplies 20: only 9 food left.
})

test("Miriel remains unique after recruitment completes and still needs a completed Altar", () => {
    const faction = factions.light
    const miriel = required(faction.items.find(item => item.id === "miriel"))
    const swordsman = required(faction.items.find(item => item.id === "swordsman"))
    const order = buildOrderWithDependencies(faction, [], miriel)
    const { plan } = simulateBuildOrder([...order, { ...swordsman, seconds: 60 }, swordsman, miriel], abundantEconomy, 0, 100, 20, "Castle")
    const first = required(plan.find(action => action.item.id === "miriel"))
    expect(plan[plan.length - 2].commandTime!).toBeGreaterThanOrEqual(first.finishTime!)
    expect(plan[plan.length - 1]).toMatchObject({ blocked: true })
    const missingAltar = simulateBuildOrder(order.filter(item => item.id !== "altar-of-heroes"), abundantEconomy, 0, 100, 20, "Castle")
    expect(missingAltar.plan[missingAltar.plan.length - 1].blocked).toBe(true)
})

test.each(["light", "dark"] as const)("%s progression reaches level 4 only after counted prerequisites complete", (id) => {
    const faction = factions[id]
    const base = id === "light" ? "castle" : "citadel"
    const food = id === "light" ? "farm" : "pigsty"
    const target = required(faction.items.find(item => item.id === `${base}-lvl-4`))
    const order = buildOrderWithDependencies(faction, [], target)
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, faction.startingTownHall)
    expect(plan.every(action => !action.blocked)).toBe(true)
    for (const level of [3, 4]) {
        const upgrade = required(plan.find(action => action.item.id === `${base}-lvl-${level}`))
        const completed = plan.filter(action => action.finishTime !== null && action.finishTime <= upgrade.commandTime!)
        expect(completed.filter(action => action.item.id === food)).toHaveLength(level - 1)
        expect(completed.filter(action => action.item.id === "tower-of-mana")).toHaveLength(level - 2)
        expect(completed.some(action => action.item.id === "barracks")).toBe(true)
    }
    const upgrades = plan.filter(action => action.item.kind === "upgrade")
    expect(upgrades.map(action => action.buildingInstanceId)).toEqual([0, 0, 0])
})

test.each(["light", "dark"] as const)("%s reserves an upgrade source during travel and never upgrades it twice", (id) => {
    const faction = factions[id]
    const upgrade = required(faction.items.find(item => item.kind === "upgrade"))
    const order = buildOrderWithDependencies(faction, [], upgrade)
    const { plan } = simulateBuildOrder([...order, upgrade], abundantEconomy, 0, 100, 20, faction.startingTownHall)
    expect(plan[plan.length - 2].blocked).toBe(false)
    expect(plan[plan.length - 1]).toMatchObject({ blocked: true, commandTime: null })
    expect(plan[plan.length - 1].blockedReason).toContain("to upgrade")
})

test.each(["light", "dark"] as const)("%s two physical town halls can each upgrade once and still train workers", (id) => {
    const faction = factions[id]
    const castle = required(faction.items.find(item => item.name === faction.startingTownHall))
    const upgrade = required(faction.items.find(item => item.kind === "upgrade"))
    const worker = required(faction.items.find(item => item.id === (id === "light" ? "worker" : "slave")))
    const order = [...buildOrderWithDependencies(faction, [castle], upgrade), upgrade, worker, worker, worker, worker]
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, faction.startingTownHall)
    expect(plan.every(action => !action.blocked)).toBe(true)
    const upgrades = plan.filter(action => action.item.kind === "upgrade")
    expect(new Set(upgrades.map(action => action.buildingInstanceId)).size).toBe(2)
    const workers = plan.filter(action => action.item.kind === "unit")
    expect(workers[0].commandTime).toBe(upgrades[0].finishTime)
    expect(new Set(workers.map(action => action.buildingInstanceId)).size).toBe(2)
})

test.each(["farm", "sawmill"])("%s reserves its only level 1 slot before the worker arrives", (buildingId) => {
    const item = required(factions.light.items.find(item => item.id === buildingId))
    const { plan } = simulateBuildOrder([item, item], abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[0]).toMatchObject({ commandTime: 1, startTime: 5 })
    expect(plan[1]).toMatchObject({ blocked: true, commandTime: null })
    expect(plan[1].blockedReason).toContain("limit reached")
})

test("an upgrade unlocks a limit only on completion, and extra Castles do not add capacity", () => {
    const faction = factions.light
    const upgrade = required(faction.items.find(item => item.id === "castle-lvl-2"))
    const farm = required(faction.items.find(item => item.id === "farm"))
    const castle = required(faction.items.find(item => item.id === "castle"))
    const order = [...buildOrderWithDependencies(faction, [], upgrade), farm]
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[plan.length - 1].commandTime).toBe(plan[plan.length - 2].finishTime)
    const extra = simulateBuildOrder([castle, farm, farm], abundantEconomy, 0, 100, 20, "Castle")
    expect(extra.plan[2].blocked).toBe(true)
})

test("missing counted prerequisites and removed prerequisite orders block higher upgrades", () => {
    const faction = factions.light
    const level3 = required(faction.items.find(item => item.id === "castle-lvl-3"))
    const order = buildOrderWithDependencies(faction, [], level3)
    const withoutSecondFarm = order.filter((item, index) => item.id !== "farm" || index === order.findIndex(item => item.id === "farm"))
    const { plan } = simulateBuildOrder(withoutSecondFarm, abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[plan.length - 1]).toMatchObject({ blocked: true })
    expect(plan[plan.length - 1].blockedReason).toContain("Requires 2 × Farm")
    const withoutTower = simulateBuildOrder(order.filter(item => item.id !== "tower-of-mana"), abundantEconomy, 0, 100, 20, "Castle")
    expect(withoutTower.plan[withoutTower.plan.length - 1].blocked).toBe(true)
})

test("Archer waits for Elven Tree completion and shares the Barracks training queue", () => {
    const faction = factions.light
    const archer = required(faction.items.find(item => item.id === "archer"))
    const swordsman = required(faction.items.find(item => item.id === "swordsman"))
    const order = [...buildOrderWithDependencies(faction, [], archer), swordsman]
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, "Castle")
    expect(plan.every(action => !action.blocked)).toBe(true)
    const tree = required(plan.find(action => action.item.id === "elven-tree"))
    const recruitment = plan[plan.length - 2]
    expect(recruitment.commandTime).toBe(tree.finishTime)
    expect(plan[plan.length - 1].commandTime).toBe(recruitment.finishTime)
    const blocked = simulateBuildOrder(order.filter(item => item.id !== "elven-tree"), abundantEconomy, 0, 100, 20, "Castle")
    expect(blocked.plan.find(action => action.item.id === "archer")?.blocked).toBe(true)
})

test.each(["light", "dark"] as const)("%s level 4 limits allow four food buildings, four Sawmills, and three Towers", (id) => {
    const faction = factions[id]
    const base = id === "light" ? "castle" : "citadel"
    const food = id === "light" ? "farm" : "pigsty"
    const level4 = required(faction.items.find(item => item.id === `${base}-lvl-4`))
    const progression = buildOrderWithDependencies(faction, [], level4)
    for (const [buildingId, max] of [[food, 4], ["sawmill", 4], ["tower-of-mana", 3]] as const) {
        const item = required(faction.items.find(item => item.id === buildingId))
        const existing = progression.filter(item => item.id === buildingId).length
        const order = [...progression, ...Array(max - existing + 1).fill(item)]
        const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, faction.startingTownHall)
        expect(plan.filter(action => action.item.id === buildingId && !action.blocked)).toHaveLength(max)
        expect(plan[plan.length - 1]).toMatchObject({ blocked: true })
    }
})

test("future production-building upgrades preserve production and copy pricing without multiplying upgrade costs", () => {
    const barracks = required(factions.light.items.find(item => item.id === "barracks"))
    const swordsman = required(factions.light.items.find(item => item.id === "swordsman"))
    // Synthetic future catalog entry exercises generic logic, without adding unconfirmed game data.
    const upgrade = {
        ...barracks, id: "test-barracks-level-2", name: "Test Barracks level 2", kind: "upgrade" as const,
        producer: "Barracks", upgradeFrom: barracks.id, level: 2,
        gold: 75, wood: 25, seconds: 5, prerequisites: [], requirements: [],
    }
    const { plan } = simulateBuildOrder([barracks, upgrade, swordsman, barracks], abundantEconomy, 0, 100, 20, "Castle")
    expect(plan.every(action => !action.blocked)).toBe(true)
    expect(plan[1].cost).toEqual({ gold: 75, wood: 25 })
    expect(plan[2].commandTime).toBe(plan[1].finishTime)
    expect(plan[2].buildingInstanceId).toBe(plan[1].buildingInstanceId)
    expect(plan[3].cost).toEqual({ gold: 400, wood: 300 })
})

test("a level 4 upgrade needs both completed Towers rather than one historical Tower name", () => {
    const target = required(factions.light.items.find(item => item.id === "castle-lvl-4"))
    const order = buildOrderWithDependencies(factions.light, [], target)
    const lastTower = order.map(item => item.id).lastIndexOf("tower-of-mana")
    const { plan } = simulateBuildOrder(order.filter((_, index) => index !== lastTower), abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[plan.length - 1]).toMatchObject({ blocked: true })
    expect(plan[plan.length - 1].blockedReason).toContain("Requires 2 × Tower of Mana")
})

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error("Missing test catalog item")
    }
    return value
}

test.each(["light", "dark"] as const)("%s buildings finish before the builder becomes available again", (factionId) => {
    const faction = factions[factionId]
    const barracks = required(faction.items.find(({ id }) => id === "barracks"))
    const soldier = required(faction.items.find(({ producer, kind }) => producer === "Barracks" && kind === "unit"))
    const { plan } = simulateBuildOrder([barracks, soldier, barracks], economy, 2, 100, 20, faction.startingTownHall)
    expect(
        plan.map(({ commandTime, startTime, finishTime, workerReturnTime }) => [
            commandTime,
            startTime,
            finishTime,
            workerReturnTime,
        ]),
    ).toEqual([
        [1, 5, 35, 39],
        [35, 35, 35 + soldier.seconds, null],
        [39, 43, 73, 77],
    ])
    expect(plan[0].workerId).toBe(plan[2].workerId)
})

test("subsequent commands wait for income recomputed around construction", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan, deliveries } = simulateBuildOrder(
        [barracks, { ...barracks, wood: 25 }],
        { ...economy, startingWood: 150 },
        2,
        100,
        20,
        "Castle",
    )
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([1, 55])
    expect(deliveries[0]).toMatchObject({ time: 55, wood: 50 })
    expect(deliveries[1]).toMatchObject({ time: 109, wood: 50 })
})

test("a completed new worker can build while another worker remains occupied", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const worker = required(factions.light.items.find(({ id }) => id === "worker"))
    const { plan } = simulateBuildOrder([barracks, worker, barracks], economy, 2, 100, 20, "Castle")
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([1, 1, 19])
    expect(plan[2].workerId).not.toBe(plan[0].workerId)
})

test("zero delay removes travel but still reserves the worker for construction", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [barracks, barracks],
        { ...economy, constructionStartDelay: 0 },
        2,
        100,
        20,
        "Castle",
    )
    expect(
        plan.map(({ commandTime, finishTime, workerReturnTime }) => [commandTime, finishTime, workerReturnTime]),
    ).toEqual([
        [1, 31, 31],
        [31, 61, 61],
    ])
})

test("construction is blocked without workers", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    expect(
        simulateBuildOrder([barracks], { ...economy, workerCount: 0, woodWorkers: 0 }, 0, 100, 20, "Castle").plan[0]
            .blocked,
    ).toBe(true)
})

test("a construction command waits for the only miner to exit the mine", () => {
    const upgrade = required(factions.light.items.find(({ kind }) => kind === "upgrade"))
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [
            { ...upgrade, seconds: 5, prerequisites: ["Castle"], requirements: [] },
            { ...barracks, prerequisites: [upgrade.name] },
        ],
        { ...economy, goldWorkers: 1, woodWorkers: 0 },
        2,
        100,
        20,
        "Castle",
    )
    expect(plan[1]).toMatchObject({ commandTime: 17, startTime: 21, finishTime: 51, workerReturnTime: 55 })
})

test.each(["light", "dark"] as const)("%s building upgrades reserve a worker through its return trip", (factionId) => {
    const faction = factions[factionId]
    const upgrade = required(faction.items.find(({ kind }) => kind === "upgrade"))
    const barracks = required(faction.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [{ ...upgrade, prerequisites: [faction.startingTownHall], requirements: [] }, barracks],
        economy,
        2,
        100,
        20,
        faction.startingTownHall,
    )

    expect(plan[0]).toMatchObject({ commandTime: 1, startTime: 5, finishTime: 50, workerReturnTime: 54 })
    expect(plan[1]).toMatchObject({ commandTime: 54, startTime: 58, finishTime: 88, workerReturnTime: 92 })
    expect(plan[0].workerId).toBe(plan[1].workerId)
})

test.each(["light", "dark"] as const)("%s Barracks orders reserve escalating prices before workers arrive", (factionId) => {
    const faction = factions[factionId]
    const barracks = required(faction.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [barracks, barracks, barracks],
        { ...economy, workerCount: 3, woodWorkers: 0 },
        0, 100, 20, faction.startingTownHall,
    )
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([1, 1, 1])
    expect(plan.map(({ startTime }) => startTime)).toEqual([5, 5, 5])
    expect(plan.map(({ cost }) => cost)).toEqual([
        { gold: 200, wood: 150 },
        { gold: 400, wood: 300 },
        { gold: 600, wood: 450 },
    ])
    expect(barracks).toMatchObject({ gold: 200, wood: 150 })
})

test.each([
    { startingGold: 599, startingWood: 450 },
    { startingGold: 600, startingWood: 449 },
])("a second Barracks waits for its full multiplied resources: %j", (resources) => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [barracks, barracks],
        { ...economy, ...resources, workerCount: 2, woodWorkers: 0 },
        0, 100, 20, "Castle",
    )
    expect(plan[0].blocked).toBe(false)
    expect(plan[1]).toMatchObject({ blocked: true, cost: { gold: 400, wood: 300 } })
})
