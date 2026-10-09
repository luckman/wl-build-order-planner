import { initialPlayerLevels } from "./playerLevels"
import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions } from "./gameData"
import type { EconomySettings } from "./resourceSimulation"

const economy: EconomySettings = {
    startingGold: 2000,
    startingWood: 2000,
    workerCount: 1,
    goldWorkers: 0,
    woodWorkers: 1,
    ...initialPlayerLevels,
    foodPerFarm: 20,
    goldPerTrip: 50,
    woodPerTrip: 50,
    goldTravelTime: 4,
    goldGatherTime: 3,
    woodTravelTime: 4,
    woodGatherTime: 12,
    constructionStartDelay: 4,
    orderDelay: 1,
    sawmillWoodTravelTime: 0.5,
    initialGoldTravelReduction: 1,
}

const abundantEconomy = { ...economy, startingGold: 100000, startingWood: 100000, workerCount: 20, woodWorkers: 0 }

test.each([0, 0.1, 1, 2.5])("new recruitment buildings apply the %ss delay once per instance", orderDelay => {
    const barracks = required(factions.light.items.find(item => item.id === "barracks"))
    const soldier = required(factions.light.items.find(item => item.id === "swordsman"))
    const { plan } = simulateBuildOrder([barracks, barracks, soldier, soldier, soldier],
        { ...abundantEconomy, orderDelay }, 0, 100, 20, "Castle")
    expect(plan[2].commandTime).toBe(plan[0].finishTime! + orderDelay)
    expect(plan[3].commandTime).toBe(plan[1].finishTime! + orderDelay)
    expect(plan[2].buildingInstanceId).not.toBe(plan[3].buildingInstanceId)
    expect(plan[4].commandTime).toBe(plan[2].finishTime)
})

test("Castle level 2 completing at 01:10 unlocks the Altar command at 01:11 and construction at 01:15", () => {
    const upgrade = required(factions.light.items.find(item => item.id === "castle-lvl-2"))
    const altar = required(factions.light.items.find(item => item.id === "altar-of-heroes"))
    // Isolate the requested completion time from the opening dependency sequence.
    const { plan } = simulateBuildOrder([{ ...upgrade, seconds: 65, prerequisites: [], requirements: [] }, altar],
        abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[0].finishTime).toBe(70)
    expect(plan[1]).toMatchObject({ commandTime: 71, startTime: 75 })
})

test("an old Barracks waits once for the Elven Tree unlock, without repeating or stacking the delay", () => {
    const barracks = required(factions.light.items.find(item => item.id === "barracks"))
    const soldier = required(factions.light.items.find(item => item.id === "swordsman"))
    const tree = required(factions.light.items.find(item => item.id === "elven-tree"))
    const archer = required(factions.light.items.find(item => item.id === "archer"))
    const { plan } = simulateBuildOrder([barracks, soldier,
        { ...tree, seconds: 90, prerequisites: [], requirements: [] }, archer, archer],
        abundantEconomy, 0, 100, 20, "Castle")
    expect(plan[1].commandTime).toBe(36)
    expect(plan[2].finishTime).toBe(130)
    expect(plan[3].commandTime).toBe(131)
    expect(plan[4].commandTime).toBe(plan[3].finishTime)
})

test.each([0, 2.5, 8])("first recruitment command respects initial order delay %ss", orderDelay => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const { plan } = simulateBuildOrder([worker, worker], { ...economy, orderDelay }, 2, 20, 20, "Castle")
    expect(plan.map(action => action.commandTime)).toEqual([orderDelay, orderDelay + worker.seconds * 0.99])
})

test("Miriel waits for Altar completion, reserves ten food, and is unique across two Altars", () => {
    const faction = factions.light
    const altar = required(faction.items.find(item => item.id === "altar-of-heroes"))
    const miriel = required(faction.items.find(item => item.id === "miriel"))
    const dependencies = buildOrderWithDependencies(faction, [], miriel).filter(item => item.id !== miriel.id)
    const { plan } = simulateBuildOrder([...dependencies, altar, miriel, miriel], abundantEconomy, 0, 100, 20, "Castle")
    const altars = plan.filter(action => action.item.id === altar.id)
    expect(altars.map(action => action.cost)).toEqual([{ gold: 150, wood: 100 }, { gold: 300, wood: 200 }])
    const heroes = plan.filter(action => action.item.id === miriel.id)
    expect(heroes[0]).toMatchObject({ blocked: false, cost: { gold: 650, wood: 250 }, workerId: null })
    const tree = required(plan.find(action => action.item.id === "elven-tree"))
    expect(heroes[0].commandTime).toBe(Math.max(altars[0].finishTime!, tree.finishTime!) + economy.orderDelay)
    expect(heroes[0].finishTime! - heroes[0].startTime!).toBe(45)
    expect(heroes[1]).toMatchObject({ blocked: true, commandTime: null })
    expect(heroes[1].blockedReason).toContain("Miriel limit reached")

    const foodBlocked = simulateBuildOrder([...dependencies, miriel], abundantEconomy, 21, 10, 20, "Castle")
    expect(foodBlocked.plan[foodBlocked.plan.length - 1].blocked).toBe(true) // Farm supplies 20: only 9 food left.
})

