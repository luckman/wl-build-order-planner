import { initialPlayerLevels } from "./playerLevels"
import { createDeliveries, WorkerEconomy } from "./resourceSimulation"

const settings = {
    startingGold: 0,
    startingWood: 0,
    startingMana: 35, baseManaLimit: 50, manaPerMinute: 10, manaPerTower: 50,
    workerCount: 4,
    goldWorkers: 4,
    woodWorkers: 0,
    ...initialPlayerLevels,
    foodPerFarm: 20,
    goldPerTrip: 50,
    woodPerTrip: 50,
    goldTravelTime: 4,
    goldGatherTime: 3,
    woodTravelTime: 4,
    woodGatherTime: 12,
    constructionStartDelay: 4,
    orderDelay: 1,
    sawmillWoodTravelTime: 0.5,
    woodTravelTimeIncreaseBase: 0.5,
    maxWoodTravelTime: 5,
    initialGoldTravelReduction: 1,
}

function requireBuilder(simulation: WorkerEconomy) {
    const worker = simulation.selectBuilder()
    if (!worker) {
        throw new Error("Expected an eligible builder")
    }
    return worker
}

test("shared travel times apply to both legs of each resource trip", () => {
    const simulation = new WorkerEconomy({
        ...settings, workerCount: 2, goldWorkers: 1, woodWorkers: 1,
        goldTravelTime: 2.5, woodTravelTime: 1.25,
    })
    simulation.advanceTo(30)
    expect(simulation.deliveries.filter(({ gold }) => gold).map(({ time }) => time)).toEqual([7, 15, 23])
    expect(simulation.deliveries.filter(({ wood }) => wood).map(({ time }) => time)).toEqual([14.5, 29])
})

test.each([0, 2.5, 7])("initial order delay %ss controls all additional initial wood gatherers", orderDelay => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 3, goldWorkers: 0, woodWorkers: 3, orderDelay })
    simulation.advanceTo(30)
    const firstTrips = simulation.deliveries.filter(({ wood }) => wood).slice(0, 3)
    expect(firstTrips.map(({ time }) => time)).toEqual([20, 20 + orderDelay, 20 + orderDelay])
    expect(firstTrips.map(({ worker }) => worker)).toEqual([0, 1, 2])
})

test.each([[0, 11], [2.5, 8.5], [10, 7]])("initial gold travel reduction %ss clamps outbound travel at zero", (initialGoldTravelReduction, firstDelivery) => {
    const deliveries = createDeliveries({ ...settings, workerCount: 1, goldWorkers: 1, initialGoldTravelReduction }, 25)
    expect(deliveries[0].time).toBe(firstDelivery)
    expect(deliveries[1].time - deliveries[0].time).toBe(11)
})

test("custom sawmill travel affects both legs, grows at variable intervals and resets", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0, sawmillWoodTravelTime: 1.25 })
    simulation.scheduleSawmill(10)
    simulation.scheduleSawmill(500)
    for (const [time, duration] of [[10, 1.25], [70, 1.75], [130, 2.25], [220, 2.75], [430, 3.75], [500, 1.25]]) {
        simulation.advanceTo(time)
        const worker = simulation.addWorker("wood")
        expect(worker.nextAt).toBe(time + duration)
        simulation.advanceTo(worker.nextAt + settings.woodGatherTime)
        expect(worker.nextAt - simulation.time).toBe(duration)
    }
})

test("wood return travel uses growth at departure while outbound travel stays unchanged", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0, woodGatherTime: 1 })
    simulation.advanceTo(119)
    const worker = simulation.addWorker("wood")
    expect(worker.nextAt).toBe(123)
    simulation.advanceTo(120)
    expect(worker.nextAt).toBe(123)
    simulation.advanceTo(124)
    expect(worker.nextAt).toBe(128.5)
    simulation.advanceTo(128.5)
    expect(simulation.deliveries[0].time).toBe(128.5)
})

test("zero sawmill travel still advances through gathering and delivers wood", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 1, goldWorkers: 0, woodWorkers: 1, sawmillWoodTravelTime: 0 })
    simulation.scheduleSawmill(0)
    simulation.advanceTo(30)
    expect(simulation.deliveries.map(({ time }) => time)).toEqual([16, 28])
})

test("gold mine serializes workers that arrive at the same time", () => {
    expect(createDeliveries(settings, 20).map(({ time, gold }) => [time, gold])).toEqual([
        [10, 50],
        [13, 50],
        [16, 50],
        [19, 50],
    ])
})

test("only initial gold miners receive the shorter opening trip to the mine", () => {
    const deliveries = createDeliveries({ ...settings, workerCount: 1, goldWorkers: 1, goldGatherTime: 3.1 }, 22)

    expect(deliveries.map(({ time }) => time)).toEqual([10.1, 21.2])
})

test("wood workers deliver independently", () => {
    expect(
        createDeliveries({ ...settings, goldWorkers: 0, woodWorkers: 2 }, 40)
            .filter(({ wood }) => wood)
            .map(({ time }) => time),
    ).toEqual([20, 21, 40])
})

test.each([16, 18])("a Sawmill finishing at %ss shortens new wood travel legs only", (finishTime) => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 2, goldWorkers: 1, woodWorkers: 1 })
    simulation.scheduleSawmill(finishTime)
    simulation.advanceTo(50)
    const woodTimes = simulation.deliveries.filter(({ wood }) => wood).map(({ time }) => time)
    expect(woodTimes).toEqual(finishTime === 16 ? [16.5, 29.5, 42.5] : [20, 33, 46])
    expect(simulation.deliveries.filter(({ gold }) => gold)).toEqual(
        createDeliveries({ ...settings, workerCount: 1, goldWorkers: 1 }, 50),
    )
})

