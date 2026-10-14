import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { simulateBuildOrder } from "./buildSimulation"
import { draftStorageKey, loadFactionDrafts, saveFactionDrafts } from "./draftStorage"
import { factions } from "./gameData"
import { economyFromProfile, initialGameProfile, initialOpeningAction } from "./gameProfile"
import { createManaWellAction } from "./manaWells"
import { MAX_COMMAND_SECONDS, MAX_PLAN_ACTIONS, MAX_PLAN_SECONDS } from "./plannerLimits"
import { createResourceAction } from "./resourceEvents"
import { WorkerEconomy } from "./resourceSimulation"
import { createScrollAction } from "./scrolls"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { createUnitLossAction } from "./unitLosses"
import { deflate } from "pako"

const economy = economyFromProfile(initialGameProfile)
const resource = (commandTime: number) => createResourceAction({ type: "add-resources", commandTime, gold: 1, wood: 1 })
const simulate = (items: Parameters<typeof simulateBuildOrder>[0], settings = economy) =>
    simulateBuildOrder(items, settings, 10, 20, 20, "Castle")
const profiles = { light: initialGameProfile, dark: initialGameProfile }

afterEach(() => window.localStorage.clear())

test.each([
    resource,
    (commandTime: number) => createManaWellAction({ type: "capture-mana-well", commandTime }),
    (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime }, "light"),
    (commandTime: number) => createUnitLossAction({ type: "lose-unit", unitId: "worker", commandTime }, "light"),
])("event factories accept 29:59 and reject unsupported timestamps", create => {
    expect(create(MAX_COMMAND_SECONDS).commandTime).toBe(MAX_COMMAND_SECONDS)
    for (const time of [MAX_COMMAND_SECONDS + 0.001, MAX_PLAN_SECONDS, 1e100]) expect(() => create(time)).toThrow()
})

test("100 actions round trip through files, links and drafts; 101 cannot be exported, simulated or saved", () => {
    const items = Array.from({ length: MAX_PLAN_ACTIONS }, () => resource(0))
    const plan = simulate(items).plan
    const json = serializeBuildOrder("light", initialGameProfile, plan)
    expect(parseBuildOrder(json).buildOrder).toHaveLength(MAX_PLAN_ACTIONS)
    const link = createShareableLink("https://example.com/", "light", initialGameProfile, plan)
    expect(parseShareableLink(new URL(link).hash)?.buildOrder).toHaveLength(MAX_PLAN_ACTIONS)
    const draft = { opening: initialOpeningAction, items }
    saveFactionDrafts({ light: draft, dark: { ...draft, items: [] } }, profiles)
    expect(loadFactionDrafts(profiles).light.items).toHaveLength(MAX_PLAN_ACTIONS)
    const previous = window.localStorage.getItem(draftStorageKey("light"))
    const oversized = [...items, resource(0)]
    expect(() => simulate(oversized)).toThrow("100")
    expect(() => serializeBuildOrder("light", initialGameProfile, [...plan, plan[0]])).toThrow("100")
    expect(() => createShareableLink("https://example.com/", "light", initialGameProfile, [...plan, plan[0]])).toThrow("100")
    const doc = JSON.parse(json)
    doc.buildOrder.push(doc.buildOrder[1])
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("100")
    saveFactionDrafts({ light: { ...draft, items: oversized }, dark: { ...draft, items: [] } }, profiles)
    expect(window.localStorage.getItem(draftStorageKey("light"))).toBe(previous)
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify(doc.buildOrder))
    expect(loadFactionDrafts(profiles).light.items).toEqual([])
})

test("hostile profile durations and gathering cycles fail validation before simulation", () => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    for (const [block, key] of [["basic", "goldGatherTime"], ["basic", "timeBetweenScrolls"], ["map", "woodTravelTime"], ["delays", "orderDelay"]]) {
        const invalid = JSON.parse(JSON.stringify(doc))
        invalid.gameProfile[block][key] = 1e100
        expect(() => parseBuildOrder(JSON.stringify(invalid))).toThrow("30:00")
        expect(() => serializeBuildOrder("light", invalid.gameProfile, [])).toThrow("30:00")
    }
    doc.gameProfile.basic.woodGatherTime = 0.001
    doc.gameProfile.map.woodTravelTime = 0
    doc.gameProfile.map.sawmillWoodTravelTime = 0
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("budget")
    expect(() => new WorkerEconomy(economyFromProfile(doc.gameProfile))).toThrow("budget")
    // Effective gathering times after equipment reductions must pass the same check.
    doc.gameProfile.basic.woodGatherTime = 1
    doc.gameProfile.player.woodMiningTimeReduction = 1
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow("budget")
})

test("simulation remains within 30 minutes and blocks late construction and builder returns", () => {
    const scroll = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: MAX_COMMAND_SECONDS }, "light")
    const result = simulate([resource(MAX_COMMAND_SECONDS), scroll], { ...economy, startingMana: 100, baseManaLimit: 100 })
    expect(result.plan[1].blocked).toBe(true)
    expect(result.plan[1].finishTime).toBeNull()
    expect(result.plan[1].blockedReason).toContain("30:00")
    const onTime = simulate([createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering",
        commandTime: MAX_PLAN_SECONDS - 31 }, "light")]).plan[0]
    expect(onTime.blocked).toBe(false)
    expect(onTime.finishTime).toBe(MAX_PLAN_SECONDS)
    expect(result.deliveries.every(delivery => delivery.time <= MAX_PLAN_SECONDS)).toBe(true)
    const sawmill = factions.light.items.find(item => item.id === "sawmill")!
    const late = simulate([sawmill], { ...economy, startingGold: 10000, startingWood: 10000, constructionStartDelay: 900 }).plan[0]
    expect(late.blocked).toBe(true)
    expect(late.blockedReason).toContain("30:00")
    expect(() => simulateBuildOrder([], economy, 10, 20, 20, "Castle", 1e100)).toThrow("30:00")
    expect(() => new WorkerEconomy(economy).advanceTo(1e100)).toThrow("30:00")
})

test("untrusted timestamps cannot bypass limits through links or saved drafts", () => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, []))
    doc.buildOrder.push({ type: "add-resources", commandTime: 1e100, gold: 0, wood: 0 })
    const payload = btoa(Array.from(deflate(JSON.stringify(doc)), byte => String.fromCharCode(byte)).join(""))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    expect(() => parseShareableLink(`#build=2.${payload}`)).toThrow("29:59")
    window.localStorage.setItem(draftStorageKey("light"), JSON.stringify(doc.buildOrder))
    expect(loadFactionDrafts(profiles).light.items).toEqual([])
})
