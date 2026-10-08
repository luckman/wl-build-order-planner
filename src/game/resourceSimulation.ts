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
    constructionStartDelay: number
}

export type ResourceDelivery = { time: number; gold: number; wood: number; worker: number }
export type ResourcePoint = { time: number; gold: number; wood: number }
export type WorkerStart = { time: number; assignment: "gold" | "wood" }

export type GatheringWorker = {
    id: number
    assignment: "gold" | "wood" | "idle"
    state: "idle" | "outbound" | "waiting" | "gathering" | "deposit" | "construction"
    stateSince: number
    nextAt: number
}

export type WorkerAllocation = {
    total: number
    gold: number
    wood: number
    busyOrIdle: number
}

export const INITIAL_COMMAND_DELAY = 1
export const INITIAL_GOLD_TRAVEL_REDUCTION = 1

type WorkerStateAction = {
    item: { id: string; kind: string }
    commandTime: number | null
    finishTime: number | null
    workerReturnTime: number | null
    workerId: number | null
}

/** Chronological worker simulation shared by income previews and build scheduling. */
export class WorkerEconomy {
    workers: GatheringWorker[] = []
    deliveries: ResourceDelivery[] = []
    time = 0
    private mineWorker: number | null = null
    private delayedInitialWoodWorkerIds: number[] = []

    constructor(private settings: EconomySettings) {
        for (let i = 0; i < settings.goldWorkers; i++) {
            this.addWorker("gold", true)
        }
        for (let i = 0; i < settings.woodWorkers; i++) {
            const worker = this.addWorker(i === 0 ? "wood" : "idle")
            if (i > 0) {
                this.delayedInitialWoodWorkerIds.push(worker.id)
            }
        }
        for (let i = this.workers.length; i < settings.workerCount; i++) {
            this.addWorker("idle")
        }
    }

    addWorker(assignment: GatheringWorker["assignment"], isInitialGoldWorker = false) {
        const worker: GatheringWorker = {
            id: this.workers.length,
            assignment,
            state: "idle",
            stateSince: this.time,
            nextAt: Infinity,
        }
        this.workers.push(worker)
        if (assignment !== "idle") {
            const outboundTravel =
                assignment === "gold" && isInitialGoldWorker
                    ? Math.max(0, this.settings.goldOutboundTravel - INITIAL_GOLD_TRAVEL_REDUCTION)
                    : this.travel(assignment)
            this.transition(worker, "outbound", outboundTravel)
        }
        return worker
    }

    private travel(assignment: "gold" | "wood") {
        return assignment === "gold" ? this.settings.goldOutboundTravel : this.settings.woodOutboundTravel
    }

    private transition(worker: GatheringWorker, state: GatheringWorker["state"], duration: number) {
        worker.state = state
        worker.stateSince = this.time
        worker.nextAt = this.time + Math.max(0, duration)
    }

    private arrive(worker: GatheringWorker) {
        if (worker.assignment === "gold") {
            this.transition(worker, "waiting", Infinity)
        } else if (worker.assignment === "wood") {
            this.transition(worker, "gathering", Math.max(0.001, this.settings.woodGatherTime))
        } else {
            this.transition(worker, "idle", Infinity)
        }
    }

    private startMine() {
        if (this.mineWorker !== null) {
            return
        }
        const next = this.workers
            .filter((worker) => worker.state === "waiting")
            .sort((a, b) => a.stateSince - b.stateSince || a.id - b.id)[0]
        if (next) {
            this.mineWorker = next.id
            this.transition(next, "gathering", Math.max(0.001, this.settings.goldGatherTime))
        }
    }

    get nextEventTime() {
        return Math.min(
            ...this.workers.map((worker) => worker.nextAt),
            this.delayedInitialWoodWorkerIds.length ? INITIAL_COMMAND_DELAY : Infinity,
        )
    }

    advanceTo(time: number) {
        while (this.nextEventTime <= time) {
            this.time = this.nextEventTime
            if (this.delayedInitialWoodWorkerIds.length && this.time === INITIAL_COMMAND_DELAY) {
                for (const workerId of this.delayedInitialWoodWorkerIds) {
                    const worker = this.workers[workerId]
                    worker.assignment = "wood"
                    this.transition(worker, "outbound", this.travel("wood"))
                }
                this.delayedInitialWoodWorkerIds = []
            }
            // Process simultaneous arrivals/departures before assigning the mine slot.
            for (const worker of this.workers.filter((candidate) => candidate.nextAt === this.time)) {
                if (worker.state === "outbound" || worker.state === "construction") {
                    this.arrive(worker)
                } else if (worker.state === "gathering") {
                    if (worker.assignment === "gold") {
                        this.mineWorker = null
                    }
                    this.transition(
                        worker,
                        "deposit",
                        worker.assignment === "gold" ? this.settings.goldReturnTravel : this.settings.woodReturnTravel,
                    )
                } else if (worker.state === "deposit") {
                    this.deliveries.push({
                        time: this.time,
                        worker: worker.id,
                        gold: worker.assignment === "gold" ? this.settings.goldPerTrip : 0,
                        wood: worker.assignment === "wood" ? this.settings.woodPerTrip : 0,
                    })
                    if (worker.assignment !== "idle") {
                        this.transition(worker, "outbound", this.travel(worker.assignment))
                    }
                }
            }
            this.startMine()
        }
        this.time = time
    }

