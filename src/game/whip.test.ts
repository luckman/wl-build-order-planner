import { createScrollAction, scrollEffect } from "./scrolls"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { WorkerEconomy, workerAllocationAt, manaAt } from "./resourceSimulation"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { loadFactionDrafts, saveFactionDrafts } from "./draftStorage"
import { earliestScrollTime } from "./scrollTiming"

const settings = { ...economyFromProfile(initialGameProfile), startingMana: 500, baseManaLimit: 500,
    startingGold: 10000, startingWood: 10000, orderDelay: 1,
    workerCount: 1, goldWorkers: 0, woodWorkers: 1, woodTravelTimeIncreaseBase: 0,
    woodTravelTime: 4, goldTravelTime: 4, initialGoldTravelReduction: 0, maxWoodTravelTime: 5 }
const whip = (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime }, "dark")
const simulate = (items: PlannerItem[], economy = settings, until = 150) =>
    simulateBuildOrder(items, economy, 2, 20, economy.foodPerFarm, "Citadel", until)

test.each([
    [1, 0.5, 2, 30], [2, 0.6, 2.1, 30.3], [3, 0.6, 2.2, 30.8],
    [4, 0.7, 2.3, 31.5], [5, 0.7, 2.4, 32.4], [6, 0.8, 2.5, 33.5],
])("Whip level %s applies its gathering reductions and duration", (level, goldReduction, woodReduction, duration) => {
    const economy = { ...settings, darkWhipLevel: level }
    expect(scrollEffect("whip", economy)).toMatchObject({ manaCost: 50, movementMultiplier: 1.15,
        goldTimeReduction: goldReduction, woodTimeReduction: woodReduction, duration })
    const wood = new WorkerEconomy(economy)
    wood.scheduleScroll("whip", 0, duration)
    wood.advanceTo(20)
    expect(wood.deliveries[0].time).toBeCloseTo(8 / 1.15 + economy.woodGatherTime - woodReduction)
    const gold = new WorkerEconomy({ ...economy, goldWorkers: 1, woodWorkers: 0 })
    gold.scheduleScroll("whip", 0, duration)
    gold.advanceTo(20)
    expect(gold.deliveries[0].time).toBeCloseTo(8 / 1.15 + economy.goldGatherTime - goldReduction)
    expect(simulate([whip(1)], economy).plan[0]).toMatchObject({ startTime: 2, finishTime: 2 + duration })
})

test("Whip uses shared mana readiness, cooldown, one-second activation and faction validation", () => {
    const economy = { ...settings, startingMana: 49, manaPerMinute: 60 }
    expect(earliestScrollTime(economy, [], 0, "whip")).toBe(2)
    const { plan } = simulate([whip(1), whip(2), whip(12)], economy)
    expect(plan[0]).toMatchObject({ blocked: true, startTime: null })
    expect(plan[0].blockedReason).toContain("order delay")
    expect(plan[1]).toMatchObject({ blocked: false, manaCost: 50, commandTime: 2, startTime: 3, finishTime: 33 })
    expect(plan[2].blockedReason).toContain("cooldown")
    expect(manaAt(economy, plan, 2).mana).toBe(1)
    expect(() => createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 1 }, "light")).toThrow("Dark")
})

test.each([0, 6.05, 6.25])("wood activation after %s seconds preserves earned progress", elapsed => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 4 + elapsed, 34 + elapsed)
    workers.advanceTo(20)
    const gathering = elapsed + (1 - elapsed / 12.1) * 10.1
    expect(workers.deliveries[0].time).toBeCloseTo(4 + gathering + 4 / 1.15, 8)
    expect(workers.deliveries[0].wood).toBe(settings.woodPerTrip)
})

test("wood expiry restores normal productivity without discarding progress", () => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 7, 9)
    workers.advanceTo(25)
    const progress = 3 / 12.1 + 2 / 10.1
    expect(workers.deliveries[0].time).toBeCloseTo(9 + (1 - progress) * 12.1 + 4, 8)
})

