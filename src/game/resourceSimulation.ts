import type { PlayerBuildingLevels } from "./playerLevels"
import { GOLD_RUSH } from "./scrolls"

export type EconomySettings = PlayerBuildingLevels & {
    startingGold: number
    startingWood: number
    startingMana: number
    baseManaLimit: number
    manaPerMinute: number
    manaPerTower: number
    timeBetweenScrolls?: number
    scrollLevel?: number
    workerCount: number
    goldWorkers: number
    woodWorkers: number
    goldPerTrip: number
    woodPerTrip: number
    foodPerFarm: number
    goldTravelTime: number
    goldGatherTime: number
    woodTravelTime: number
    woodGatherTime: number
    constructionStartDelay: number
    orderDelay: number
    sawmillWoodTravelTime: number
    initialGoldTravelReduction: number
}

export type ResourceDelivery = { time: number; gold: number; wood: number; worker: number }
export type ResourcePoint = { time: number; gold: number; wood: number }

/** Regenerate only into available capacity; income while capped is discarded. */
export function manaAt(
    settings: Pick<EconomySettings, "startingMana" | "baseManaLimit" | "manaPerMinute" | "manaPerTower">,
    actions: Array<{ item: { id: string; kind: string }; finishTime: number | null;
        commandTime?: number | null; manaCost?: number; blocked?: boolean }>,
    time: number,
): { time: number; mana: number; limit: number } {
    let limit = settings.baseManaLimit
    let mana = Math.min(settings.startingMana, limit)
    let previousTime = 0
    const events = actions.flatMap(action => {
        if (action.blocked) return []
        if (action.item.id === "tower-of-mana" && action.item.kind === "building" &&
            action.finishTime !== null && action.finishTime <= time)
            return [{ time: action.finishTime, capacity: settings.manaPerTower, spend: 0 }]
        if (action.manaCost && action.commandTime != null && action.commandTime <= time)
            return [{ time: action.commandTime, capacity: 0, spend: action.manaCost }]
        return []
    }).sort((a, b) => a.time - b.time || b.capacity - a.capacity)
    for (const event of events) {
        mana = Math.min(limit, mana + (event.time - previousTime) * settings.manaPerMinute / 60)
        limit += event.capacity
        mana = Math.max(0, mana - event.spend)
        previousTime = event.time
    }
    mana = Math.min(limit, mana + Math.max(0, time - previousTime) * settings.manaPerMinute / 60)
    return { time, mana, limit }
}
export type WorkerStart = { time: number; assignment: "gold" | "wood" }

export type GatheringWorker = {
    id: number
    assignment: "gold" | "wood" | "idle"
    state: "idle" | "outbound" | "waiting" | "gathering" | "deposit" | "construction"
    stateSince: number
    nextAt: number
    cargoGold: number
}

export type WorkerAllocation = {
    total: number
    gold: number
    wood: number
    busyOrIdle: number
}

export const SAWMILL_WOOD_TRAVEL_GROWTH_PER_MINUTE = 0.5
export const MAX_SAWMILL_WOOD_TRAVEL_TIME = 4

type WorkerStateAction = {
    item: { id: string; kind: string }
    commandTime: number | null
    finishTime: number | null
    workerReturnTime: number | null
    workerId: number | null
    startTime?: number | null
    blocked?: boolean
}

/** Chronological worker simulation shared by income previews and build scheduling. */
export class WorkerEconomy {
    workers: GatheringWorker[] = []
    deliveries: ResourceDelivery[] = []
    time = 0
    private mineWorker: number | null = null
    private delayedInitialWoodWorkerIds: number[] = []
    private sawmillCompletions: number[] = []
    private goldRushWindows: Array<{ startTime: number; finishTime: number; bonus: number }> = []

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
            cargoGold: 0,
        }
        this.workers.push(worker)
        if (assignment !== "idle") {
            const outboundTravel =
                assignment === "gold" && isInitialGoldWorker
                    ? Math.max(0, this.settings.goldTravelTime - this.settings.initialGoldTravelReduction)
                    : this.travel(assignment)
            this.transition(worker, "outbound", outboundTravel)
        }
        return worker
    }

    scheduleSawmill(finishTime: number) {
        this.sawmillCompletions.push(finishTime)
    }

    scheduleGoldRush(startTime: number, finishTime: number, bonus: number) {
        this.goldRushWindows.push({ startTime, finishTime, bonus })
    }

    private travel(assignment: "gold" | "wood") {
        if (assignment === "wood") {
            const latestCompletion = Math.max(-Infinity, ...this.sawmillCompletions.filter(time => time <= this.time))
            if (Number.isFinite(latestCompletion)) {
                const fullMinutes = Math.floor((this.time - latestCompletion) / 60)
                return Math.min(MAX_SAWMILL_WOOD_TRAVEL_TIME,
                    this.settings.sawmillWoodTravelTime + SAWMILL_WOOD_TRAVEL_GROWTH_PER_MINUTE * fullMinutes)
            }
        }
        return assignment === "gold" ? this.settings.goldTravelTime : this.settings.woodTravelTime
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
            this.delayedInitialWoodWorkerIds.length ? this.settings.orderDelay : Infinity,
            ...this.sawmillCompletions.filter(time => time > this.time),
        )
    }

    advanceTo(time: number) {
        while (this.nextEventTime <= time) {
            this.time = this.nextEventTime
            if (this.delayedInitialWoodWorkerIds.length && this.time === this.settings.orderDelay) {
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
                        // Lock cargo at mine exit: start is inclusive, expiry is exclusive.
                        worker.cargoGold = this.settings.goldPerTrip + Math.max(0,
                            ...this.goldRushWindows.filter(window => window.startTime <= this.time && this.time < window.finishTime)
                                .map(window => window.bonus))
                    }
                    this.transition(
                        worker,
                        "deposit",
                        this.travel(worker.assignment === "gold" ? "gold" : "wood"),
                    )
                } else if (worker.state === "deposit") {
                    this.deliveries.push({
                        time: this.time,
                        worker: worker.id,
                        gold: worker.assignment === "gold" ? worker.cargoGold : 0,
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
                return worker.assignment === "gold" ? worker.cargoGold : yieldPerTrip
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
        worker.cargoGold = 0
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
    for (const action of actions) {
        if (action.item.kind === "scroll" && !action.blocked && action.startTime != null && action.finishTime !== null) {
            simulation.scheduleGoldRush(action.startTime, action.finishTime, GOLD_RUSH.goldBonus)
        }
        if (action.item.id === "sawmill" && action.finishTime !== null) {
            simulation.scheduleSawmill(action.finishTime)
        }
    }
    const saturation = Math.max(
        1,
        Math.ceil(
            (2 * settings.goldTravelTime + settings.goldGatherTime) /
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
