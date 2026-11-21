import { simulateBuildOrder } from "./buildSimulation"
import { factions, type PlannerItem } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { resourceAt, workerAllocationAt } from "./resourceSimulation"
import { createScrollAction } from "./scrolls"
import { createShareableLink, parseShareableLink } from "./shareableLink"
import { createUnitKilledAction } from "./unitsKilled"
import { createWorkerEvent } from "./workerEvents"
import { createWoodReturn } from "./woodReturn"

const economy = {
    ...economyFromProfile(initialGameProfile), workerCount: 2, goldWorkers: 0, woodWorkers: 2,
    woodTravelTime: 2, woodGatherTime: 10, woodPerTrip: 50, orderDelay: 1,
    woodTravelTimeIncreaseBase: 0, maxWoodTravelTime: 10,
}
const immediate = (commandTime: number) => createWoodReturn({ type: "bring-wood-back-to-base", commandTime, mode: "immediate" })
const waitForWood = (commandTime: number, target: number) => createWoodReturn({ type: "bring-wood-back-to-base", commandTime, mode: "target", target })
const simulate = (items: PlannerItem[], settings = economy, faction: "light" | "dark" = "light") =>
    simulateBuildOrder(items, settings, 4, 200, settings.foodPerFarm, factions[faction].startingTownHall)
const idle = (commandTime: number) => createWorkerEvent({ type: "make-idle", commandTime, count: 1 }, "light")
const active = (commandTime: number) => createWorkerEvent({ type: "make-active", commandTime, count: 1 }, "light")
const kill = (commandTime: number) => createUnitKilledAction({ type: "unit-is-killed", unitId: "worker", commandTime }, "light")
const farm = factions.light.items.find(item => item.id === "farm")!

test("an immediate wood return delivers one partial load and the worker resumes gathering", () => {
    const result = simulate([immediate(5)])
    expect(result.plan[0]).toMatchObject({ blocked: false, commandTime: 5, workerId: 0, finishTime: 7, woodReturn: { delivered: 15 } })
    expect(result.deliveries.slice(0, 3)).toEqual([
        { time: 7, worker: 0, gold: 0, wood: 15 },
        { time: 15, worker: 1, gold: 0, wood: 50 },
        { time: 21, worker: 0, gold: 0, wood: 50 },
    ])
})

test("a target reserves the worker who has just begun chopping and blocks a second order for that worker", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const result = simulate([waitForWood(2, 10), waitForWood(3, 20)], settings)
    expect(result.plan[0]).toMatchObject({ workerId: 0, startTime: 4, finishTime: 6, woodReturn: { delivered: 10 } })
    expect(result.plan[1].blockedReason).toMatch(/No eligible wood gatherer/)
    expect(result.deliveries[0]).toEqual({ time: 6, worker: 0, gold: 0, wood: 10 })
})

test("two outstanding targets stay with their original workers and a reached target returns the whole load held", () => {
    const result = simulate([waitForWood(3, 25), waitForWood(3, 5)])
    expect(result.plan[0]).toMatchObject({ workerId: 0, startTime: 7, finishTime: 9 })
    expect(result.plan[1]).toMatchObject({ workerId: 1, startTime: 4, finishTime: 6 })
    expect(result.deliveries.slice(0, 2)).toEqual([
        { time: 6, worker: 1, gold: 0, wood: 5 },
        { time: 9, worker: 0, gold: 0, wood: 25 },
    ])
    expect(simulate([waitForWood(5, 10)]).plan[0]).toMatchObject({
        workerId: 0, startTime: 5, finishTime: 7, woodReturn: { delivered: 15 },
    })
})

test("Whip activation during a wait advances the target and uses the faster return trip", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1, startingMana: 500, baseManaLimit: 500 }
    const whip = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 3 }, "dark")
    const result = simulate([waitForWood(2, 25), whip], settings, "dark")
    expect(result.plan[0]).toMatchObject({ startTime: 6.4, woodReturn: { delivered: 25 } })
    expect(result.plan[0].finishTime).toBeCloseTo(6.4 + 2 / 1.15)
})