test("travel switches speed in either direction and respects expiration", () => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 1, 2)
    workers.advanceTo(4)
    // One normal second, one boosted second, then 1.85 normal seconds.
    expect(workers.workers[0].stateSince).toBeCloseTo(3.85, 8)
    const returning = new WorkerEconomy(settings)
    returning.scheduleScroll("whip", 17.1, 18.1)
    returning.advanceTo(21)
    expect(returning.deliveries[0].time).toBeCloseTo(19.95, 8)
})

test("gold checks effect on mine entry, retaining the result after activation or expiry", () => {
    const economy = { ...settings, goldWorkers: 1, woodWorkers: 0 }
    const late = new WorkerEconomy(economy)
    late.scheduleScroll("whip", 5, 35)
    late.advanceTo(5)
    expect(late.workers[0].nextAt).toBeCloseTo(7.1) // Entered at 4, before cast.
    late.advanceTo(16)
    expect(late.workers[0].state).toBe("gathering")
    expect(late.workers[0].nextAt - late.workers[0].stateSince).toBeCloseTo(2.6)

    const expiry = new WorkerEconomy(economy)
    expiry.scheduleScroll("whip", 4, 5)
    expiry.advanceTo(5)
    expect(expiry.workers[0].nextAt).toBeCloseTo(6.6) // Exact activation counts; expiry does not undo entry.
    const boundary = new WorkerEconomy(economy)
    boundary.scheduleScroll("whip", 0, 4 / 1.15)
    boundary.advanceTo(4)
    expect(boundary.workers[0].nextAt - boundary.workers[0].stateSince).toBeCloseTo(3.1)
})

test("waiting miners receive Whip and check it when their mine slot opens", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 2, goldWorkers: 2, woodWorkers: 0 })
    workers.scheduleScroll("whip", 5, 35)
    workers.advanceTo(7.1)
    expect(workers.workers[1].state).toBe("gathering")
    expect(workers.workers[1].nextAt).toBeCloseTo(9.7)
})

test("refresh sets thirty seconds from reapplication, without stacking or adding duration", () => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 1, 31)
    workers.scheduleScroll("whip", 11, 41)
    workers.advanceTo(12)
    expect(workers.workers[0].whipUntil).toBe(41)
    expect(workers.workers[0].nextAt).toBeCloseTo(1 + 3 / 1.15 + 10.1)
    workers.advanceTo(31)
    expect(workers.workers[0].whipUntil).toBe(41)
    workers.advanceTo(41)
    expect(workers.workers[0].whipUntil).toBe(-Infinity)
})

test("new and idle workers do not inherit another worker's effect", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 2 })
    workers.scheduleScroll("whip", 1, 31)
    workers.advanceTo(2)
    expect(workers.workers[1].whipUntil).toBe(-Infinity)
    expect(workers.addWorker("wood").whipUntil).toBe(-Infinity)
})

test("construction travel is faster, but starting construction clears Whip permanently", () => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 1, 31)
    workers.advanceTo(2)
    const builder = workers.workers[0]
    expect(workers.constructionTravelTime(builder)).toBeCloseTo(3 / 1.15)
    workers.construct(builder, 2)
    expect(workers.selectBuilder()).toBeUndefined()
    expect(workers.selectWorkerToKill()).toBeUndefined()
    workers.advanceTo(2 + 3 / 1.15)
    expect(builder.state).toBe("construction")
    expect(builder.whipUntil).toBe(-Infinity)
    workers.scheduleScroll("whip", 5, 35) // Already building: excluded.
    workers.advanceTo(2 + 3 / 1.15 + 2 + 3)
    expect(builder.state).toBe("gathering")
    expect(builder.whipUntil).toBe(-Infinity)
    expect(builder.nextAt - builder.stateSince).toBeCloseTo(12.1)
})

