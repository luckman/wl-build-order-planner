import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createResourcesCollectedAction } from "./resourcesCollected"
import { createScrollAction } from "./scrolls"
import { createWorkerEvent } from "./workerEvents"

const dark = factions.dark
const item = (id: string) => dark.items.find(candidate => candidate.id === id)!
const whip = (commandTime: number) => createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime }, "dark")
const legion = (commandTime: number, targetItemId = "barracks") =>
    createScrollAction({ type: "use-scroll", scrollId: "legions-call", commandTime, targetItemId }, "dark")
const supplies = (commandTime: number) => createResourcesCollectedAction({ type: "resources-collected", commandTime, gold: 500, wood: 500 })
const economy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000,
    startingMana: 500, baseManaLimit: 500, orderDelay: 0, constructionStartDelay: 0, goldWorkers: 1, woodWorkers: 2, workerCount: 3 }
const solve = (rows: PlannerItem[], previous?: ReturnType<typeof simulateBuildOrder>) =>
    simulateBuildOrder(rows, economy, 6, 200, 20, dark.startingTownHall, { until: 85, previous })

// These snapshots were captured before checkpoint reuse was enabled for scroll forecasts.
test("prepared construction and fixed events preserve same-time ordering and blocked actions", () => {
    // Run each recruit in seven seconds after the initial Citadel's 1% bonus.
    const recruit = { ...item("slave"), seconds: 7 / 0.99 }
    const pigsty = { ...item("pigsty"), construction: { preparationDuration: 20, outwardDuration: 8, useIdleWorker: true } }
    const idle = createWorkerEvent({ type: "make-idle", commandTime: 1, count: 1 }, "dark")
    const rows = [recruit, recruit, recruit, recruit, pigsty, supplies(1), whip(1), idle, legion(30, "citadel"), item("warg-rider")]
    const result = solve(rows)

    expect(result.plan.map(action => action.item)).toEqual(rows)
    rows.forEach((row, index) => expect(result.plan[index].item).toBe(row))
    expect(result.plan[4]).toMatchObject({ blocked: false, departureTime: 1, commandTime: 21 })
    expect(result.plan.at(-1)?.blockedReason).toMatch(/Requires/)
    expect(result).toMatchSnapshot()

    const appended = [...rows, item("slave")]
    expect(solve(appended, result)).toEqual(solve(appended))
})

test("changed scroll windows and producer targets preserve complete results across calls", () => {
    const barracks = { ...item("barracks"), seconds: 3 }
    const goon = item("goon")
    const prepared = { ...item("pigsty"), construction: { preparationDuration: 10 } }
    const prefix = [barracks, goon, barracks, goon, prepared]
    const first = [...prefix, legion(7), legion(18), whip(30)]
    const second = [...prefix, legion(7), legion(20, "citadel"), whip(32)]
    const previous = solve(first)
    expect(previous.plan[5]).toMatchObject({ blocked: false, buildingInstanceId: previous.plan[3].buildingInstanceId })
    expect(previous.plan[6]).toMatchObject({ blocked: false, buildingInstanceId: previous.plan[1].buildingInstanceId })
    expect(previous).toMatchSnapshot("first forecast")
    const previousOutput = JSON.stringify(previous)

    const current = solve(second, previous)
    expect(current.plan[6].blocked).toBe(false)
    expect(current.plan[6].buildingInstanceId).not.toBe(previous.plan[6].buildingInstanceId)
    expect(current).toMatchSnapshot("changed forecast")
    expect(JSON.stringify(previous)).toBe(previousOutput)
    for (const [index, action] of current.plan.entries()) expect(action.item).toBe(second[index])
    for (const [index, action] of previous.plan.entries()) expect(action.item).toBe(first[index])
})

test("preparation can depart when a miner leaves the mine before the next delivery", () => {
    const singleMiner = { ...economy, goldWorkers: 1, woodWorkers: 0, workerCount: 1,
        goldTravelTime: 2, goldGatherTime: 11, initialGoldTravelReduction: 0 }
    // Keep the initial worker count fixed while the catalog advances through four orders.
    const recruit = { ...item("goon"), seconds: 6 / 0.99, producer: "Citadel", producerBuildingId: "citadel", requirements: [], prerequisites: [] }
    const pigsty = { ...item("pigsty"), construction: { preparationDuration: 8 } }
    const rows = [recruit, recruit, recruit, recruit, pigsty, whip(40)]
    const result = simulateBuildOrder(rows, singleMiner, 2, 200, 20, dark.startingTownHall, { until: 85 })

    // The candidate pass must retain the mine exit at 13, before the delivery at 15.
    expect(result.plan[4]).toMatchObject({ blocked: false, departureTime: 13, commandTime: 21 })
    expect(result).toMatchSnapshot()
})

