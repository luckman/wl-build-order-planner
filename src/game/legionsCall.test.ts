import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { actionDuration } from "./playerLevels"
import { createScrollAction, scrollEffect } from "./scrolls"
import { manaAt } from "./resourceSimulation"
import { productionBuildingsAt, recruitmentFinish } from "./recruitment"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { loadFactionDrafts, saveFactionDrafts } from "./draftStorage"
import { createResourcesCollectedAction } from "./resourcesCollected"

const settings = { ...economyFromProfile(initialGameProfile), startingGold: 100000, startingWood: 100000,
    startingMana: 500, baseManaLimit: 500, orderDelay: 0, constructionStartDelay: 0,
    workerCount: 5, goldWorkers: 0, woodWorkers: 5 }
const item = (id: string) => factions.dark.items.find(item => item.id === id)!
const barracks = item("barracks"), goon = item("goon")
const cast = (commandTime: number, targetItemId = "barracks") =>
    createScrollAction({ type: "use-scroll", scrollId: "legions-call", commandTime, targetItemId }, "dark")
const simulate = (items: PlannerItem[], economy = settings) =>
    simulateBuildOrder(items, economy, 10, 200, 20, "Citadel", 200)

test.each([
    [1, 0.20, 25], [2, 0.21, 25.1], [3, 0.22, 25.3],
    [4, 0.23, 25.6], [5, 0.24, 26], [6, 0.25, 26.5],
])("level %s applies its recruitment reduction and duration through expiry", (level, reduction, duration) => {
    const economy = { ...settings, darkLegionsCallLevel: level }
    expect(scrollEffect("legions-call", economy)).toMatchObject({ manaCost: 25, recruitmentTimeReduction: reduction, duration })
    const start = simulate([barracks, goon], economy).plan[1].startTime!
    const result = simulate([barracks, goon, goon, cast(start + 9)], economy).plan
    const activation = start + 10, work = actionDuration(goon, economy)
    const firstFinish = activation + (work - 10) * (1 - reduction)
    expect(result[3]).toMatchObject({ startTime: activation, finishTime: activation + duration })
    expect(result[1].finishTime).toBeCloseTo(firstFinish)
    const activeRemaining = activation + duration - firstFinish
    expect(result[2].finishTime).toBeCloseTo(firstFinish + work - activeRemaining * (1 / (1 - reduction) - 1))
})

test("target must be a faction production building; availability is checked at command time", () => {
    for (const target of [undefined, "unknown", "sawmill", "goon"]) {
        expect(() => createScrollAction({ type: "use-scroll", scrollId: "legions-call", commandTime: 1, targetItemId: target }, "dark")).toThrow("production building")
    }
    expect(() => createScrollAction({ type: "use-scroll", scrollId: "legions-call", commandTime: 1, targetItemId: "barracks" }, "light")).toThrow("Dark")
    const ready = simulate([barracks]).plan[0].finishTime!
    const blocked = simulate([barracks, cast(ready - 0.1)]).plan[1]
    expect(blocked.blockedReason).toContain("command timestamp")
    expect(manaAt(settings, [blocked], ready).mana).toBe(500)
    expect(simulate([barracks, cast(ready)]).plan[1]).toMatchObject({ blocked: false, manaCost: 25, startTime: ready + 1, finishTime: ready + 26 })
    expect(simulate([cast(ready), barracks]).plan[0].blocked).toBe(false)
})

test.each(factions.dark.items.filter(target => target.buildingId === "citadel"))(
    "$name is a target and accelerates Slave recruitment at its exact level", target => {
        const upgrades = factions.dark.items.filter(candidate => candidate.buildingId === "citadel" &&
            candidate.kind === "upgrade" && candidate.level! <= target.level!)
            .map(upgrade => ({ ...upgrade, requirements: [], prerequisites: [] }))
        const baseline = simulate(upgrades).plan
        const ready = baseline[baseline.length - 1]?.finishTime ?? 0
        const slave = item("slave")
        const result = simulate([...upgrades, slave, cast(ready, target.id)]).plan
        expect(result.every(action => !action.blocked)).toBe(true)
        expect(result[upgrades.length].finishTime).toBeCloseTo(ready + 1 + (actionDuration(slave, settings) - 1) * 0.8)
        expect(result.slice(0, upgrades.length).map(action => action.finishTime)).toEqual(baseline.map(action => action.finishTime))
        const json = serializeBuildOrder("dark", initialGameProfile, result)
        expect(parseBuildOrder(json).buildOrder[upgrades.length + 1]).toEqual(cast(ready, target.id))
    },
)

