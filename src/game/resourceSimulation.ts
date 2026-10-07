export type EconomySettings = {
    startingGold: number
    startingWood: number
    workerCount: number
    goldWorkers: number
    woodWorkers: number
    goldPerTrip: number
    woodPerTrip: number
    goldOutboundTravel: number
    goldReturnTravel: number
    goldGatherTime: number
    woodOutboundTravel: number
    woodReturnTravel: number
    woodGatherTime: number
}

export type ResourceDelivery = { time: number; gold: number; wood: number; worker: number }
export type ResourcePoint = { time: number; gold: number; wood: number }
export type WorkerStart = { time: number; assignment: "gold" | "wood" }

const byTimeThenWorker = (a: { time: number; worker: number }, b: { time: number; worker: number }) =>
    a.time - b.time || a.worker - b.worker

/**
 * Creates discrete delivery events. Gold workers contend for a single mine;
 * wood workers gather independently. This deliberately models trips rather
 * than approximating income as a per-second rate.
 */
export function createDeliveries(settings: EconomySettings, until: number, workerStarts: WorkerStart[] = []): ResourceDelivery[] {
    const deliveries: ResourceDelivery[] = []
    const goldStarts = [...Array(settings.goldWorkers).fill(0), ...workerStarts.filter(({ assignment }) => assignment === "gold").map(({ time }) => time)]
    const goldArrivals = goldStarts.map((start, worker) => ({
        time: start + settings.goldOutboundTravel,
        worker,
    }))
    let mineAvailableAt = 0

    while (goldArrivals.length) {
        goldArrivals.sort(byTimeThenWorker)
        const next = goldArrivals.shift()
        if (!next) break
        const mineStart = Math.max(next.time, mineAvailableAt)
        const deliveryTime = mineStart + settings.goldGatherTime + settings.goldReturnTravel
        if (deliveryTime > until) continue
        deliveries.push({ time: deliveryTime, gold: settings.goldPerTrip, wood: 0, worker: next.worker })
        mineAvailableAt = mineStart + settings.goldGatherTime
        goldArrivals.push({ time: deliveryTime + settings.goldOutboundTravel, worker: next.worker })
    }

    const woodStarts = [...Array(settings.woodWorkers).fill(0), ...workerStarts.filter(({ assignment }) => assignment === "wood").map(({ time }) => time)]
    for (let worker = 0; worker < woodStarts.length; worker += 1) {
        const cycle = settings.woodOutboundTravel + settings.woodGatherTime + settings.woodReturnTravel
        for (let time = woodStarts[worker] + cycle; time <= until; time += cycle) {
            deliveries.push({ time, gold: 0, wood: settings.woodPerTrip, worker })
        }
    }
    return deliveries.sort((a, b) => a.time - b.time || b.gold - a.gold || a.worker - b.worker)
}

export function resourceAt(
    settings: EconomySettings,
    deliveries: ResourceDelivery[],
    spending: Array<{ time: number; gold: number; wood: number }>,
    time: number,
): ResourcePoint {
    const resources = [...deliveries, ...spending].filter((event) => event.time <= time).reduce<{ gold: number; wood: number }>(
        (resources, event) => ({ gold: resources.gold + event.gold, wood: resources.wood + event.wood }),
        { gold: settings.startingGold, wood: settings.startingWood },
    )
    return { time, ...resources }
}