test("Whip expiry during a wait retains the wood already gathered and restores ordinary movement", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1, woodGatherTime: 80, startingMana: 500, baseManaLimit: 500 }
    const whip = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 1 }, "dark")
    const result = simulate([whip, waitForWood(2, 25)], settings, "dark")
    const targetReached = 32 + (0.5 - 30 / 78) * 80
    expect(result.plan[1].startTime).toBeCloseTo(targetReached)
    expect(result.plan[1].finishTime).toBeCloseTo(targetReached + 2)
    expect(result.plan[1].woodReturn?.delivered).toBe(25)
})

test("a due departure and a due deposit both resolve before later worker commands", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const atDeparture = simulate([waitForWood(2, 10), idle(4)], settings)
    expect(atDeparture.plan[0]).toMatchObject({ workerId: 0, startTime: 4, blocked: true, woodReturn: { endTime: 4, delivered: 0 } })
    expect(atDeparture.plan[0].blockedReason).toMatch(/made idle/)
    const atDeposit = simulate([waitForWood(2, 10), kill(6)], settings)
    expect(atDeposit.plan[0]).toMatchObject({ finishTime: 6, woodReturn: { delivered: 10 } })
    expect(atDeposit.deliveries).toEqual([{ time: 6, worker: 0, gold: 0, wood: 10 }])
})

test("an interruption while chopping keeps the existing cargo and identifies the originally selected worker", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const result = simulate([waitForWood(2, 25), idle(4), active(10)], settings)
    expect(result.plan[0]).toMatchObject({ workerId: 0, startTime: null, blocked: true, woodReturn: { endTime: 4, delivered: 0 } })
    expect(result.deliveries[0]).toEqual({ time: 20, worker: 0, gold: 0, wood: 50 })
    const killed = simulate([waitForWood(2, 25), kill(4)], settings)
    expect(killed.plan[0]).toMatchObject({ workerId: 0, startTime: null, blockedReason: expect.stringMatching(/killed/) })
    expect(killed.deliveries).toEqual([])
    const built = simulate([waitForWood(2, 25), farm], { ...settings, orderDelay: 4, startingGold: 10000, startingWood: 10000 })
    expect(built.plan[0]).toMatchObject({ workerId: 0, startTime: null, blockedReason: expect.stringMatching(/construction/) })
})

test("a waited-for load is available to construction only after the deposit and order delay", () => {
    const settings = { ...economy, startingGold: 10000, startingWood: farm.wood - 25 }
    const result = simulate([waitForWood(2, 25), farm], settings)
    expect(resourceAt(settings, result.deliveries, [], 8.99).wood).toBe(farm.wood - 25)
    expect(resourceAt(settings, result.deliveries, [], 9).wood).toBe(farm.wood)
    expect(result.plan[1].commandTime).toBe(10)
})

test("exact cargo outranks a lower ID with the same whole load, and equal cargo breaks ties by ID", () => {
    const resume = createWorkerEvent({ type: "make-active", commandTime: 0.03, count: 1, travelDuration: 2.04 }, "light")
    // Worker 0 arrives at 2.07 and worker 1 at 2. Each has 15 whole wood at 5.1.
    const staggered = simulate([idle(0.01), resume, immediate(5.1)], { ...economy, orderDelay: 0 })
    expect(staggered.plan[2]).toMatchObject({ workerId: 1, woodReturn: { delivered: 15 } })
    expect(simulate([immediate(5.1)], { ...economy, orderDelay: 0 }).plan[0].workerId).toBe(0)
})

