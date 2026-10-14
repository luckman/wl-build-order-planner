import { manaAt } from "./resourceSimulation"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { buildOrderWithDependencies, factions } from "./gameData"
import { simulateBuildOrder } from "./buildSimulation"

const economy = economyFromProfile(initialGameProfile)
const tower = { item: { id: "tower-of-mana", kind: "building" }, finishTime: 120 }

test.each([[0, 35], [30, 40], [60, 45], [90, 50], [600, 50]])(
    "mana at %s seconds regenerates to %s and caps at 50", (time, mana) => {
        expect(manaAt(economy, [], time)).toEqual({ time, mana, limit: 50 })
    },
)

test("completed towers raise capacity without granting mana or banking capped income", () => {
    expect(manaAt(economy, [tower], 119).limit).toBe(50)
    expect(manaAt(economy, [tower], 120)).toEqual({ time: 120, mana: 50, limit: 100 })
    expect(manaAt(economy, [tower], 150)).toEqual({ time: 150, mana: 55, limit: 100 })
    expect(manaAt(economy, [tower], 900).mana).toBe(100)
    const second = { ...tower, finishTime: 180 }
    expect(manaAt(economy, [second, tower], 240)).toEqual({ time: 240, mana: 70, limit: 150 })
    expect(manaAt(economy, [{ ...tower, finishTime: null }], 120).limit).toBe(50)
    expect(manaAt(economy, [{ ...tower, item: { ...tower.item, kind: "upgrade" } }], 120).limit).toBe(50)
})

test.each(["light", "dark"] as const)("%s scheduled Tower of Mana uses the profile level at completion", factionId => {
    const faction = factions[factionId]
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player,
        startingGold: 100000, startingWood: 100000, manaTowerLevel: 24 } }
    const settings = economyFromProfile(profile)
    const item = faction.items.find(item => item.id === "tower-of-mana")!
    const order = buildOrderWithDependencies(faction, [], item)
    const { plan } = simulateBuildOrder(order, settings, 10, 20, settings.foodPerFarm, faction.startingTownHall)
    const completion = plan.find(action => action.item.id === "tower-of-mana")!.finishTime!
    expect(completion).not.toBeNull()
    expect(manaAt(settings, plan, completion - 0.001).limit).toBe(50)
    expect(manaAt(settings, plan, completion).limit).toBe(105)
})

test("old exported profiles receive mana defaults and preserve existing settings", () => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    delete doc.gameProfile.player.startingMana
    delete doc.gameProfile.player.baseManaLimit
    delete doc.gameProfile.player.manaTowerLevel
    doc.gameProfile.player.startingGold = 777
    const parsed = parseBuildOrder(JSON.stringify(doc)).gameProfile
    expect(parsed.player).toMatchObject({ startingGold: 777, startingMana: 35, baseManaLimit: 50, manaTowerLevel: 1 })
    expect(parsed.player.manaAccumulation).toBe(10)
    expect(parsed.basic).not.toHaveProperty("manaPerMinute")
})

test("profile validation rejects starting mana above capacity and accepts equality", () => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    doc.gameProfile.player.startingMana = 75
    doc.gameProfile.player.baseManaLimit = 1
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("base mana capacity")
    doc.gameProfile.player.baseManaLimit = 75
    expect(parseBuildOrder(JSON.stringify(doc)).gameProfile.player.startingMana).toBe(75)
    doc.gameProfile.player.startingMana = 0
    doc.gameProfile.player.baseManaLimit = 0
    expect(parseBuildOrder(JSON.stringify(doc)).gameProfile.player.baseManaLimit).toBe(0)
})

test.each(["startingMana", "baseManaLimit", "manaTowerLevel", "manaAccumulation", "manaFromManaWells", "scrollCooldownReduction"])("invalid %s cannot enter a profile", field => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    doc.gameProfile.player[field] = -1
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow(field)
})

test("player mana settings round-trip, control regeneration, and have no well income without captures", () => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player,
        manaAccumulation: 20, manaFromManaWells: 999, scrollCooldownReduction: 5 } }
    const parsed = parseBuildOrder(serializeBuildOrder("light", profile, [])).gameProfile
    expect(parsed).toEqual(profile)
    expect(manaAt(economyFromProfile(parsed), [], 30).mana).toBe(45)
    const doc = JSON.parse(serializeBuildOrder("light", profile, []))
    doc.gameProfile.player.scrollCooldownReduction = 100.1
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("scrollCooldownReduction")
})
