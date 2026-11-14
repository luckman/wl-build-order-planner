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