test.each([
    ["Whip", [whip(1)]],
    ["Legion's Call", [legion(40, "citadel")]],
    ["both scrolls", [whip(1), legion(40, "citadel")]],
] as const)("prepared builds using %s preserve complete results through consecutive and branching appends", (_, scrolls) => {
    const prepared = { ...item("pigsty"), construction: { preparationDuration: 16.82 } }
    const rows = [item("slave"), item("slave"), supplies(1), prepared, ...scrolls, item("slave")]
    const previous = solve(rows)
    expect(previous.plan[3].departureTime).toBe(1)
    const original = JSON.stringify(previous)
    const appended = [...rows, item("slave")]
    const current = solve(appended, previous)
    expect(current).toEqual(solve(appended))
    for (const [changed, source] of [
        [[...appended, item("slave")], current],
        [[...rows, item("barracks")], previous],
    ] as const) {
        const result = solve(changed, source)
        expect(result).toEqual(solve(changed))
        changed.forEach((row, index) => expect(result.plan[index].item).toBe(row))
    }
    expect(JSON.stringify(previous)).toBe(original)
})

test("an appended producer can make a later Legion's Call valid and change the forecast", () => {
    const rows = [item("slave"), legion(75)]
    const previous = solve(rows)
    expect(previous.plan[1]).toMatchObject({ blocked: true })
    const changed = [...rows, item("barracks")]
    const result = solve(changed, previous)
    expect(result.plan[1]).toMatchObject({ blocked: false, buildingInstanceId: result.plan[2].buildingInstanceId })
    expect(result).toEqual(solve(changed))
})

test("appending a catalog row refreshes earlier blocked reasons that use its name", () => {
    const barracks = item("barracks")
    const rows = [{ ...barracks, name: "Renamed Barracks" }, item("slave"), legion(1), item("slave")]
    const previous = solve(rows)
    expect(previous.plan[2].blockedReason).toContain("Renamed Barracks")
    const changed = [...rows, barracks]
    const current = solve(changed, previous)
    expect(current).toEqual(solve(changed))
    expect(current.plan[2].blockedReason).toContain("available Barracks")
})

test("pending effects preserve a blocked append and the results of unsupported changes", () => {
    const prepared = { ...item("pigsty"), construction: { preparationDuration: 10 } }
    const rows = [item("slave"), whip(1), prepared, item("slave"), legion(40, "citadel"), item("slave")]
    const previous = solve(rows)
    const unavailable = [...rows, item("warg-rider")]
    const blocked = solve(unavailable, previous)
    expect(blocked.plan.at(-1)).toMatchObject({ blocked: true, blockedReason: expect.stringMatching(/Requires/) })
    expect(blocked).toEqual(solve(unavailable))
    const withFood = [...rows, item("slave")]
    const foodArgs = [economy, 6, 6, 0, dark.startingTownHall] as const
    const foodSource = simulateBuildOrder(rows, ...foodArgs, { until: 85 })
    const foodBlocked = simulateBuildOrder(withFood, ...foodArgs, { until: 85, previous: foodSource })
    expect(foodBlocked.plan.at(-1)).toMatchObject({ blocked: true, blockedReason: expect.stringContaining("supply") })
    expect(foodBlocked).toEqual(simulateBuildOrder(withFood, ...foodArgs, { until: 85 }))

    for (const changed of [
        [...rows, supplies(50)],
        [...rows, { ...item("barracks"), construction: { preparationDuration: 8 } }],
        [...rows, item("slave"), item("slave")],
        rows.slice(0, -1),
        [rows[2], rows[1], rows[0], ...rows.slice(3)],
        [rows[0], whip(2), ...rows.slice(2), item("slave")],
    ]) expect(solve(changed, previous)).toEqual(solve(changed))
})

test("changed settings and edited rows invalidate scroll append evidence", () => {
    const prepared = { ...item("pigsty"), construction: { preparationDuration: 10 } }
    const rows = [item("slave"), whip(1), prepared, item("slave"), legion(40, "citadel"), item("slave")]
    const previous = solve(rows)
    const changed = [...rows, item("slave")]
    const alternateEconomy = { ...economy, startingMana: 0, goldWorkers: 2, woodWorkers: 1 }
    const args = [alternateEconomy, 6, 100, 10, dark.startingTownHall] as const
    expect(simulateBuildOrder(changed, ...args, { until: 70, previous }))
        .toEqual(simulateBuildOrder(changed, ...args, { until: 70 }))
    expect(simulateBuildOrder(changed, economy, 6, 200, 20, dark.startingTownHall, { until: 60, previous }))
        .toEqual(simulateBuildOrder(changed, economy, 6, 200, 20, dark.startingTownHall, { until: 60 }))
    prepared.construction.preparationDuration = 20
    expect(solve(changed, previous)).toEqual(solve(changed))
    const light = factions.light
    const worker = light.items.find(candidate => candidate.id === "worker")!
    expect(simulateBuildOrder([worker, worker], economy, 6, 200, 20, light.startingTownHall, { until: 85, previous }))
        .toEqual(simulateBuildOrder([worker, worker], economy, 6, 200, 20, light.startingTownHall, { until: 85 }))
})

test("copied and mutated public results cannot contaminate an appended result", () => {
    const rows = [item("slave"), whip(1), item("pigsty"), legion(40, "citadel"), item("slave")]
    const previous = solve(rows)
    const changed = [...rows, item("slave")]
    const expected = solve(changed)
    expect(solve(changed, { ...previous })).toEqual(expected)
    previous.plan[0].cost.gold = 9999
    previous.plan[0].workerReturnEndTime = 9999
    previous.deliveries[0].gold = 9999
    previous.orderedPlan.reverse()
    expect(solve(changed, previous)).toEqual(expected)
    expect(previous.plan[0].cost.gold).toBe(9999)
})
