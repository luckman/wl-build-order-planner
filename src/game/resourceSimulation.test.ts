import { createDeliveries, WorkerEconomy } from "./resourceSimulation"

const settings = {
    startingGold: 0,
    startingWood: 0,
    workerCount: 4,
    goldWorkers: 4,
    woodWorkers: 0,
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

function requireBuilder(simulation: WorkerEconomy) {
    const worker = simulation.selectBuilder()
    if (!worker) {
        throw new Error("Expected an eligible builder")
    }
    return worker
}

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
    [69.9, 0.5, 1], [70, 1, 1], [130, 1.5, 1.5], [190, 2, 2],
    [250, 2.5, 2.5], [310, 3, 3], [370, 3.5, 3.5], [430, 4, 4], [1000, 4, 4],
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
    for (const [time, duration] of [[9, 4], [99, 1], [100, 0.5], [160, 1], [200, 0.5], [260, 1], [620, 4]]) {
        simulation.advanceTo(time)
        expect(simulation.addWorker("wood").nextAt).toBe(time + duration)
    }
})

test("minute boundaries and new Sawmills preserve travel already underway", () => {
    const simulation = new WorkerEconomy({ ...settings, workerCount: 0, goldWorkers: 0 })
    simulation.scheduleSawmill(10)
    simulation.scheduleSawmill(71)
    simulation.advanceTo(69.9)
    const beforeMinute = simulation.addWorker("wood")
    simulation.advanceTo(70)
    expect(beforeMinute.nextAt).toBe(70.4)
    simulation.advanceTo(70.5)
    const beforeReset = simulation.addWorker("wood")
    simulation.advanceTo(71)
    expect(beforeReset.nextAt).toBe(71.5)
    const afterReset = simulation.addWorker("wood")
    expect(afterReset.nextAt).toBe(71.5)
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