    selectBuilder() {
        const amount = (worker: GatheringWorker) => {
            const yieldPerTrip = worker.assignment === "gold" ? this.settings.goldPerTrip : this.settings.woodPerTrip
            if (worker.state === "deposit") {
                return yieldPerTrip
            }
            if (worker.state === "gathering") {
                return (yieldPerTrip * (this.time - worker.stateSince)) / Math.max(0.001, this.settings.woodGatherTime)
            }
            return 0
        }
        const priority = (worker: GatheringWorker) =>
            worker.state === "idle" ? 0 : worker.assignment === "wood" ? 1 : 2
        return this.workers
            .filter(
                (worker) =>
                    worker.state !== "construction" && !(worker.assignment === "gold" && worker.state === "gathering"),
            )
            .sort((a, b) => priority(a) - priority(b) || amount(a) - amount(b) || a.id - b.id)[0]
    }

    construct(worker: GatheringWorker, buildTime: number) {
        // Interrupted cargo is discarded. Return directly to the resource and start gathering again.
        this.transition(worker, "construction", 2 * this.settings.constructionStartDelay + buildTime)
    }
}

/**
 * Creates discrete delivery events. Gold workers contend for a single mine;
 * wood workers gather independently. This deliberately models trips rather
 * than approximating income as a per-second rate.
 */
export function createDeliveries(
    settings: EconomySettings,
    until: number,
    workerStarts: WorkerStart[] = [],
): ResourceDelivery[] {
    const simulation = new WorkerEconomy(settings)
    for (const start of [...workerStarts].sort((a, b) => a.time - b.time)) {
        if (start.time > until) {
            break
        }
        simulation.advanceTo(start.time)
        simulation.addWorker(start.assignment)
    }
    simulation.advanceTo(until)
    return simulation.deliveries
}

export function resourceAt(
    settings: EconomySettings,
    deliveries: ResourceDelivery[],
    spending: Array<{ time: number; gold: number; wood: number }>,
    time: number,
): ResourcePoint {
    const resources = [...deliveries, ...spending]
        .filter((event) => event.time <= time)
        .reduce<{ gold: number; wood: number }>(
            (resources, event) => ({ gold: resources.gold + event.gold, wood: resources.wood + event.wood }),
            { gold: settings.startingGold, wood: settings.startingWood },
        )
    return { time, ...resources }
}

/** Returns the worker allocation at a command timestamp, including builders in transit. */
export function workerAllocationAt(
    settings: EconomySettings,
    actions: WorkerStateAction[],
    time: number,
): WorkerAllocation {
    const simulation = new WorkerEconomy(settings)
    const saturation = Math.max(
        1,
        Math.ceil(
            (settings.goldOutboundTravel + settings.goldGatherTime + settings.goldReturnTravel) /
                Math.max(0.001, settings.goldGatherTime),
        ),
    )
    const events = actions
        .flatMap((action) => {
            const events: Array<{
                time: number
                type: "worker" | "construction"
                workerId?: number
                duration?: number
            }> = []
            if ((action.item.id === "worker" || action.item.id === "slave") && action.finishTime !== null) {
                events.push({ time: action.finishTime, type: "worker" })
            }
            if (
                (action.item.kind === "building" || action.item.kind === "upgrade") &&
                action.commandTime !== null &&
                action.workerReturnTime !== null &&
                action.workerId !== null
            ) {
                events.push({
                    time: action.commandTime,
                    type: "construction",
                    workerId: action.workerId,
                    duration: action.workerReturnTime - action.commandTime,
                })
            }
            return events
        })
        .filter((event) => event.time <= time)
        .sort((left, right) => left.time - right.time || (left.type === "worker" ? -1 : 1))

    for (const event of events) {
        simulation.advanceTo(event.time)
        if (event.type === "worker") {
            const goldWorkers = simulation.workers.filter(({ assignment }) => assignment === "gold").length
            simulation.addWorker(goldWorkers < saturation ? "gold" : "wood")
        } else {
            const worker = simulation.workers[event.workerId!]
            if (worker) {
                simulation.construct(worker, Math.max(0, event.duration! - 2 * settings.constructionStartDelay))
            }
        }
    }
    simulation.advanceTo(time)
    const busyOrIdle = simulation.workers.filter(
        ({ assignment, state }) => assignment === "idle" || state === "construction" || state === "idle",
    ).length
    return {
        total: simulation.workers.length,
        gold: simulation.workers.filter(({ assignment, state }) => assignment === "gold" && state !== "construction").length,
        wood: simulation.workers.filter(({ assignment, state }) => assignment === "wood" && state !== "construction").length,
        busyOrIdle,
    }
}
