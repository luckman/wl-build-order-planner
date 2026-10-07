import { createDeliveries } from "./resourceSimulation"

const settings = {
    startingGold: 0, startingWood: 0, workerCount: 4, goldWorkers: 4, woodWorkers: 0,
    goldPerTrip: 50, woodPerTrip: 50, goldOutboundTravel: 4, goldReturnTravel: 4,
    goldGatherTime: 3, woodOutboundTravel: 4, woodReturnTravel: 4, woodGatherTime: 12,
}

test("gold mine serializes workers that arrive at the same time", () => {
    expect(createDeliveries(settings, 20).map(({ time, gold }) => [time, gold])).toEqual([
        [11, 50], [14, 50], [17, 50], [20, 50],
    ])
})

test("wood workers deliver independently", () => {
    expect(createDeliveries({ ...settings, goldWorkers: 0, woodWorkers: 2 }, 40)
        .filter(({ wood }) => wood)
        .map(({ time }) => time)).toEqual([20, 20, 40, 40])
})