test("Citadel and production-building casts leave construction and upgrades unchanged", () => {
    const citadelUpgrade = { ...item("citadel-lvl-2"), requirements: [], prerequisites: [] }
    const barracksUpgrade = { ...item("barracks-lvl-2"), requirements: [], prerequisites: [] }
    const base = simulate([barracks, barracksUpgrade]).plan
    const ready = base[0].finishTime!
    const boosted = simulate([barracks, barracksUpgrade, cast(ready)]).plan
    expect(boosted[2].blocked).toBe(false)
    expect(boosted.slice(0, 2).map(action => action.finishTime)).toEqual(base.map(action => action.finishTime))
    const citadelBase = simulate([item("citadel"), citadelUpgrade]).plan
    const citadelCast = simulate([item("citadel"), citadelUpgrade, cast(0, "citadel")]).plan
    expect(citadelCast[2].blocked).toBe(false)
    expect(citadelCast.slice(0, 2).map(action => action.finishTime)).toEqual(citadelBase.map(action => action.finishTime))
})

test("a mid-recruitment cast accelerates only remaining work and expires during the next unit", () => {
    const baseline = simulate([barracks, goon, goon]).plan
    const start = baseline[1].startTime!, work = actionDuration(goon, settings)
    const command = start + 9
    const result = simulate([barracks, goon, goon, cast(command)])
    const activation = command + 1
    const firstFinish = activation + (work - 10) * 0.8
    expect(result.plan[1].finishTime).toBeCloseTo(firstFinish)
    expect(result.plan[2].startTime).toBeCloseTo(firstFinish)
    const activeRemaining = activation + 25 - firstFinish
    expect(result.plan[2].finishTime).toBeCloseTo(firstFinish + work - activeRemaining * 0.25)
    expect(simulate([cast(command), barracks, goon, goon]).plan.slice(1).map(action => action.finishTime))
        .toEqual(result.plan.slice(0, 3).map(action => action.finishTime))
})

test("recasting refreshes the duration without stacking productivity", () => {
    const windows = [
        { startTime: 0, finishTime: 25, buildingInstanceId: 1 },
        { startTime: 10, finishTime: 35, buildingInstanceId: 1 },
    ]
    expect(recruitmentFinish(0, 40, 1, windows)).toBe(32)
    expect(recruitmentFinish(30, 20, 1, windows)).toBe(48.75)
    expect(recruitmentFinish(0, 40, 2, windows)).toBe(40)
    const ready = simulate([barracks]).plan[0].finishTime!
    const result = simulate([barracks, goon, goon, cast(ready), cast(ready + 11)])
    expect(result.plan[3].blocked).toBe(false)
    expect(result.plan[4].blocked).toBe(false)
    expect(result.plan[2].finishTime).toBeCloseTo(ready + 2 * actionDuration(goon, settings) - 36 * 0.25)
})

test("a cast selects the instance with most remaining work and future units choose earliest completion", () => {
    // Make construction brief so both instances are ready during the first recruit.
    const quickBarracks = { ...barracks, seconds: 1 }
    const baseline = simulate([quickBarracks, goon, quickBarracks, goon]).plan
    const command = baseline[3].startTime! + 1
    const result = simulate([quickBarracks, goon, quickBarracks, goon, goon, cast(command)]).plan
    expect(result[5].buildingInstanceId).toBe(result[3].buildingInstanceId)
    expect(result[5].buildingInstanceId).not.toBe(result[1].buildingInstanceId)
    expect(result[1].finishTime).toBe(baseline[1].finishTime)
    expect(result[3].finishTime!).toBeLessThan(baseline[3].finishTime!)
    expect(result[4].buildingInstanceId).toBe(result[3].buildingInstanceId)
})

test("target selection accounts for an earlier cast's remaining productivity", () => {
    const quickBarracks = { ...barracks, seconds: 3 }
    const result = simulate([quickBarracks, goon, quickBarracks, goon, cast(7), cast(18)]).plan
    expect(result.every(action => !action.blocked)).toBe(true)
    expect(result[4].buildingInstanceId).toBe(result[3].buildingInstanceId)
    // The second instance still has more base work, but will finish sooner with its
    // existing bonus. The new cast therefore targets the first instance.
    expect(result[5].buildingInstanceId).toBe(result[1].buildingInstanceId)
})

