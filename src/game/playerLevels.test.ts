import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { factions, type PlannerItem } from "./gameData"
import { simulateBuildOrder } from "./buildSimulation"
import { actionDuration, initialPlayerLevels, playerLevelFields, productionDuration } from "./playerLevels"
import { parseBuildOrder, parseGameProfile, serializeBuildOrder } from "./buildOrderFile"

test.each([
    [1, 50, 20, 0.99], [4, 50, 20, 0.99], [5, 51, 21, 0.98], [8, 51, 21, 0.98],
    [9, 52, 22, 0.97], [12, 52, 22, 0.97], [13, 53, 23, 0.96], [16, 53, 23, 0.96],
    [17, 54, 24, 0.95], [20, 54, 24, 0.95], [21, 55, 25, 0.94], [24, 55, 25, 0.94],
])("level %s derives yields and worker training duration", (level, resources, food, multiplier) => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player,
        townHallLevel: level, sawmillLevel: level, farmLevel: level, manaTowerLevel: level } }
    const economy = economyFromProfile(profile)
    expect(economy).toMatchObject({ goldPerTrip: resources, woodPerTrip: resources, foodPerFarm: food, manaPerTower: resources })
    for (const faction of Object.values(factions)) {
        const worker = faction.items.find(item => item.name === faction.workerName)!
        expect(productionDuration(worker, economy)).toBeCloseTo(worker.seconds * multiplier)
    }
})

test.each([
    ["castle", "townHallLevel"], ["citadel", "townHallLevel"],
    ["barracks", "barracksLevel"], ["factory", "industrialBuildingLevel"],
    ["workshop", "industrialBuildingLevel"], ["sanctuary", "arcaneBuildingLevel"],
    ["dark-gate", "arcaneBuildingLevel"],
    ["shipyard", "shipyardLevel"], ["altar-of-heroes", "altarOfHeroesLevel"],
] as const)("%s uses its own profile level and keeps a sequential production queue", (producerId, field) => {
    // Isolate producer-level timing and queue behavior from catalog prerequisites.
    const producer: PlannerItem = { ...factions.light.items.find(item => item.id === "barracks")!,
        id: producerId, name: producerId, buildingId: producerId, prerequisites: [], requirements: [], limit: undefined }
    const unit: PlannerItem = { ...factions.light.items.find(item => item.id === "swordsman")!,
        id: "test-unit", producer: producer.name, producerBuildingId: producerId,
        prerequisites: [], requirements: [], seconds: 100 }
    const economy = { ...economyFromProfile(initialGameProfile), [field]: 21, startingGold: 100000, startingWood: 100000 }
    const order = producerId === "castle" ? [unit, unit] : [producer, unit, unit]
    const { plan } = simulateBuildOrder(order, economy, 10, 100, economy.foodPerFarm, "Castle")
    expect(plan.every(action => !action.blocked)).toBe(true)
    const units = plan.filter(action => action.item.id === "test-unit")
    expect(units[0].finishTime! - units[0].startTime!).toBeCloseTo(94)
    expect(units[1].startTime).toBe(units[0].finishTime)
    const constructed = plan.find(action => action.item.kind === "building")
    if (constructed) expect(constructed.finishTime! - constructed.startTime!).toBe(producer.seconds)
    expect(productionDuration({ ...unit, producerBuildingId: "unknown-producer" }, economy)).toBe(100)
    expect(productionDuration({ ...unit, kind: "upgrade" }, economy)).toBe(100)
})

test("farm level changes food gating for both factions", () => {
    for (const faction of Object.values(factions)) {
        const food = faction.items.find(item => item.id === "farm" || item.id === "pigsty")!
        const worker = faction.items.find(item => item.name === faction.workerName)!
        for (const farmLevel of [1, 21]) {
            const economy = economyFromProfile({ ...initialGameProfile,
                player: { ...initialGameProfile.player, farmLevel, startingGold: 10000, startingWood: 10000 } })
            const { plan } = simulateBuildOrder([food, worker], economy, 39, 20, economy.foodPerFarm, faction.startingTownHall)
            expect(plan[1].blocked).toBe(farmLevel === 1)
        }
    }
})

