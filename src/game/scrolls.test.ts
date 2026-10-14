import { createScrollAction } from "./scrolls"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { manaAt, WorkerEconomy, workerAllocationAt } from "./resourceSimulation"
import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions, PlannerItem } from "./gameData"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { loadFactionDrafts, saveFactionDrafts } from "./draftStorage"

const scroll = (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime }, "light")
const settings = { ...economyFromProfile(initialGameProfile), startingMana: 100, baseManaLimit: 100, orderDelay: 0 }
const simulate = (items: PlannerItem[], economy = settings, until = 200) =>
    simulateBuildOrder(items, economy, 10, 20, economy.foodPerFarm, "Castle", until)

test("fixed commands spend mana immediately and activate after one second for thirty seconds", () => {
    const { plan } = simulate([scroll(20)])
    expect(plan[0]).toMatchObject({ commandTime: 20, startTime: 21, finishTime: 51, blocked: false, manaCost: 50 })
    expect(manaAt(settings, plan, 19).mana).toBe(100)
    expect(manaAt(settings, plan, 20).mana).toBe(50)
    expect(manaAt(settings, plan, 50).mana).toBe(55)
})

test("insufficient mana retains the command with a warning, without spending or bonus", () => {
    const economy = economyFromProfile(initialGameProfile)
    const blocked = simulate([scroll(0)], economy)
    expect(blocked.plan[0]).toMatchObject({ commandTime: 0, blocked: true, startTime: null, finishTime: null })
    expect(blocked.plan[0].blockedReason).toContain("Insufficient mana")
    expect(blocked.deliveries).toEqual(simulate([], economy).deliveries)
    expect(manaAt(economy, blocked.plan, 0).mana).toBe(35)
})

test("mana validation runs chronologically, breaking equal-time ties by source order", () => {
    const first = scroll(0), second = scroll(0), later = scroll(2)
    const { plan, orderedPlan } = simulate([later, first, second], { ...settings, startingMana: 50, baseManaLimit: 50 })
    expect(plan.map(action => action.blocked)).toEqual([true, false, true])
    expect(orderedPlan.map(action => action.item)).toEqual([first, second, later])
})

test("repeated references are separate casts and blocked casts do not spend mana", () => {
    const item = scroll(0)
    const economy = { ...settings, startingMana: 50 }
    const { plan } = simulate([item, item], economy)
    expect(plan.map(action => action.blocked)).toEqual([false, true])
    expect(manaAt(economy, plan, 0).mana).toBe(0)
})

test("tower completions before a cast allow regeneration above the previous cap", () => {
    const economy = { ...settings, startingGold: 100000, startingWood: 100000,
        startingMana: 50, baseManaLimit: 50 }
    const tower = factions.light.items.find(item => item.id === "tower-of-mana")!
    const order = buildOrderWithDependencies(factions.light, [], tower)
    const towerFinish = simulate(order, economy).plan.find(action => action.item.id === tower.id)!.finishTime!
    expect(towerFinish).not.toBeNull()
    const { plan } = simulate([...order, scroll(towerFinish + 90), scroll(towerFinish + 100)], economy)
    expect(plan.every(action => action.item.kind === "scroll" || !action.blocked)).toBe(true)
    expect(plan.slice(-2).map(action => action.blocked)).toEqual([false, true])
    expect(manaAt(economy, plan, towerFinish + 100).limit).toBe(100)
})

test("commands beyond the usual horizon still validate and run their effects", () => {
    const { plan, deliveries } = simulate([scroll(650)])
    expect(plan[0]).toMatchObject({ blocked: false, commandTime: 650, startTime: 651, finishTime: 681 })
    expect(deliveries.some(delivery => delivery.time > 652 && delivery.gold === settings.goldPerTrip + 10)).toBe(true)
})

