import { initialPlayerLevels } from "./playerLevels"
import { GAME_RULES_VERSION, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./buildOrderFile"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type FactionId } from "./gameData"
import { economyFromProfile } from "./gameProfile"

const profile: GameProfile = {
    basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1, manaPerMinute: 10 },
    map: { goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5 },
    player: { startingGold: 2000, startingWood: 2000, baseFoodLimit: 24, startingMana: 35, baseManaLimit: 50, ...initialPlayerLevels },
    delays: { constructionStartDelay: 2.5, orderDelay: 1 },
}
function sample(faction: FactionId = "light", timings = false) {
    const ids = faction === "light" ? ["barracks", "swordsman", "swordsman"] : ["barracks", "goon", "goon"]
    const order = ids.map(id => factions[faction].items.find(item => item.id === id)!)
    const plan = simulateBuildOrder(order, economyFromProfile(profile), 10, profile.player.baseFoodLimit,
        economyFromProfile(profile).foodPerFarm, factions[faction].startingTownHall).plan
    return serializeBuildOrder(faction, profile, plan, timings)
}

test.each<FactionId>(["light", "dark"])("%s round trip preserves profile, order and duplicates and reproduces the schedule", faction => {
    const text = sample(faction)
    const result = parseBuildOrder(text)
    expect(result.faction).toBe(faction)
    expect(result.gameProfile).toEqual(profile)
    expect(result.warning).toBeNull()
    expect(Object.keys(JSON.parse(text).gameProfile)).toEqual(["basic", "map", "player", "delays"])
    expect(JSON.parse(text).gameProfile.map.workerCount).toBeUndefined()
    expect(JSON.parse(text).buildOrder.every((action: object) => !("timings" in action))).toBe(true)
    const plan = simulateBuildOrder(result.buildOrder, economyFromProfile(result.gameProfile), 10, result.gameProfile.player.baseFoodLimit,
        economyFromProfile(result.gameProfile).foodPerFarm, factions[faction].startingTownHall).plan
    expect(serializeBuildOrder(faction, profile, plan, true)).toBe(sample(faction, true))
})

test("optional timings stay inside each action and even malformed timings are ignored on import", () => {
    const doc = JSON.parse(sample("light", true))
    expect(doc.buildOrder[1].timings).toEqual({ commandTime: 1, startTime: 3.5, finishTime: 33.5, workerReturnTime: 36 })
    doc.buildOrder.forEach((action: { timings: unknown }) => { action.timings = "invalid cached data" })
    expect(parseBuildOrder(JSON.stringify(doc))).toEqual(parseBuildOrder(sample()))
})

test("different game rules warn but import uses current catalog", () => {
    const doc = JSON.parse(sample())
    for (const version of ["old-rules", "future-rules"]) {
        doc.gameRulesVersion = version
        const result = parseBuildOrder(JSON.stringify(doc))
        expect(result.warning).toContain("current rules")
        expect(result.buildOrder[0]).toBe(factions.light.items.find(item => item.id === "barracks"))
    }
    expect(GAME_RULES_VERSION).toBeTruthy()
})

test("blocked actions are preserved without adding prerequisites and export null timings", () => {
    const doc = JSON.parse(sample())
    doc.buildOrder = [doc.buildOrder[0], { itemId: "swordsman" }]
    const result = parseBuildOrder(JSON.stringify(doc))
    expect(result.buildOrder.map(item => item.id)).toEqual(["swordsman"])
    const plan = simulateBuildOrder(result.buildOrder, economyFromProfile(result.gameProfile), 10, 24, 18, "Castle").plan
    expect(plan[0].blocked).toBe(true)
    expect(JSON.parse(serializeBuildOrder("light", profile, plan, true)).buildOrder[1].timings).toEqual({
        commandTime: null, startTime: null, finishTime: null, workerReturnTime: null,
    })
})

test("empty orders import and derived worker counts cannot be overridden", () => {
    const doc = JSON.parse(sample())
    doc.buildOrder = [doc.buildOrder[0]]
    doc.gameProfile.map.workerCount = 999
    expect(economyFromProfile(parseBuildOrder(JSON.stringify(doc)).gameProfile).workerCount).toBe(5)
    expect(parseBuildOrder(JSON.stringify(doc)).buildOrder).toEqual([])
})

test("custom values in every block round trip with unchanged format and rules versions", () => {
    const doc = JSON.parse(sample())
    doc.gameProfile.basic.initialGoldTravelReduction = 2.5
    doc.gameProfile.map.sawmillWoodTravelTime = 1.25
    doc.gameProfile.map.goldTravelTime = 2.5
    doc.gameProfile.map.woodTravelTime = 1.5
    doc.gameProfile.delays.orderDelay = 3.5
    const result = parseBuildOrder(JSON.stringify(doc))
    const economy = economyFromProfile(result.gameProfile)
    const plan = simulateBuildOrder(result.buildOrder, economy, 10, 24, 18, "Castle").plan
    expect(plan[0].commandTime).toBe(3.5)
    const exported = JSON.parse(serializeBuildOrder("light", result.gameProfile, plan))
    expect(exported.gameProfile).toEqual(doc.gameProfile)
    expect(exported.version).toBe(2)
    expect(exported.gameRulesVersion).toBe(GAME_RULES_VERSION)
    expect(economy.initialGoldTravelReduction).toBe(2.5)
    expect(economy.sawmillWoodTravelTime).toBe(1.25)
    expect(economy.goldTravelTime).toBe(2.5)
    expect(economy.woodTravelTime).toBe(1.5)
})