test("outbound workers, sub-unit cargo, and workers returning with a full load leave gathering unchanged", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const result = simulate([immediate(1), immediate(2.1), immediate(12)], settings)
    expect(result.plan.map(action => action.blockedReason)).toEqual([
        "No wood gatherer is actively chopping.", "No eligible gatherer has at least one whole wood.",
        "No wood gatherer is actively chopping.",
    ])
    expect(result.deliveries).toEqual(simulate([], settings).deliveries)
})

test("a finer imported command below one whole wood remains blocked", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    expect(simulate([immediate(2.199999999999996)], settings).plan[0].blockedReason).toMatch(/one whole wood/)
    expect(simulate([immediate(2.2)], settings).plan[0].woodReturn?.delivered).toBe(1)
    expect(simulate([immediate(268.2)], settings).plan[0].woodReturn?.delivered).toBe(1)
    expect(simulate([immediate(1402.6)], settings).plan[0].woodReturn?.delivered).toBe(3)
})

test("a preceding no-op at the same time does not turn a completed load into a partial return", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1, woodTravelTime: 0.1, woodGatherTime: 0.2, orderDelay: 0 }
    const result = simulate([active(0.3), immediate(0.3)], settings)
    expect(result.plan[1].blockedReason).toMatch(/actively chopping/)
    expect(result.deliveries[0]).toEqual({ time: 0.4, worker: 0, gold: 0, wood: 50 })
})

test("a due deposit precedes death, but death during the return discards the load", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const delivered = simulate([immediate(5), kill(7)], settings)
    expect(delivered.plan[0]).toMatchObject({ workerId: 0, finishTime: 7, woodReturn: { delivered: 15 } })
    expect(delivered.deliveries).toContainEqual({ time: 7, worker: 0, gold: 0, wood: 15 })
    const interrupted = simulate([immediate(5), kill(6)], settings)
    expect(interrupted.plan[0]).toMatchObject({ workerId: 0, finishTime: null, blocked: true, woodReturn: { endTime: 6, delivered: 0 } })
    expect(interrupted.plan[0].blockedReason).toMatch(/killed/)
    expect(interrupted.deliveries).toHaveLength(0)
})

test("same-time worker commands follow row order and interrupted wood can be gathered into the next full load", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1 }
    const order = [immediate(5), idle(5), active(10)]
    const result = simulate(order, settings)
    expect(result.plan[0].blockedReason).toMatch(/made idle/)
    expect(result.deliveries[0]).toEqual({ time: 19, worker: 0, gold: 0, wood: 50 })
    expect(workerAllocationAt(settings, result.orderedPlan, 5)).toMatchObject({ idle: 1, wood: 0 })
    const reordered = simulate([order[1], order[0], order[2]], settings)
    expect(reordered.plan[1].blockedReason).toMatch(/actively chopping/)
})

test("a construction assignment interrupts a partial return before the deposit", () => {
    const settings = { ...economy, workerCount: 1, woodWorkers: 1, startingGold: 10000, startingWood: 10000,
        orderDelay: 6, constructionStartDelay: 1 }
    const result = simulate([immediate(5), farm], settings)
    expect(result.plan[1]).toMatchObject({ commandTime: 6, workerId: 0 })
    expect(result.plan[0].blockedReason).toMatch(/construction/)
    expect(result.deliveries[0].wood).toBe(50)
    expect(result.deliveries[0].time).toBeGreaterThan(result.plan[1].finishTime!)
})

test("partial wood becomes available on deposit and advances construction by the normal order delay", () => {
    const settings = { ...economy, startingGold: 10000, startingWood: farm.wood - 15 }
    const result = simulate([immediate(5), farm], settings)
    expect(resourceAt(settings, result.deliveries, [], 6.99).wood).toBe(farm.wood - 15)
    expect(resourceAt(settings, result.deliveries, [], 7).wood).toBe(farm.wood)
    expect(result.plan[1].commandTime).toBe(8)
    expect(simulate([farm], settings).plan[0].commandTime).toBe(15)
    const edited = [immediate(5.2), farm]
    expect(simulateBuildOrder(edited, settings, 4, 200, settings.foodPerFarm, "Castle", { previous: result }))
        .toEqual(simulate(edited, settings))
})

