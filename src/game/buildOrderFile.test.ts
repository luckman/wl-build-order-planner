import { initialPlayerLevels } from "./playerLevels"
import { GAME_RULES_VERSION, parseBuildOrder, serializeBuildOrder, type GameProfile } from "./buildOrderFile"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type FactionId } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"

const profile: GameProfile = {
    basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1, timeBetweenScrolls: 10 },
    map: { ...initialGameProfile.map, goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5 },
    player: { startingGold: 2000, startingWood: 2000, baseFoodLimit: 24, startingMana: 35, baseManaLimit: 50, lightGoldRushLevel: 1, lightLumberGatheringLevel: 1, darkWhipLevel: 1, darkLegionsCallLevel: 1,
        manaAccumulation: 10, manaFromManaWells: 60, scrollCooldownReduction: 0, massConstructionCostReduction: 12.5,
        goldMiningTimeReduction: 0, woodMiningTimeReduction: 0, ...initialPlayerLevels },
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

test("empty orders import", () => {
    const doc = JSON.parse(sample())
    doc.buildOrder = [doc.buildOrder[0]]
    expect(parseBuildOrder(JSON.stringify(doc)).buildOrder).toEqual([])
})

test("every missing profile field or block uses its default and unknown fields are discarded", () => {
    const original = JSON.parse(sample())
    for (const [block, defaults] of Object.entries(initialGameProfile)) {
        for (const [key, value] of Object.entries(defaults)) {
            const doc = JSON.parse(sample())
            delete doc.gameProfile[block][key]
            expect((parseBuildOrder(JSON.stringify(doc)).gameProfile[block as keyof GameProfile] as any)[key]).toBe(value)
        }
        const doc = JSON.parse(sample())
        delete doc.gameProfile[block]
        expect(parseBuildOrder(JSON.stringify(doc)).gameProfile[block as keyof GameProfile]).toEqual(defaults)
    }
    delete original.gameProfile
    expect(parseBuildOrder(JSON.stringify(original)).gameProfile).toEqual(initialGameProfile)
    original.gameProfile = { player: { startingGold: 777, unknownSetting: 123 }, unknownBlock: { value: 5 } }
    const expected = { ...initialGameProfile, player: { ...initialGameProfile.player, startingGold: 777 } }
    expect(parseBuildOrder(JSON.stringify(original)).gameProfile).toEqual(expected)
    expect(JSON.parse(serializeBuildOrder("light", original.gameProfile, [])).gameProfile).toEqual(expected)
})

test("custom values in every block round trip with unchanged format and rules versions", () => {
    const doc = JSON.parse(sample())
    doc.gameProfile.basic.initialGoldTravelReduction = 2.5
    doc.gameProfile.map.sawmillWoodTravelTime = 1.25
    doc.gameProfile.map.woodTravelTimeIncreaseBase = 0.75
    doc.gameProfile.map.maxWoodTravelTime = 6.5
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
    expect(economy.woodTravelTimeIncreaseBase).toBe(0.75)
    expect(economy.maxWoodTravelTime).toBe(6.5)
    expect(economy.goldTravelTime).toBe(2.5)
    expect(economy.woodTravelTime).toBe(1.5)
})

test.each([
    ["unsupported format", (doc: any) => { doc.format = "other" }],
    ["unsupported version", (doc: any) => { doc.version = 1 }],
    ["invalid faction", (doc: any) => { doc.faction = "other" }],
    ["unknown item", (doc: any) => { doc.buildOrder[1].itemId = "unknown" }],
    ["wrong faction item", (doc: any) => { doc.buildOrder[1].itemId = "goon" }],
    ...[-1, 100.1, null, "5"].map(value => ["invalid mass construction reduction " + value, (doc: any) => { doc.gameProfile.player.massConstructionCostReduction = value } ] as const),
    ["negative resources", (doc: any) => { doc.gameProfile.player.startingGold = -1 }],
    ["null profile", (doc: any) => { doc.gameProfile = null }],
    ["null player block", (doc: any) => { doc.gameProfile.player = null }],
    ["null gold setting", (doc: any) => { doc.gameProfile.player.startingGold = null }],
    ["fractional workers", (doc: any) => { doc.buildOrder[0].goldWorkers = 1.5 }],
    ["zero gathering duration", (doc: any) => { doc.gameProfile.basic.goldGatherTime = 0 }],
    ["missing rules version", (doc: any) => { delete doc.gameRulesVersion }],
    ["oversized allocation", (doc: any) => { doc.buildOrder[0].goldWorkers = 1001 }],
    ["negative initial delay", (doc: any) => { doc.gameProfile.delays.orderDelay = -1 }],
    ["negative sawmill travel", (doc: any) => { doc.gameProfile.map.sawmillWoodTravelTime = -1 }],
    ...["woodTravelTimeIncreaseBase", "maxWoodTravelTime"].flatMap(key =>
        [-1, null, "5", 1801].map(value => [`invalid ${key}: ${value}`, (doc: any) => { doc.gameProfile.map[key] = value }] as const)),
    ["negative gold travel", (doc: any) => { doc.gameProfile.map.goldTravelTime = -1 }],
    ["negative wood travel", (doc: any) => { doc.gameProfile.map.woodTravelTime = -1 }],
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