test("all three hero types can recruit once and duplicates remain blocked across Altars", () => {
    const faction = factions.light
    const heroes = faction.items.filter(item => item.kind === "hero")
    let order = heroes.reduce((previous, hero) => buildOrderWithDependencies(faction, previous, hero), [] as typeof faction.items)
    order = buildOrderWithDependencies(faction, order, required(faction.items.find(item => item.id === "altar-of-heroes")))
    const { plan } = simulateBuildOrder([...order, ...heroes], abundantEconomy, 0, 100, 20, "Castle")
    expect(plan.filter(action => !action.blocked && action.item.kind === "hero")).toHaveLength(3)
    for (const hero of heroes) {
        expect(() => buildOrderWithDependencies(faction, order, hero)).toThrow(`${hero.name} limit reached`)
        const duplicate = required(plan.filter(action => action.item.id === hero.id)[1])
        expect(duplicate.blocked).toBe(true)
        expect(duplicate.blockedReason).toContain(`${hero.name} limit reached`)
        const withoutHero = order.filter(item => item.id !== hero.id)
        expect(buildOrderWithDependencies(faction, withoutHero, hero).filter(item => item.id === hero.id)).toHaveLength(1)
    }
})

test.each([
    ["miriel", "gilbert", "berin"], ["miriel", "berin", "gilbert"],
    ["gilbert", "miriel", "berin"], ["gilbert", "berin", "miriel"],
    ["berin", "miriel", "gilbert"], ["berin", "gilbert", "miriel"],
])("hero order %s, %s, %s inserts Altar tiers and waits for their unlock", (...ids) => {
    const faction = factions.light
    const order = ids.reduce((previous, id) => buildOrderWithDependencies(faction, previous,
        required(faction.items.find(item => item.id === id))), [] as typeof faction.items)
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, "Castle")
    expect(plan.every(action => !action.blocked)).toBe(true)
    const heroes = plan.filter(action => action.item.kind === "hero")
    for (let index = 1; index < heroes.length; index++) {
        const upgrade = required(plan.find(action => action.item.id === `altar-of-heroes-lvl-${index + 1}`))
        expect(heroes[index].commandTime!).toBeGreaterThanOrEqual(upgrade.finishTime! + economy.orderDelay)
        expect(heroes[index].buildingInstanceId).toBe(upgrade.buildingInstanceId)
    }
    // Import/removal bypasses dependency insertion: multiple level 1 Altars cannot unlock hero two.
    const altar = required(faction.items.find(item => item.id === "altar-of-heroes"))
    const withoutUpgrades = order.filter(item => !item.id.startsWith("altar-of-heroes-lvl-"))
    const blocked = simulateBuildOrder([altar, ...withoutUpgrades], abundantEconomy, 0, 100, 20, "Castle").plan
    const blockedHeroes = blocked.filter(action => action.item.kind === "hero")
    expect(blockedHeroes[0].blocked).toBe(false)
    expect(blockedHeroes[1].blockedReason).toContain("level 2")
    expect(blockedHeroes[2].blockedReason).toContain("level 2") // Failed second hero does not reserve tier three.
    const withoutThirdUpgrade = simulateBuildOrder(order.filter(item => item.id !== "altar-of-heroes-lvl-3"),
        abundantEconomy, 0, 100, 20, "Castle").plan
    expect(withoutThirdUpgrade.filter(action => action.item.kind === "hero")[2].blockedReason).toContain("level 3")
})