test.each([false, true])("construction retains wood earned across Whip boundaries (still active: %s)", active => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 7, active ? 37 : 9)
    const commandTime = active ? 9 : 10
    workers.advanceTo(commandTime)
    const builder = workers.selectBuilder()!
    const progress = 3 / 12.1 + 2 / 10.1 + (active ? 0 : 1 / 12.1)
    workers.construct(builder, 2)
    expect(builder.cargoWood).toBeCloseTo(settings.woodPerTrip * progress)
    const returnTime = commandTime + (active ? 3 / 1.15 : 3) + 2 + 3
    workers.advanceTo(returnTime + 0.01)
    expect(builder.state).toBe("gathering")
    expect(builder.whipUntil).toBe(-Infinity)
    expect(builder.nextAt).toBeCloseTo(returnTime + (1 - progress) * 12.1)
    // A fresh cast after resuming must also preserve the saved progress.
    workers.scheduleScroll("whip", returnTime + 1, returnTime + 31)
    workers.advanceTo(40)
    const remaining = 1 - progress - 1 / 12.1
    expect(workers.deliveries[0].time).toBeCloseTo(returnTime + 1 + remaining * 10.1 + 4 / 1.15)
    expect(workers.deliveries[0].wood).toBe(settings.woodPerTrip)
})

test("construction travel handles expiry before arrival", () => {
    const workers = new WorkerEconomy(settings)
    workers.scheduleScroll("whip", 1, 3)
    workers.advanceTo(2)
    expect(workers.constructionTravelTime(workers.workers[0])).toBeCloseTo(1 + (3 - 1.15))
})

test("a cast during builder travel updates building, worker return and replay allocation timings", () => {
    const barracks = factions.dark.items.find(item => item.id === "barracks")!
    const { plan, deliveries } = simulate([barracks, whip(2)])
    const build = plan[0]
    const travelTime = 2 + 1 / 1.15 // Command at 1, effect at 3, arrival before 4.
    expect(build.commandTime).toBe(1)
    expect(build.startTime).toBeCloseTo(1 + travelTime)
    expect(build.finishTime! - build.startTime!).toBe(barracks.seconds)
    expect(build.workerReturnTime).toBeCloseTo(build.finishTime! + 3)
    expect(workerAllocationAt(settings, plan, build.workerReturnTime! - 0.01)).toMatchObject({ busyOrIdle: 1, wood: 0 })
    expect(workerAllocationAt(settings, plan, build.workerReturnTime!)).toMatchObject({ busyOrIdle: 0, wood: 1 })
    expect(deliveries[0].time).toBeCloseTo(build.workerReturnTime! + 12.1 + 4)
    // Source row placement cannot change timing or income.
    const reversed = simulate([whip(2), barracks])
    expect(reversed.plan[1]).toEqual(build)
    expect(reversed.deliveries).toEqual(deliveries)
})

test("blocked future casts do not accelerate builder travel", () => {
    const barracks = factions.dark.items.find(item => item.id === "barracks")!
    const { plan } = simulate([barracks, whip(1)], { ...settings, startingMana: 0, manaPerMinute: 0 })
    expect(plan[0].startTime).toBe(4)
    expect(plan[1].blocked).toBe(true)
})

test("a fresh cast can affect a returning builder after construction has finished", () => {
    const barracks = factions.dark.items.find(item => item.id === "barracks")!
    const { plan, deliveries } = simulate([barracks, whip(35)])
    const build = plan[0]
    expect(build.startTime).toBe(4)
    expect(build.finishTime).toBe(34)
    expect(build.workerReturnTime).toBeCloseTo(34 + 2 + 1 / 1.15)
    expect(deliveries[0].time).toBeCloseTo(build.workerReturnTime! + 10.1 + 4 / 1.15)
    expect(workerAllocationAt(settings, plan, build.workerReturnTime!)).toMatchObject({ wood: 1, busyOrIdle: 0 })
})

test("Whip persists through JSON, links and per-faction drafts", () => {
    const profile = { ...initialGameProfile, player: { ...initialGameProfile.player, darkWhipLevel: 6 } }
    const { plan } = simulate([whip(10)])
    for (const includeTimings of [false, true]) {
        const parsed = parseBuildOrder(serializeBuildOrder("dark", profile, plan, includeTimings))
        expect(parsed.buildOrder).toEqual([whip(10)])
        expect(parsed.gameProfile.player.darkWhipLevel).toBe(6)
    }
    const url = createShareableLink("https://example.com/planner", "dark", profile, plan)
    expect(parseShareableLink(new URL(url).hash)!.buildOrder).toEqual([whip(10)])
    const opening = { type: "allocate-workers" as const, goldWorkers: 4 }
    saveFactionDrafts({ light: { opening, items: [] }, dark: { opening, items: [whip(10)] } }, { light: profile, dark: profile })
    expect(loadFactionDrafts({ light: profile, dark: profile }).dark.items).toEqual([whip(10)])
    window.localStorage.clear()
})