test.each(playerLevelFields)("%s round trips exactly, rejects invalid levels,", field => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, [field]: 24 } }
    const doc = JSON.parse(serializeBuildOrder("light", profile, []))
    const parsed = parseBuildOrder(JSON.stringify(doc)).gameProfile
    expect(parsed).toEqual(profile)
    expect(economyFromProfile(parsed).goldPerTrip).toBe(field === "townHallLevel" ? 55 : 50)
    for (const invalid of [0, -1, 1.5, 25, "5", null]) {
        doc.gameProfile.player[field] = invalid
        expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow(field)
    }
    expect(Object.values(initialPlayerLevels)).toEqual(Array(playerLevelFields.length).fill(1))
})

test("older profiles default Shipyard and Altar progression to level 1", () => {
    const { shipyardLevel, altarOfHeroesLevel, ...player } = initialGameProfile.player
    expect(parseGameProfile({ ...initialGameProfile, player }).player).toEqual(initialGameProfile.player)
})

test.each([
    [1, 0.99], [4, 0.99], [5, 0.98], [8, 0.98], [9, 0.97], [12, 0.97],
    [13, 0.96], [16, 0.96], [17, 0.95], [20, 0.95], [21, 0.94], [24, 0.94],
])("level %s reduces all catalog ships and heroes for both factions", (level, multiplier) => {
    const levels = { ...initialPlayerLevels, shipyardLevel: level, altarOfHeroesLevel: level }
    for (const faction of Object.values(factions)) {
        const recruits = faction.items.filter(item => item.kind === "hero" || item.producerBuildingId === "shipyard")
        expect(recruits).toHaveLength(5)
        for (const recruit of recruits) {
            expect(actionDuration(recruit, levels)).toBeCloseTo(recruit.seconds * multiplier)
        }
    }
})

test.each([
    [1, 1], [4, 1], [5, 0.99], [8, 0.99], [9, 0.98], [12, 0.98],
    [13, 0.97], [16, 0.97], [17, 0.96], [20, 0.96], [21, 0.95], [24, 0.95],
])("worker level %s changes construction and upgrades but keeps travel and recruitment independent", (workerLevel, multiplier) => {
    for (const faction of Object.values(factions)) {
        const economy = { ...economyFromProfile(initialGameProfile), workerLevel,
            startingGold: 100000, startingWood: 100000, workerCount: 1, goldWorkers: 0, woodWorkers: 1 }
        const barracks = faction.items.find(item => item.id === "barracks")!
        const worker = faction.items.find(item => item.name === faction.workerName)!
        const upgrade = faction.items.find(item => item.kind === "upgrade")!
        const { plan } = simulateBuildOrder([barracks, barracks], economy, 2, 100, 20, faction.startingTownHall)
        expect(plan.every(action => !action.blocked)).toBe(true)
        const first = plan[0]
        expect(first.startTime! - first.commandTime!).toBe(4)
        expect(first.finishTime! - first.startTime!).toBeCloseTo(30 * multiplier)
        expect(first.workerReturnTime! - first.finishTime!).toBe(4)
        // The same builder must become free at the reduced return time, not the base return time.
        expect(plan[1].commandTime).toBe(first.workerReturnTime)
        expect(actionDuration(worker, economy)).toBeCloseTo(worker.seconds * 0.99)
        const simplifiedUpgrade = { ...upgrade, prerequisites: [faction.startingTownHall], requirements: [] }
        const upgraded = simulateBuildOrder([simplifiedUpgrade], economy, 2, 100, 20, faction.startingTownHall).plan[0]
        expect(upgraded.blocked).toBe(false)
        expect(upgraded.finishTime! - upgraded.startTime!).toBeCloseTo(upgrade.seconds * multiplier)
    }
})