test.each([2, 3])("one level %s Altar unlocks hero recruitment at a separate level 1 Altar", level => {
    const faction = factions.light
    const heroes = faction.items.filter(item => item.kind === "hero")
    const allDependencies = heroes.reduce((previous, hero) => buildOrderWithDependencies(faction, previous, hero),
        [] as typeof faction.items)
    const dependencies = allDependencies.filter(item => item.kind !== "hero" &&
        (level === 3 || item.id !== "altar-of-heroes-lvl-3"))
    const altar = required(faction.items.find(item => item.id === "altar-of-heroes"))
    // Keep the upgraded Altar busy so subsequent heroes must use the level 1 instance.
    const recruits = [{ ...heroes[0], seconds: 200 }, ...heroes.slice(1, level)]
    // Advance commands past the Altar upgrade before occupying its queue.
    const worker = { ...required(faction.items.find(item => item.id === "worker")), seconds: 200 }
    const { plan } = simulateBuildOrder([...dependencies, altar, worker, worker, ...recruits], abundantEconomy, 0, 100, 20, "Castle", 1000)
    expect(plan.every(action => !action.blocked)).toBe(true)
    const upgrade = required(plan.find(action => action.item.id === `altar-of-heroes-lvl-${level}`))
    const lowerAltar = plan.filter(action => action.item.id === altar.id)[1]
    const recruited = plan.filter(action => action.item.kind === "hero")
    expect(recruited[0].buildingInstanceId).toBe(upgrade.buildingInstanceId)
    for (const hero of recruited.slice(1)) {
        expect(hero.buildingInstanceId).toBe(lowerAltar.buildingInstanceId)
        expect(hero.commandTime!).toBeGreaterThanOrEqual(upgrade.finishTime! + economy.orderDelay)
        expect(hero.commandTime!).toBeLessThan(recruited[0].finishTime!)
    }
})

test.each(["guardsman", "ballista", "fox-rider", "wind-mage", "biker", "sniper", "sloop", "caravel"])(
    "%s inserts building upgrades, shares its producer queue, and blocks if a prerequisite is removed", id => {
        const faction = factions.light
        const unit = required(faction.items.find(item => item.id === id))
        const order = buildOrderWithDependencies(faction, [], unit)
        const { plan } = simulateBuildOrder([...order, unit], abundantEconomy, 0, 100, 20, "Castle")
        expect(plan.every(action => !action.blocked)).toBe(true)
        const recruits = plan.filter(action => action.item.id === id)
        expect(recruits[1].buildingInstanceId).toBe(recruits[0].buildingInstanceId)
        expect(recruits[1].startTime).toBe(recruits[0].finishTime)
        for (const requirement of unit.requirements ?? []) {
            const requiredId = (requirement.minLevel ?? 1) > 1
                ? `${requirement.item}-lvl-${requirement.minLevel}` : requirement.item
            const completed = required(plan.find(action => action.item.id === requiredId))
            expect(recruits[0].commandTime!).toBeGreaterThanOrEqual(completed.finishTime! + economy.orderDelay)
            const removed = simulateBuildOrder(order.filter(item => item.id !== requiredId),
                abundantEconomy, 0, 100, 20, "Castle").plan
            expect(removed[removed.length - 1].blocked).toBe(true)
        }
    },
)

test.each(["tower-of-light-magic", "crossbow-tower", "artillery-tower"])(
    "%s unlocks 1/2/3 slots from racial upgrades and extra racial buildings do not increase capacity", id => {
        const faction = factions.light
        const tower = required(faction.items.find(item => item.id === id))
        const racial = required(faction.items.find(item => item.id === tower.limit!.basedOn))
        let order = buildOrderWithDependencies(faction, [], tower)
        const firstTier = [...order]
        order = buildOrderWithDependencies(faction, order, tower)
        order = buildOrderWithDependencies(faction, order, tower)
        expect(() => buildOrderWithDependencies(faction, order, tower)).toThrow("limit reached")
        const { plan } = simulateBuildOrder([...order, tower], abundantEconomy, 0, 100, 20, "Castle", 1000)
        const towers = plan.filter(action => action.item.id === id)
        expect(towers.slice(0, 3).every(action => !action.blocked)).toBe(true)
        expect(towers[3].blocked).toBe(true)
        for (let level = 2; level <= 3; level++) {
            const upgrade = required(plan.find(action => action.item.id === `${racial.id}-lvl-${level}`))
            expect(towers[level - 1].commandTime!).toBeGreaterThanOrEqual(upgrade.finishTime! + economy.orderDelay)
        }
        const extraRacial = simulateBuildOrder([...firstTier, racial, tower], abundantEconomy, 0, 100, 20, "Castle").plan
        expect(extraRacial[extraRacial.length - 1].blockedReason).toContain("limit reached")
        const removedUpgrade = simulateBuildOrder(order.filter(item => item.id !== `${racial.id}-lvl-3`),
            abundantEconomy, 0, 100, 20, "Castle", 1000).plan
        expect(removedUpgrade.filter(action => action.item.id === id)[2].blocked).toBe(true)
    },
)