test.each([4, 5])("player preparation with %s miners delays exactly the closest outbound worker", count => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0 })
    workers.advanceTo(0.5)
    if (count === 5) workers.addWorker("gold") // A later arrival must not be selected.
    workers.advanceTo(1)
    const arrivals = workers.workers.map(worker => worker.nextAt)
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers.map(worker => worker.nextAt)).toEqual(arrivals.map((time, id) => time + (id === 0 ? 1 : 0)))
})

test("player preparation skips queued, mining and returning workers", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0 })
    workers.advanceTo(12)
    expect(workers.workers.map(worker => worker.state)).toEqual(["outbound", "deposit", "gathering", "waiting"])
    const arrivals = workers.workers.map(worker => worker.nextAt)
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers.map(worker => worker.nextAt)).toEqual(arrivals.map((time, id) => time + (id === 0 ? 1 : 0)))
})

test("player preparation adds no travel with fewer than four active miners or no outbound miner", () => {
    for (const count of [3, 4]) {
        const workers = new WorkerEconomy({ ...settings, workerCount: count, goldWorkers: count, woodWorkers: 0 })
        if (count === 4) workers.advanceTo(4) // All have arrived; mine and queue are excluded.
        const arrivals = workers.workers.map(worker => worker.nextAt)
        workers.prepareGoldWorkerForWhip()
        expect(workers.workers.map(worker => worker.nextAt)).toEqual(arrivals)
    }
    const workers = new WorkerEconomy({ ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0 })
    workers.advanceTo(1)
    workers.construct(workers.workers[0], 30)
    const arrivals = workers.workers.map(worker => worker.nextAt)
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers.map(worker => worker.nextAt)).toEqual(arrivals) // Builder is no longer an active miner.
})

test("player preparation occurs at command time and its extra travel is shortened by activation", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0 })
    workers.advanceTo(1)
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers[0].nextAt).toBe(5) // Already delayed before effect activation at 2.
    workers.scheduleScroll("whip", 2, 32)
    workers.advanceTo(2)
    expect(workers.workers[0].nextAt).toBeCloseTo(2 + 3 / 1.15)
    expect(workers.workers[1].nextAt).toBeCloseTo(2 + 2 / 1.15)
})

test("preparing for reapplication adds speed-adjusted travel while the previous effect is active", () => {
    const workers = new WorkerEconomy({ ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0 })
    workers.scheduleScroll("whip", 1, 31)
    workers.advanceTo(2)
    const arrival = workers.workers[0].nextAt
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers[0].nextAt).toBeCloseTo(arrival + 1 / 1.15)
    workers.prepareGoldWorkerForWhip()
    expect(workers.workers[1].nextAt).toBeCloseTo(arrival + 1 / 1.15) // Next closest after the first delay.
})

test("successful commands model player preparation in scheduling and replay; blocked commands do not", () => {
    const economy = { ...settings, workerCount: 4, goldWorkers: 4, woodWorkers: 0, goldGatherTime: 1 }
    const actual = simulate([whip(12)], economy, 50)
    expect(actual.plan[0].blocked).toBe(false)
    const reference = new WorkerEconomy(economy)
    reference.advanceTo(12)
    reference.prepareGoldWorkerForWhip()
    reference.scheduleScroll("whip", 13, 43)
    reference.advanceTo(50)
    expect(actual.deliveries).toEqual(reference.deliveries)
    // First worker was due at 13, is delayed to 14 by the command at 12,
    // then travels its remaining normal second at boosted speed from 13.
    expect(actual.deliveries[4].time).toBeCloseTo(13 + 1 / 1.15 + 0.5 + 4 / 1.15)
    expect(workerAllocationAt(economy, actual.plan, 12)).toMatchObject({ gold: 4, busyOrIdle: 0 })

    const blocked = { ...economy, startingMana: 0, manaPerMinute: 0 }
    expect(simulate([whip(12)], blocked).deliveries).toEqual(simulate([], blocked).deliveries)
})