test("recruitment waits for a boosted busy producer when it beats an idle producer", () => {
    const quickBarracks = { ...barracks, seconds: 1 }
    const shortRecruit = { ...goon, seconds: 12 }
    const costlyRecruit = { ...goon, gold: 200000 }
    const resources = createResourcesCollectedAction({ type: "resources-collected", commandTime: 23, gold: 300000, wood: 0 })
    const plan = simulate([quickBarracks, shortRecruit, quickBarracks, goon, costlyRecruit, cast(3), resources]).plan
    expect(plan.every(action => !action.blocked)).toBe(true)
    expect(plan[1].finishTime!).toBeLessThan(23)
    expect(plan[3].finishTime!).toBeGreaterThan(23)
    expect(plan[4].buildingInstanceId).toBe(plan[3].buildingInstanceId)
    expect(plan[4].startTime).toBe(plan[3].finishTime)
    expect(plan[4].finishTime!).toBeLessThan(23 + actionDuration(costlyRecruit, settings))
})

test("a recruitment cast does not accidentally apply Whip to workers", () => {
    const baseline = simulate([barracks, goon])
    const ready = baseline.plan[0].finishTime!
    expect(simulate([barracks, goon, cast(ready)]).deliveries).toEqual(baseline.deliveries)
})

test("upgraded targets require the exact level and upgrades receive no recruitment bonus", () => {
    const upgrade = { ...item("barracks-lvl-2"), requirements: [], prerequisites: [] }
    const baseline = simulate([barracks, upgrade]).plan
    const ready = baseline[1].finishTime!
    const result = simulate([barracks, upgrade, cast(ready - 1, upgrade.id), cast(ready, upgrade.id)])
    expect(result.plan[2].blocked).toBe(true)
    expect(result.plan[3].blocked).toBe(false)
    expect(result.plan[1].finishTime).toBe(ready)
    const initial = item("citadel")
    expect(productionBuildingsAt(result.plan, initial, factions.dark.items, ready - 1).map(({ item }) => item.id)).toEqual(["citadel"])
    expect(productionBuildingsAt(result.plan, initial, factions.dark.items, ready).map(({ item }) => item.id)).toEqual(["citadel", upgrade.id])
    expect(simulate([barracks, upgrade, cast(ready)]).plan[2].blocked).toBe(true)
})

test("blocked mana and cooldown casts do not accelerate production or spend mana", () => {
    const ready = simulate([barracks]).plan[0].finishTime!
    const poor = { ...settings, startingMana: 0, manaPerMinute: 0 }
    expect(simulate([barracks, goon, cast(ready)], poor).plan[1].finishTime).toBe(simulate([barracks, goon], poor).plan[1].finishTime)
    const result = simulate([barracks, goon, cast(ready), cast(ready + 1)])
    expect(result.plan[3].blockedReason).toContain("cooldown")
    expect(result.plan[1].finishTime).toBe(simulate([barracks, goon, cast(ready)]).plan[1].finishTime)
})

test("targetItemId survives JSON with and without timings, links and drafts", () => {
    const ready = simulate([barracks]).plan[0].finishTime!
    const scroll = cast(ready)
    const result = simulate([barracks, scroll])
    for (const timings of [false, true]) {
        const json = serializeBuildOrder("dark", initialGameProfile, result.plan, timings)
        expect(JSON.parse(json).buildOrder[2].targetItemId).toBe("barracks")
        expect(parseBuildOrder(json).buildOrder[1]).toEqual(scroll)
        const malformed = JSON.parse(json)
        delete malformed.buildOrder[2].targetItemId
        expect(() => parseBuildOrder(JSON.stringify(malformed))).toThrow("production building")
    }
    const url = createShareableLink("https://example.com", "dark", initialGameProfile, result.plan)
    expect(parseShareableLink(new URL(url).hash)!.buildOrder[1]).toEqual(scroll)
    const opening = { type: "allocate-workers" as const, goldWorkers: 3 }
    saveFactionDrafts({ light: { opening, items: [] }, dark: { opening, items: [barracks, scroll] } }, { light: initialGameProfile, dark: initialGameProfile })
    expect(loadFactionDrafts({ light: initialGameProfile, dark: initialGameProfile }).dark.items[1]).toEqual(scroll)
})