test("Miriel remains unique after recruitment completes and still needs a completed Altar and Elven Tree", () => {
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
    const missingTree = simulateBuildOrder(order.filter(item => item.id !== "elven-tree"), abundantEconomy, 0, 100, 20, "Castle")
    expect(missingTree.plan[missingTree.plan.length - 1].blocked).toBe(true)
    expect(missingTree.plan[missingTree.plan.length - 1].blockedReason).toContain("Elven Tree")
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
    expect(plan[plan.length - 1].commandTime).toBe(plan[plan.length - 2].finishTime! + economy.orderDelay)
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
    expect(recruitment.commandTime).toBe(tree.finishTime! + economy.orderDelay)
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

test.each([
    ["barracks-lvl-2", "warsmith"],
    ["factory-lvl-2", "copter"],
    ["sanctuary-lvl-2", "healer"],
    ["altar-of-heroes-lvl-2", "miriel"],
    ["altar-of-heroes-lvl-3", "miriel"],
    ["shipyard-lvl-2", undefined],
    ["dwarven-forge-lvl-3", "berin"],
    ["human-monument-lvl-3", "gilbert"],
    ["elven-tree-lvl-3", "archer"],
])("%s completes its dependency chain and retains lower-level recruitment prerequisites", (upgradeId, recruitId) => {
    const faction = factions.light
    const upgrade = required(faction.items.find(item => item.id === upgradeId))
    const base = required(faction.items.find(item => item.id === upgrade.buildingId))
    let order = buildOrderWithDependencies(faction, buildOrderWithDependencies(faction, [], base), upgrade)
    if (recruitId) {
        order = buildOrderWithDependencies(faction, order, required(faction.items.find(item => item.id === recruitId)))
    }
    const { plan } = simulateBuildOrder(order, abundantEconomy, 0, 100, 20, "Castle")
    expect(plan.every(action => !action.blocked)).toBe(true)
    const upgraded = required(plan.find(action => action.item.id === upgradeId))
    const source = required(plan.find(action => action.item.id === upgrade.upgradeFrom))
    expect(upgraded.buildingInstanceId).toBe(source.buildingInstanceId)
    const castle = required(plan.find(action => action.item.id ===
        `castle-lvl-${upgrade.level === 3 ? 4 : 3}`))
    expect(upgraded.commandTime!).toBeGreaterThanOrEqual(castle.finishTime!)
    if (recruitId) {
        const recruit = required(plan.find(action => action.item.id === recruitId))
        if (["barracks-lvl-2", "factory-lvl-2", "sanctuary-lvl-2",
            "altar-of-heroes-lvl-2", "altar-of-heroes-lvl-3"].includes(upgradeId!)) {
            expect(recruit.startTime!).toBeGreaterThanOrEqual(upgraded.finishTime!)
            expect(recruit.buildingInstanceId).toBe(upgraded.buildingInstanceId)
        }
    }
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

test.each(["light", "dark"] as const)("%s completed Sawmill accelerates income and resource-dependent orders", (factionId) => {
    const faction = factions[factionId]
    const sawmill = required(faction.items.find(({ id }) => id === "sawmill"))
    const barracks = required(faction.items.find(({ id }) => id === "barracks"))
    const { plan, deliveries } = simulateBuildOrder(
        [sawmill, barracks],
        { ...economy, workerCount: 2, startingWood: 100 },
        4, 100, 20, faction.startingTownHall, 110,
    )
    expect(plan[0]).toMatchObject({ commandTime: 1, finishTime: 25, workerReturnTime: 29 })
    expect(plan[1]).toMatchObject({ blocked: false, commandTime: 49.5 })
    expect(deliveries.map(({ time }) => time)).toEqual([20, 36.5, 49.5, 62.5, 75.5, 89, 103])
})

test("a blocked Sawmill does not change wood travel", () => {
    const sawmill = required(factions.light.items.find(({ id }) => id === "sawmill"))
    const { plan, deliveries } = simulateBuildOrder(
        [sawmill], { ...economy, startingGold: 0 }, 2, 100, 20, "Castle", 60,
    )
    expect(plan[0].blocked).toBe(true)
    expect(deliveries.map(({ time }) => time)).toEqual([20, 40, 60])
})

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
        [36, 36, 36 + soldier.seconds * 0.99, null],
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
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([1, 1, 18.82])
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