test("a Sawmill does not shorten an outbound wood leg already in progress", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 1, goldWorkers: 0, woodWorkers: 1 })
    simulation.scheduleSawmill(2)
    simulation.advanceTo(30)
    expect(simulation.deliveries.map(({ time }) => time)).toEqual([16.5, 29.5])
})

test.each([
    [39.9, 0.5, 1], [40, 1, 1], [70, 1.5, 1.5], [100, 1.5, 1.5],
    [129.9, 1.5, 2], [130, 2, 2], [190, 2.5, 2.5], [280, 3, 3],
    [370, 3.5, 3.5], [490, 4, 4], [610, 4.5, 4.5], [760, 5, 5], [1700, 5, 5],
])("wood travel starting at %ss takes %ss since Sawmill completion at 10s", (time, duration, returnDuration) => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0 })
    simulation.scheduleSawmill(10)
    simulation.advanceTo(time)
    const worker = simulation.addWorker("wood")
    expect(worker.nextAt).toBe(time + duration)
    simulation.advanceTo(worker.nextAt + settings.woodGatherTime)
    expect(worker.state).toBe("deposit")
    expect(worker.nextAt - simulation.time).toBe(returnDuration)
})

test("only the latest completed Sawmill resets travel, regardless of scheduling order", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0 })
    simulation.scheduleSawmill(200)
    simulation.scheduleSawmill(10)
    simulation.scheduleSawmill(100)
    for (const [time, duration] of [[9, 4], [99, 1.5], [100, 0.5], [160, 1.5], [200, 0.5], [260, 1.5], [620, 3.5], [1700, 5]]) {
        simulation.advanceTo(time)
        expect(simulation.addWorker("wood").nextAt).toBe(time + duration)
    }
})

test("growth boundaries and new Sawmills preserve travel already underway", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0 })
    simulation.scheduleSawmill(10)
    simulation.scheduleSawmill(41)
    simulation.advanceTo(39.9)
    const beforeGrowth = simulation.addWorker("wood")
    simulation.advanceTo(40)
    expect(beforeGrowth.nextAt).toBe(40.4)
    simulation.advanceTo(40.5)
    const beforeReset = simulation.addWorker("wood")
    simulation.advanceTo(41)
    expect(beforeReset.nextAt).toBe(41.5)
    const afterReset = simulation.addWorker("wood")
    expect(afterReset.nextAt).toBe(41.5)
})

test("only the first initial wood gatherer receives its command immediately", () => {
    expect(
        createDeliveries({ ...settings, workerCount: 2, goldWorkers: 0, woodWorkers: 2 }, 25)
            .filter(({ wood }) => wood)
            .map(({ time }) => time),
    ).toEqual([20, 21])
})

test("builders prefer idle workers, then wood, then eligible gold workers", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 3, goldWorkers: 1, woodWorkers: 1 })
    simulation.advanceTo(5)
    const idle = requireBuilder(simulation)
    expect(idle.assignment).toBe("idle")
    simulation.construct(idle, 30)
    const wood = requireBuilder(simulation)
    expect(wood.assignment).toBe("wood")
    simulation.construct(wood, 30)
    expect(simulation.selectBuilder()).toBeUndefined() // Gold worker is still inside the mine.
    simulation.advanceTo(7)
    expect(simulation.selectBuilder()?.assignment).toBe("gold")
})

test("wood selection prefers an outbound worker, then the least gathered cargo", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 1, goldWorkers: 0, woodWorkers: 1 })
    simulation.advanceTo(2)
    const newer = simulation.addWorker("wood")
    simulation.advanceTo(5)
    expect(simulation.selectBuilder()?.id).toBe(newer.id) // Still moving to the tree.
    simulation.advanceTo(8)
    expect(simulation.selectBuilder()?.id).toBe(newer.id) // Two seconds gathered versus four.
    simulation.advanceTo(17)
    expect(simulation.selectBuilder()?.id).toBe(newer.id) // Partial cargo versus a full returning load.
})

test("construction cancels interrupted wood and resumes empty at the resource after return travel", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 1, goldWorkers: 0, woodWorkers: 1 })
    simulation.advanceTo(5)
    simulation.construct(requireBuilder(simulation), 30)
    simulation.advanceTo(58.9)
    expect(simulation.deliveries).toEqual([])
    simulation.advanceTo(59)
    expect(simulation.deliveries).toEqual([{ time: 59, gold: 0, wood: 50, worker: 0 }])
})

test("taking a queued gold worker does not reserve or block the mine", () => {
    const simulation = new WorkerEconomy(settings)
    simulation.advanceTo(4)
    expect(simulation.selectBuilder()?.id).toBe(1)
    simulation.construct(requireBuilder(simulation), 30)
    simulation.advanceTo(20)
    expect(simulation.deliveries.map(({ time, worker }) => [time, worker])).toEqual([
        [10, 0],
        [13, 2],
        [16, 3],
    ])
})

test("interrupting a gold return discards cargo and restarts mining after construction travel", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 1, goldWorkers: 1 })
    simulation.advanceTo(7)
    simulation.construct(requireBuilder(simulation), 30)
    simulation.advanceTo(51.9)
    expect(simulation.deliveries).toEqual([])
    simulation.advanceTo(52)
    expect(simulation.deliveries).toEqual([{ time: 52, gold: 50, wood: 0, worker: 0 }])
})