test.each([
    ["unsupported format", (doc: any) => { doc.format = "other" }],
    ["unsupported version", (doc: any) => { doc.version = 1 }],
    ["invalid faction", (doc: any) => { doc.faction = "other" }],
    ["unknown item", (doc: any) => { doc.buildOrder[1].itemId = "unknown" }],
    ["wrong faction item", (doc: any) => { doc.buildOrder[1].itemId = "goon" }],
    ["negative resources", (doc: any) => { doc.gameProfile.player.startingGold = -1 }],
    ["fractional workers", (doc: any) => { doc.buildOrder[0].goldWorkers = 1.5 }],
    ["zero gathering duration", (doc: any) => { doc.gameProfile.basic.goldGatherTime = 0 }],
    ["missing profile", (doc: any) => { delete doc.gameProfile }],
    ["missing rules version", (doc: any) => { delete doc.gameRulesVersion }],
    ["oversized allocation", (doc: any) => { doc.buildOrder[0].goldWorkers = 1001 }],
    ["missing basic", (doc: any) => { delete doc.gameProfile.basic }],
    ["missing map", (doc: any) => { delete doc.gameProfile.map }],
    ["missing player", (doc: any) => { delete doc.gameProfile.player }],
    ["missing delays", (doc: any) => { delete doc.gameProfile.delays }],
    ["missing initial delay", (doc: any) => { delete doc.gameProfile.delays.orderDelay }],
    ["negative initial delay", (doc: any) => { doc.gameProfile.delays.orderDelay = -1 }],
    ["missing sawmill travel", (doc: any) => { delete doc.gameProfile.map.sawmillWoodTravelTime }],
    ["negative sawmill travel", (doc: any) => { doc.gameProfile.map.sawmillWoodTravelTime = -1 }],
    ["missing gold travel", (doc: any) => { delete doc.gameProfile.map.goldTravelTime }],
    ["missing wood travel", (doc: any) => { delete doc.gameProfile.map.woodTravelTime }],
    ["negative gold travel", (doc: any) => { doc.gameProfile.map.goldTravelTime = -1 }],
    ["negative wood travel", (doc: any) => { doc.gameProfile.map.woodTravelTime = -1 }],
    ["missing initial gold reduction", (doc: any) => { delete doc.gameProfile.basic.initialGoldTravelReduction }],
    ["negative initial gold reduction", (doc: any) => { doc.gameProfile.basic.initialGoldTravelReduction = -1 }],
])("rejects %s", (_name, mutate) => {
    const doc = JSON.parse(sample())
    mutate(doc)
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow()
})

test("invalid JSON has a readable error", () => {
    expect(() => parseBuildOrder("{")).toThrow("not valid JSON")
})

test.each([0, 2, 5])("opening allocation %s round trips and reproduces resource deliveries", goldWorkers => {
    const opening = { type: "allocate-workers" as const, goldWorkers }
    const worker = factions.light.items.find(item => item.id === "worker")!
    const economy = economyFromProfile(profile, opening)
    const simulated = simulateBuildOrder([worker], economy, 10, 24, 20, "Castle")
    const text = serializeBuildOrder("light", profile, simulated.plan, true, opening)
    const doc = JSON.parse(text)
    expect(doc.buildOrder[0]).toEqual(opening)
    expect(doc.gameProfile.map.goldWorkers).toBeUndefined()
    expect(doc.gameProfile.map.woodWorkers).toBeUndefined()
    const imported = parseBuildOrder(text)
    expect(imported.opening).toEqual(opening)
    const recalculated = simulateBuildOrder(imported.buildOrder, economyFromProfile(imported.gameProfile, imported.opening), 10, 24, 20, "Castle")
    expect(recalculated).toEqual(simulated)
})

test.each([
    ["missing opening", (doc: any) => { doc.buildOrder.shift() }],
    ["empty actions", (doc: any) => { doc.buildOrder = [] }],
    ["negative allocation", (doc: any) => { doc.buildOrder[0].goldWorkers = -1 }],
    ["missing allocation", (doc: any) => { delete doc.buildOrder[0].goldWorkers }],
    ["allocation exceeds count", (doc: any) => { doc.buildOrder[0].goldWorkers = 6 }],
    ["duplicate opening", (doc: any) => { doc.buildOrder.push(doc.buildOrder[0]) }],
    ["misplaced opening", (doc: any) => { doc.buildOrder.reverse() }],
])("rejects %s without accepting an ambiguous opening", (_name, mutate) => {
    const doc = JSON.parse(sample())
    mutate(doc)
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow()
})
