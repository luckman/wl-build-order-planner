import { createScrollAction } from "./scrolls"
import { earliestScrollTime } from "./scrollTiming"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { manaAt, WorkerEconomy } from "./resourceSimulation"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { loadFactionDrafts, saveFactionDrafts } from "./draftStorage"

const lumber = (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering", commandTime }, "light")
const settings = { ...economyFromProfile(initialGameProfile), orderDelay: 0,
    workerCount: 1, goldWorkers: 0, woodWorkers: 1 }
const simulate = (items: PlannerItem[], economy = settings) =>
    simulateBuildOrder(items, economy, 2, 20, economy.foodPerFarm, "Castle", 100)

test("Lumber Gathering spends 25 mana, starts one second later, and runs thirty seconds", () => {
    const { plan, deliveries } = simulate([lumber(0)])
    expect(plan[0]).toMatchObject({ commandTime: 0, startTime: 1, finishTime: 31, manaCost: 25, blocked: false })
    expect(manaAt(settings, plan, 0).mana).toBe(10)
    expect(deliveries.slice(0, 3).map(({ wood }) => wood)).toEqual([65, 50, 50])
    expect(earliestScrollTime(settings, [], 0, "lumber-gathering")).toBe(0)
})

test.each([0, 4, 15, 15.1, 16, 30])("command at %s uses gathering completion, regardless of current stage", commandTime => {
    const { deliveries } = simulate([lumber(commandTime)])
    const start = commandTime + 1
    for (const delivery of deliveries) {
        const gatheringFinish = delivery.time - settings.woodTravelTime
        expect(delivery.wood).toBe(gatheringFinish >= start && gatheringFinish < start + 30 ? 65 : 50)
    }
})

test("exact start counts, expiry excludes, and bonus cargo survives a return after expiry", () => {
    const economy = { ...settings, woodTravelTime: 4, woodGatherTime: 12 }
    const workers = new WorkerEconomy(economy)
    workers.scheduleLumberGathering(16, 36, 15)
    workers.advanceTo(40)
    expect(workers.deliveries.map(({ time, wood }) => ({ time, wood }))).toEqual([
        { time: 20, wood: 65 }, { time: 40, wood: 50 },
    ])
    const returning = new WorkerEconomy(economy)
    returning.scheduleLumberGathering(15, 17, 15)
    returning.advanceTo(20)
    expect(returning.deliveries[0].wood).toBe(65)
})

test("all forest workers, new workers, and returning builders use their gathering completion time", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 3, woodWorkers: 3 })
    workers.scheduleLumberGathering(10, 40, 15)
    workers.advanceTo(5)
    workers.construct(workers.workers[0], 2)
    workers.addWorker("wood")
    workers.advanceTo(65)
    expect(new Set(workers.deliveries.filter(({ wood }) => wood === 65).map(({ worker }) => worker)).size).toBe(4)
    expect(workers.deliveries.some(({ time, wood }) => time > 40 && wood === 65)).toBe(true)
    for (const delivery of workers.deliveries) {
        const finish = delivery.time - settings.woodTravelTime
        expect(delivery.wood).toBe(finish >= 10 && finish < 40 ? 65 : 50)
    }
})

test("overlapping effects do not stack and levels one through six have the same bonus", () => {
    const economy = { ...settings, startingMana: 100, baseManaLimit: 100 }
    const overlap = simulate([lumber(0), lumber(10)], economy)
    expect(overlap.plan.every(action => !action.blocked)).toBe(true)
    expect(Math.max(...overlap.deliveries.map(({ wood }) => wood))).toBe(65)
    for (let scrollLevel = 1; scrollLevel <= 6; scrollLevel++) {
        expect(simulate([lumber(0)], { ...economy, scrollLevel }).deliveries).toEqual(simulate([lumber(0)], economy).deliveries)
    }
})

test("mixed scrolls share cooldown and spend their own mana cost", () => {
    const gold = createScrollAction({ type: "use-scroll", scrollId: "gold-rush", commandTime: 0 }, "light")
    const economy = { ...settings, startingMana: 100, baseManaLimit: 100 }
    const { plan } = simulate([gold, lumber(9), lumber(10)], economy)
    expect(plan.map(({ blocked }) => blocked)).toEqual([false, true, false])
    expect(manaAt(economy, plan, 10).mana).toBeCloseTo(25 + 10 / 6)
    const blocked = simulate([lumber(0)], { ...settings, startingMana: 24 })
    expect(blocked.plan[0].blockedReason).toContain("Lumber Gathering: requires 25")
    expect(blocked.deliveries).toEqual(simulate([], { ...settings, startingMana: 24 }).deliveries)
})

test("wood bonus advances resource-dependent construction regardless of scroll row position", () => {
    const barracks = factions.light.items.find(item => item.id === "barracks")!
    const economy = { ...settings, startingGold: 1000, startingWood: 90 }
    const before = simulate([lumber(0), barracks], economy)
    const after = simulate([barracks, lumber(0)], economy)
    expect(before.plan[1].commandTime).toBe(after.plan[0].commandTime)
    expect(after.plan[0].commandTime).toBeLessThan(simulate([barracks], economy).plan[0].commandTime!)
    expect(before.deliveries).toEqual(after.deliveries)
})

test("Lumber Gathering round-trips through files, shared links, and saved drafts", () => {
    const { plan } = simulate([lumber(0)])
    for (const timings of [true, false]) {
        expect(parseBuildOrder(serializeBuildOrder("light", initialGameProfile, plan, timings)).buildOrder).toEqual([lumber(0)])
    }
    const url = createShareableLink("https://example.com/", "light", initialGameProfile, plan)
    expect(parseShareableLink(new URL(url).hash)!.buildOrder).toEqual([lumber(0)])
    const opening = { type: "allocate-workers" as const, goldWorkers: 4 }
    saveFactionDrafts({ light: { opening, items: [lumber(0)] }, dark: { opening, items: [] } }, { light: initialGameProfile, dark: initialGameProfile })
    expect(loadFactionDrafts({ light: initialGameProfile, dark: initialGameProfile }).light.items).toEqual([lumber(0)])
    window.localStorage.clear()
    expect(() => createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering", commandTime: 0 }, "dark")).toThrow("Light")
})