test("return travel grows and uses the completed Sawmill route when present", () => {
    const settings = { ...economy, woodTravelTimeIncreaseBase: 1, sawmillWoodTravelTime: 1,
        workerCount: 1, woodWorkers: 1, startingGold: 10000, startingWood: 10000 }
    expect(simulate([immediate(61)], settings).plan[0].finishTime).toBe(64)
    const sawmill = factions.light.items.find(item => item.id === "sawmill")!
    const prior = simulate([sawmill], settings)
    const chopping = prior.deliveries[0].time - settings.sawmillWoodTravelTime - 1
    const result = simulate([sawmill, immediate(chopping)], settings)
    expect(result.plan[1].finishTime).toBe(chopping + 1)
})

test("Whip affects partial gathering and travel while Lumber Gathering only boosts the full load", () => {
    const settings = { ...economy, startingMana: 500, baseManaLimit: 500 }
    const whip = createScrollAction({ type: "use-scroll", scrollId: "whip", commandTime: 1 }, "dark")
    const dark = simulate([whip, immediate(5)], settings, "dark")
    expect(dark.plan[1].woodReturn?.delivered).toBe(18)
    expect(dark.plan[1].finishTime).toBeCloseTo(5 + 2 / 1.15)
    const lumber = createScrollAction({ type: "use-scroll", scrollId: "lumber-gathering", commandTime: 1 }, "light")
    const light = simulate([lumber, immediate(5)], settings)
    expect(light.deliveries[0].wood).toBe(15)
    expect(light.deliveries[1].wood).toBeGreaterThan(50)
})

test("timed JSON and share links preserve the immediate command and recompute the outcome", () => {
    const order = [immediate(8)]
    const settings = economyFromProfile(initialGameProfile)
    const original = simulate(order, settings)
    const json = serializeBuildOrder("light", initialGameProfile, original.plan, true)
    const link = createShareableLink("https://example.com", "light", initialGameProfile, original.plan)
    for (const reopened of [parseBuildOrder(json), parseShareableLink(new URL(link).hash)]) {
        expect(reopened?.buildOrder).toEqual(order)
        expect(simulate(reopened!.buildOrder, settings)).toEqual(original)
    }
})

test.each([25, 50])("JSON and share links retain target %s even when it exceeds the active profile limit", target => {
    const order = [waitForWood(8, target)]
    const settings = economyFromProfile(initialGameProfile)
    const original = simulate(order, settings)
    const json = serializeBuildOrder("light", initialGameProfile, original.plan)
    const link = createShareableLink("https://example.com", "light", initialGameProfile, original.plan)
    for (const reopened of [parseBuildOrder(json), parseShareableLink(new URL(link).hash)]) {
        expect(reopened?.buildOrder).toEqual(order)
        const result = simulate(reopened!.buildOrder, settings)
        expect(result).toEqual(original)
        if (target === 50) {
            expect(result.plan[0].blockedReason).toMatch(/from 1 to 49/)
            expect(result.deliveries).toEqual(simulate([], settings).deliveries)
            expect(simulate(reopened!.buildOrder, { ...settings, woodPerTrip: 51 }).plan[0].woodReturn?.delivered).toBe(50)
        } else {
            expect(result.plan[0].woodReturn?.delivered).toBe(25)
        }
    }
})

test.each([0, 2.5, "2", null])("the JSON importer rejects malformed wood target %p", target => {
    const result = simulate([waitForWood(8, 5)])
    const document = JSON.parse(serializeBuildOrder("light", initialGameProfile, result.plan))
    document.buildOrder[1].target = target
    expect(() => parseBuildOrder(JSON.stringify(document))).toThrow(/target must be a positive integer/)
})
