import { simulateBuildOrder } from "./buildSimulation"
import { factions } from "./gameData"
import type { EconomySettings } from "./resourceSimulation"

const economy: EconomySettings = {
    startingGold: 2000,
    startingWood: 2000,
    workerCount: 1,
    goldWorkers: 0,
    woodWorkers: 1,
    goldPerTrip: 50,
    woodPerTrip: 50,
    goldOutboundTravel: 4,
    goldReturnTravel: 4,
    goldGatherTime: 3,
    woodOutboundTravel: 4,
    woodReturnTravel: 4,
    woodGatherTime: 12,
    constructionStartDelay: 4,
}

function required<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error("Missing test catalog item")
    }
    return value
}

test.each(["light", "dark"] as const)("%s buildings finish before the builder becomes available again", (factionId) => {
    const faction = factions[factionId]
    const barracks = required(faction.items.find(({ id }) => id === "barracks"))
    const soldier = required(faction.items.find(({ producer, kind }) => producer === "Barracks" && kind === "unit"))
    const { plan } = simulateBuildOrder([barracks, soldier, barracks], economy, 2, 100, 20, faction.startingTownHall)
    expect(
        plan.map(({ commandTime, startTime, finishTime, workerReturnTime }) => [
            commandTime,
            startTime,
            finishTime,
            workerReturnTime,
        ]),
    ).toEqual([
        [0, 4, 34, 38],
        [34, 34, 34 + soldier.seconds, null],
        [38, 42, 72, 76],
    ])
    expect(plan[0].workerId).toBe(plan[2].workerId)
})

test("subsequent commands wait for income recomputed around construction", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan, deliveries } = simulateBuildOrder(
        [barracks, { ...barracks, wood: 50 }],
        { ...economy, startingWood: 150 },
        2,
        100,
        20,
        "Castle",
    )
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([0, 54])
    expect(deliveries[0]).toMatchObject({ time: 54, wood: 50 })
    expect(deliveries[1]).toMatchObject({ time: 108, wood: 50 })
})

test("a completed new worker can build while another worker remains occupied", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const worker = required(factions.light.items.find(({ id }) => id === "worker"))
    const { plan } = simulateBuildOrder([barracks, worker, barracks], economy, 2, 100, 20, "Castle")
    expect(plan.map(({ commandTime }) => commandTime)).toEqual([0, 0, 18])
    expect(plan[2].workerId).not.toBe(plan[0].workerId)
})

test("zero delay removes travel but still reserves the worker for construction", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [barracks, barracks],
        { ...economy, constructionStartDelay: 0 },
        2,
        100,
        20,
        "Castle",
    )
    expect(
        plan.map(({ commandTime, finishTime, workerReturnTime }) => [commandTime, finishTime, workerReturnTime]),
    ).toEqual([
        [0, 30, 30],
        [30, 60, 60],
    ])
})

test("construction is blocked without workers", () => {
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    expect(
        simulateBuildOrder([barracks], { ...economy, workerCount: 0, woodWorkers: 0 }, 0, 100, 20, "Castle").plan[0]
            .blocked,
    ).toBe(true)
})

test("a construction command waits for the only miner to exit the mine", () => {
    const upgrade = required(factions.light.items.find(({ kind }) => kind === "upgrade"))
    const barracks = required(factions.light.items.find(({ id }) => id === "barracks"))
    const { plan } = simulateBuildOrder(
        [
            { ...upgrade, seconds: 5, prerequisites: ["Castle"] },
            { ...barracks, prerequisites: [upgrade.name] },
        ],
        { ...economy, goldWorkers: 1, woodWorkers: 0 },
        2,
        100,
        20,
        "Castle",
    )
    expect(plan[1]).toMatchObject({ commandTime: 7, startTime: 11, finishTime: 41, workerReturnTime: 45 })
})
