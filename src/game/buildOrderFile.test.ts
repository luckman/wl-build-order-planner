import { GAME_RULES_VERSION, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./buildOrderFile"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type FactionId } from "./gameData"

const profile: GameProfile = {
    economy: {
        startingGold: 2000, startingWood: 2000, goldWorkers: 4, woodWorkers: 1,
        goldPerTrip: 50, woodPerTrip: 50, goldOutboundTravel: 4, goldReturnTravel: 4,
        goldGatherTime: 3.1, woodOutboundTravel: 4, woodReturnTravel: 4, woodGatherTime: 12.1,
        constructionStartDelay: 2.5,
    }, baseFoodLimit: 24, foodPerFarm: 18,
}
function sample(faction: FactionId = "light", timings = false) {
    const ids = faction === "light" ? ["barracks", "swordsman", "swordsman"] : ["barracks", "goon", "goon"]
    const order = ids.map(id => factions[faction].items.find(item => item.id === id)!)
    const plan = simulateBuildOrder(order, { ...profile.economy, workerCount: 5 }, 10, profile.baseFoodLimit,
        profile.foodPerFarm, factions[faction].startingTownHall).plan
    return serializeBuildOrder(faction, profile, plan, timings)
}

test.each<FactionId>(["light", "dark"])("%s round trip preserves profile, order and duplicates and reproduces the schedule", faction => {
    const text = sample(faction)
    const result = parseBuildOrder(text)
    expect(result.faction).toBe(faction)
    expect(result.economy).toEqual({ ...profile.economy, workerCount: 5 })
    expect(result.baseFoodLimit).toBe(24)
    expect(result.foodPerFarm).toBe(18)
    expect(result.warning).toBeNull()
    expect(JSON.parse(text).gameProfile.economy.workerCount).toBeUndefined()
    expect(JSON.parse(text).buildOrder.every((action: object) => !("timings" in action))).toBe(true)
    const plan = simulateBuildOrder(result.buildOrder, result.economy, 10, result.baseFoodLimit,
        result.foodPerFarm, factions[faction].startingTownHall).plan
    expect(serializeBuildOrder(faction, profile, plan, true)).toBe(sample(faction, true))
})

test("optional timings stay inside each action and even malformed timings are ignored on import", () => {
    const doc = JSON.parse(sample("light", true))
    expect(doc.buildOrder[0].timings).toEqual({ commandTime: 1, startTime: 3.5, finishTime: 33.5, workerReturnTime: 36 })
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
    doc.buildOrder = [{ itemId: "swordsman" }]
    const result = parseBuildOrder(JSON.stringify(doc))
    expect(result.buildOrder.map(item => item.id)).toEqual(["swordsman"])
    const plan = simulateBuildOrder(result.buildOrder, result.economy, 10, 24, 18, "Castle").plan
    expect(plan[0].blocked).toBe(true)
    expect(JSON.parse(serializeBuildOrder("light", profile, plan, true)).buildOrder[0].timings).toEqual({
        commandTime: null, startTime: null, finishTime: null, workerReturnTime: null,
    })
})

test("empty orders import and derived worker counts cannot be overridden", () => {
    const doc = JSON.parse(sample())
    doc.buildOrder = []
    doc.gameProfile.economy.workerCount = 999
    expect(parseBuildOrder(JSON.stringify(doc)).economy.workerCount).toBe(5)
    expect(parseBuildOrder(JSON.stringify(doc)).buildOrder).toEqual([])
})

test.each([
    ["unsupported format", (doc: any) => { doc.format = "other" }],
    ["unsupported version", (doc: any) => { doc.version = 2 }],
    ["invalid faction", (doc: any) => { doc.faction = "other" }],
    ["unknown item", (doc: any) => { doc.buildOrder[1].itemId = "unknown" }],
    ["wrong faction item", (doc: any) => { doc.buildOrder[1].itemId = "goon" }],
    ["negative resources", (doc: any) => { doc.gameProfile.economy.startingGold = -1 }],
    ["fractional workers", (doc: any) => { doc.gameProfile.economy.goldWorkers = 1.5 }],
    ["zero gathering duration", (doc: any) => { doc.gameProfile.economy.goldGatherTime = 0 }],
    ["missing profile", (doc: any) => { delete doc.gameProfile }],
    ["missing rules version", (doc: any) => { delete doc.gameRulesVersion }],
    ["oversized allocation", (doc: any) => { doc.gameProfile.economy.goldWorkers = 1001 }],
])("rejects %s", (_name, mutate) => {
    const doc = JSON.parse(sample())
    mutate(doc)
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow()
})

test("invalid JSON has a readable error", () => {
    expect(() => parseBuildOrder("{")).toThrow("not valid JSON")
})