test("mine exit locks bonus cargo; exact start counts and exact expiry does not", () => {
    const economy = { ...settings, goldWorkers: 1, woodWorkers: 0, workerCount: 1,
        goldTravelTime: 2, initialGoldTravelReduction: 0, goldGatherTime: 4, goldPerTrip: 50 }
    const workers = new WorkerEconomy(economy)
    workers.scheduleGoldRush(6, 14, 10)
    workers.advanceTo(16)
    // Mine exits at 6 and 14, deposits at 8 and 16.
    expect(workers.deliveries.map(({ time, gold }) => ({ time, gold }))).toEqual([{ time: 8, gold: 60 }, { time: 16, gold: 50 }])
    const returning = new WorkerEconomy(economy)
    returning.scheduleGoldRush(3, 7, 10)
    returning.advanceTo(8)
    expect(returning.deliveries[0].gold).toBe(60) // Depositing after expiry retains cargo.
    const late = new WorkerEconomy(economy)
    late.scheduleGoldRush(7, 40, 10)
    late.advanceTo(8)
    expect(late.deliveries[0].gold).toBe(50) // Already outside when effect begins.
})

test("overlaps do not stack and all six levels use identical effects", () => {
    const overlap = simulate([scroll(0), scroll(10)])
    expect(overlap.plan.every(action => !action.blocked)).toBe(true)
    expect(Math.max(...overlap.deliveries.map(delivery => delivery.gold))).toBe(settings.goldPerTrip + 10)
    for (let level = 2; level <= 6; level++) expect(simulate([scroll(0)], { ...settings, scrollLevel: level }).deliveries).toEqual(simulate([scroll(0)]).deliveries)
})

test("scroll position does not change income or catalog scheduling; bonus can unblock an earlier row", () => {
    const worker = factions.light.items.find(item => item.id === "worker")!
    const economy = { ...settings, startingGold: 40, goldWorkers: 1, woodWorkers: 0, workerCount: 1,
        goldTravelTime: 2, initialGoldTravelReduction: 0, goldGatherTime: 4 }
    const before = simulate([scroll(0), worker], economy)
    const after = simulate([worker, scroll(0)], economy)
    expect(before.deliveries).toEqual(after.deliveries)
    expect(before.plan[1].commandTime).toBe(after.plan[0].commandTime)
    expect(after.plan[0].commandTime).toBeLessThan(simulate([worker], economy).plan[0].commandTime!)
    const catalogOnly = after.plan.filter(action => action.item.kind !== "scroll")
    expect(workerAllocationAt(economy, after.plan, 30)).toEqual(workerAllocationAt(economy, catalogOnly, 30))
})

test("required scroll timestamps round-trip through files, links, and faction drafts", () => {
    const { plan } = simulate([scroll(90)])
    for (const timings of [false, true]) {
        const text = serializeBuildOrder("light", initialGameProfile, plan, timings)
        const entry = JSON.parse(text).buildOrder[1]
        expect(entry).toMatchObject({ type: "use-scroll", scrollId: "gold-rush", commandTime: 90 })
        expect("timings" in entry).toBe(timings)
        expect(parseBuildOrder(text).buildOrder).toEqual([scroll(90)])
    }
    const url = createShareableLink("https://example.com/", "light", initialGameProfile, plan)
    expect(parseShareableLink(new URL(url).hash)!.buildOrder).toEqual([scroll(90)])
    const opening = { type: "allocate-workers" as const, goldWorkers: 4 }
    saveFactionDrafts({ light: { opening, items: [scroll(90)] }, dark: { opening, items: [] } }, { light: initialGameProfile, dark: initialGameProfile })
    expect(loadFactionDrafts({ light: initialGameProfile, dark: initialGameProfile }).light.items).toEqual([scroll(90)])
    window.localStorage.clear()
})

test.each([
    { commandTime: -1 }, { commandTime: "90" }, { commandTime: null }, { commandTime: undefined },
    { scrollId: "unknown" },
])("invalid scroll input rejects the whole import: %j", invalid => {
    const doc = JSON.parse(serializeBuildOrder("light", initialGameProfile, simulate([scroll(90)]).plan))
    Object.assign(doc.buildOrder[1], invalid)
    expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow()
})

test("Gold Rush is Light-only and direct API input is also validated", () => {
    expect(() => createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 0 }, "dark")).toThrow("Light")
    expect(() => scroll(Infinity)).toThrow("commandTime")
    expect(() => scroll(NaN)).toThrow("commandTime")
    expect(() => simulateBuildOrder([scroll(0)], settings, 10, 20, 20, "Citadel")).toThrow("Light")
})
