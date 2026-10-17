import { growingWoodTravelTime } from "./gatheringRules"
import { MAX_PLAN_ACTIONS, MAX_SIMULATION_STEPS, validateEconomyDurations, validatePlanTime } from "./plannerLimits"
import type { PlayerBuildingLevels } from "./playerLevels"
import { scrollEffect, WHIP, type ScrollId } from "./scrolls"

export type EconomySettings = PlayerBuildingLevels & {
    startingGold: number
    startingWood: number
    startingMana: number
    baseManaLimit: number
    manaPerMinute: number
    manaFromManaWells?: number
    manaPerTower: number
    timeBetweenScrolls?: number
    scrollCooldownReduction?: number
    lightGoldRushLevel?: number
    lightLumberGatheringLevel?: number
    darkWhipLevel?: number
    darkLegionsCallLevel?: number
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
    woodTravelTimeIncreaseBase: number
    maxWoodTravelTime: number
    initialGoldTravelReduction: number
}

export type ResourceDelivery = { time: number; gold: number; wood: number; worker: number }
export type ResourcePoint = { time: number; gold: number; wood: number }

/** Regenerate only into available capacity; income while capped is discarded. */
export function manaAt(
    settings: Pick<EconomySettings, "startingMana" | "baseManaLimit" | "manaPerMinute" | "manaPerTower" | "manaFromManaWells">,
    actions: Array<{ item: { id: string; kind: string }; finishTime: number | null;
        commandTime?: number | null; manaCost?: number; blocked?: boolean }>,
    time: number,
): { time: number; mana: number; limit: number } {
    let limit = settings.baseManaLimit
    let mana = Math.min(settings.startingMana, limit)
    let previousTime = 0
    let wells = 0
    const events = actions.flatMap(action => {
        if (action.blocked) return []
        if (action.item.id === "tower-of-mana" && action.item.kind === "building" &&
            action.finishTime !== null && action.finishTime <= time)
            return [{ time: action.finishTime, capacity: settings.manaPerTower, spend: 0, wells: 0 }]
        if (action.item.kind === "mana-well" && action.commandTime != null && action.commandTime <= time)
            return [{ time: action.commandTime, capacity: 0, spend: 0, wells: action.item.id === "mana-well-is-captured" ? 1 : -1 }]
        if (action.manaCost && action.commandTime != null && action.commandTime <= time)
            return [{ time: action.commandTime, capacity: 0, spend: action.manaCost, wells: 0 }]
        return []
    }).sort((a, b) => a.time - b.time || b.capacity - a.capacity)
    for (const event of events) {
        mana = Math.min(limit, mana + (event.time - previousTime) * (settings.manaPerMinute + wells * (settings.manaFromManaWells ?? 0)) / 60)
        wells = Math.max(0, wells + event.wells)
        limit += event.capacity
        mana = Math.max(0, mana - event.spend)
        previousTime = event.time
    }
    mana = Math.min(limit, mana + Math.max(0, time - previousTime) * (settings.manaPerMinute + wells * (settings.manaFromManaWells ?? 0)) / 60)
    return { time, mana, limit }
}
export type WorkerStart = { time: number; assignment: "gold" | "wood" }

export type GatheringWorker = {
    id: number
    assignment: "gold" | "wood" | "idle"
    state: "idle" | "outbound" | "waiting" | "gathering" | "deposit" | "construction-outbound" | "construction" | "construction-return" | "killed"
    stateSince: number
    nextAt: number
    cargoGold: number
    cargoWood: number
    whipUntil: number
    constructionDuration?: number
    constructionReturnDuration?: number
}

export type WhipWindow = { startTime: number; finishTime: number }
const isBuildingWorker = (worker: GatheringWorker) => worker.state === "construction" ||
    worker.state === "construction-outbound" || worker.state === "construction-return"

export type WorkerAllocation = {
    total: number
    gold: number
    wood: number
    busyOrIdle: number
}

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
    private steps = 0
    private mineWorker: number | null = null
    private delayedInitialWoodWorkerIds: number[] = []
    private sawmillCompletions: number[] = []
    private lumberGatheringWindows: Array<{ startTime: number; finishTime: number; bonus: number }> = []
    private goldRushWindows: Array<{ startTime: number; finishTime: number; bonus: number }> = []
    private whipStarts: WhipWindow[] = []

    constructor(private settings: EconomySettings, private constructionWhipWindows: WhipWindow[] = []) {
        validateEconomyDurations(settings, Math.max(settings.workerCount, settings.goldWorkers + settings.woodWorkers))
        for (const count of [settings.workerCount, settings.goldWorkers, settings.woodWorkers]) {
            if (!Number.isInteger(count) || count < 0 || count > MAX_PLAN_ACTIONS + 5) throw new Error("Unsupported worker count.")
        }
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
        if (this.workers.length >= MAX_PLAN_ACTIONS + 5) throw new Error("Unsupported worker count.")
        const worker: GatheringWorker = {
            id: this.workers.length,
            assignment,
            state: "idle",
            stateSince: this.time,
            nextAt: Infinity,
            cargoGold: 0,
            cargoWood: 0,
            whipUntil: -Infinity,
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

    /** Construction workers cannot be selected; wood gatherers are killed before gold miners. */
    selectWorkerToKill() {
        const priority = (worker: GatheringWorker) => worker.assignment === "wood" || this.delayedInitialWoodWorkerIds.includes(worker.id)
            ? 0 : worker.assignment === "gold" ? 1 : 2
        return this.workers.filter(worker => !isBuildingWorker(worker) && worker.state !== "killed")
            .sort((a, b) => priority(a) - priority(b) || a.id - b.id)[0]
    }

    killWorker(workerId: number) {
        const worker = this.workers[workerId]
        if (!worker || worker.state === "killed" || isBuildingWorker(worker)) return false
        if (this.mineWorker === workerId) this.mineWorker = null
        this.delayedInitialWoodWorkerIds = this.delayedInitialWoodWorkerIds.filter(id => id !== workerId)
        worker.assignment = "idle"
        worker.cargoGold = 0
        worker.cargoWood = 0
        this.transition(worker, "killed", Infinity)
        this.startMine()
        return true
    }

    scheduleSawmill(finishTime: number) {
        this.sawmillCompletions.push(finishTime)
    }

    scheduleGoldRush(startTime: number, finishTime: number, bonus: number) {
        this.goldRushWindows.push({ startTime, finishTime, bonus })
    }

    scheduleLumberGathering(startTime: number, finishTime: number, bonus: number) {
        this.lumberGatheringWindows.push({ startTime, finishTime, bonus })
    }

    scheduleScroll(id: ScrollId, startTime: number, finishTime: number) {
        const { incomeBonus } = scrollEffect(id, this.settings)
        if (id === "gold-rush") this.scheduleGoldRush(startTime, finishTime, incomeBonus)
        else if (id === "lumber-gathering") this.scheduleLumberGathering(startTime, finishTime, incomeBonus)
        else this.whipStarts.push({ startTime, finishTime })
    }

    /** Planner approximation of the player stopping an approaching miner before casting.
     * This preparation happens at command time, separately from Whip's delayed effect.
     */
    prepareGoldWorkerForWhip() {
        const miners = this.workers.filter(worker => worker.assignment === "gold" &&
            worker.state !== "killed" && !isBuildingWorker(worker))
        if (miners.length < 4) return
        const traveler = miners.filter(worker => worker.state === "outbound")
            .sort((a, b) => a.nextAt - b.nextAt || a.id - b.id)[0]
        // Model the player's interruption as extra travel, still subject to movement bonuses.
        if (traveler) traveler.nextAt += 1 / this.rate(traveler)
    }

    private rate(worker: GatheringWorker, active = worker.whipUntil > this.time) {
        // Builder travel already includes future activation/expiry in its projection.
        // Rescaling it again here would apply the same movement bonus twice.
        if (!active) return 1
        if (worker.state === "outbound" || worker.state === "deposit") return WHIP.movementMultiplier
        if (worker.state === "gathering" && worker.assignment === "wood") {
            return Math.max(0.001, this.settings.woodGatherTime) / Math.max(0.001, this.settings.woodGatherTime - WHIP.woodTimeReduction)
        }
        return 1
    }

    private changeWhip(worker: GatheringWorker, until: number, wasActive: boolean) {
        const remaining = (worker.nextAt - this.time) * this.rate(worker, wasActive)
        worker.whipUntil = until
        worker.nextAt = this.time + remaining / this.rate(worker)
    }

    /** Project travel across activation/expiry boundaries; construction itself is never sped up. */
    constructionTravelTime(worker: GatheringWorker) {
        return this.projectConstructionTravel(this.time, worker.whipUntil)
    }

    constructionReturnTravelTime(finishTime: number) {
        // Construction removed the old effect. Only a fresh cast can speed up return.
        return this.projectConstructionTravel(finishTime, -Infinity, true)
    }

    private projectConstructionTravel(startTime: number, effectUntil: number, includeStart = false) {
        let remaining = this.settings.constructionStartDelay
        let time = startTime
        let until = effectUntil
        const starts = [...this.constructionWhipWindows, ...this.whipStarts]
            .filter(window => includeStart ? window.startTime >= time : window.startTime > time)
            .sort((a, b) => a.startTime - b.startTime)
        for (;;) {
            while (starts[0]?.startTime === time) until = starts.shift()!.finishTime
            const rate = until > time ? WHIP.movementMultiplier : 1
            const boundary = Math.min(starts[0]?.startTime ?? Infinity, until > time ? until : Infinity)
            const finish = time + remaining / rate
            if (finish <= boundary) return finish - startTime
            remaining -= (boundary - time) * rate
            time = boundary
        }
    }

    private travel(assignment: "gold" | "wood") {
        if (assignment === "wood") {
            const latestCompletion = Math.max(-Infinity, ...this.sawmillCompletions.filter(time => time <= this.time))
            const hasSawmill = Number.isFinite(latestCompletion)
            return growingWoodTravelTime(
                hasSawmill ? this.settings.sawmillWoodTravelTime : this.settings.woodTravelTime,
                this.time - (hasSawmill ? latestCompletion : 0),
                this.settings.woodTravelTimeIncreaseBase, this.settings.maxWoodTravelTime)
        }
        return this.settings.goldTravelTime
    }

    private transition(worker: GatheringWorker, state: GatheringWorker["state"], duration: number) {
        worker.state = state
        worker.stateSince = this.time
        worker.nextAt = this.time + Math.max(0, duration) / this.rate(worker)
    }

    private arrive(worker: GatheringWorker) {
        if (worker.assignment === "gold") {
            this.transition(worker, "waiting", Infinity)
        } else if (worker.assignment === "wood") {
            if (worker.cargoWood > 0 && worker.cargoWood >= this.settings.woodPerTrip) {
                this.transition(worker, "deposit", this.travel("wood"))
            } else {
                const remaining = this.settings.woodPerTrip > 0 ? 1 - worker.cargoWood / this.settings.woodPerTrip : 1
                this.transition(worker, "gathering", Math.max(0.001, this.settings.woodGatherTime) * remaining)
            }
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
            // Mining speed is locked on entry, unlike continuously updated wood progress.
            this.transition(next, "gathering", Math.max(0.001, this.settings.goldGatherTime -
                (next.whipUntil > this.time ? WHIP.goldTimeReduction : 0)))
        }
    }

    get nextEventTime() {
        return Math.min(
            ...this.workers.map((worker) => worker.nextAt),
            this.delayedInitialWoodWorkerIds.length ? this.settings.orderDelay : Infinity,
            ...this.sawmillCompletions.filter(time => time > this.time),
            ...this.whipStarts.map(window => window.startTime),
            ...this.workers.filter(worker => worker.whipUntil > this.time).map(worker => worker.whipUntil),
        )
    }

    advanceTo(time: number) {
        validatePlanTime(time, "Simulation time")
        while (this.nextEventTime <= time) {
            if (++this.steps > MAX_SIMULATION_STEPS) throw new Error("Simulation work budget exceeded.")
            this.time = this.nextEventTime
            // A construction finishing exactly at activation is already returning
            // and can receive a fresh effect. The previous effect was cleared at start.
            for (const worker of this.workers.filter(worker => worker.state === "construction" && worker.nextAt === this.time)) {
                this.transition(worker, "construction-return", worker.constructionReturnDuration!)
            }
            // Apply boundaries before mine entry; existing gold visits retain their entry rate.
            for (const worker of this.workers.filter(worker => worker.whipUntil === this.time)) {
                this.changeWhip(worker, -Infinity, true)
            }
            const starts = this.whipStarts.filter(window => window.startTime === this.time)
            this.whipStarts = this.whipStarts.filter(window => window.startTime !== this.time)
            for (const window of starts) {
                for (const worker of this.workers.filter(worker =>
                    worker.state !== "idle" && worker.state !== "construction" && worker.state !== "killed")) {
                    this.changeWhip(worker, window.finishTime, worker.whipUntil > this.time)
                }
            }
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
                if (++this.steps > MAX_SIMULATION_STEPS) throw new Error("Simulation work budget exceeded.")
                if (worker.state === "construction-outbound") {
                    worker.whipUntil = -Infinity
                    this.transition(worker, "construction", worker.constructionDuration!)
                } else if (worker.state === "outbound" || worker.state === "construction-return") {
                    this.arrive(worker)
                } else if (worker.state === "gathering") {
                    if (worker.assignment === "gold") {
                        this.mineWorker = null
                        // Lock cargo at mine exit: start is inclusive, expiry is exclusive.
                        worker.cargoGold = this.settings.goldPerTrip + Math.max(0,
                            ...this.goldRushWindows.filter(window => window.startTime <= this.time && this.time < window.finishTime)
                                .map(window => window.bonus))
                    } else if (worker.assignment === "wood") {
                        // Cargo is fixed at gathering completion, even when returned after expiry.
                        worker.cargoWood = this.settings.woodPerTrip + Math.max(0,
                            ...this.lumberGatheringWindows.filter(window => window.startTime <= this.time && this.time < window.finishTime)
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
                        wood: worker.assignment === "wood" ? worker.cargoWood : 0,
                    })
                    worker.cargoGold = 0
                    worker.cargoWood = 0
                    if (worker.assignment !== "idle") {
                        this.transition(worker, "outbound", this.travel(worker.assignment))
                    }
                }
            }
            this.startMine()
        }
        this.time = time
    }

    /** Remaining work already accounts for Whip activation and expiry. */
    private gatheredWood(worker: GatheringWorker) {
        if (worker.assignment !== "wood") return 0
        if (worker.state === "gathering") {
            return this.settings.woodPerTrip * Math.max(0, Math.min(1,
                1 - (worker.nextAt - this.time) * this.rate(worker) / Math.max(0.001, this.settings.woodGatherTime)))
        }
        return worker.cargoWood
    }

    selectBuilder() {
        const amount = (worker: GatheringWorker) => {
            if (worker.assignment === "wood") return this.gatheredWood(worker)
            if (worker.state === "deposit") {
                return worker.cargoGold
            }
            return 0
        }
        const priority = (worker: GatheringWorker) =>
            worker.state === "idle" ? 0 : worker.assignment === "wood" ? 1 : 2
        return this.workers
            .filter(
                (worker) =>
                    !isBuildingWorker(worker) && worker.state !== "killed" && !(worker.assignment === "gold" && worker.state === "gathering"),
            )
            .sort((a, b) => priority(a) - priority(b) || amount(a) - amount(b) || a.id - b.id)[0]
    }

    construct(worker: GatheringWorker, buildTime: number, travelTime = this.constructionTravelTime(worker),
        returnTravelTime = this.constructionReturnTravelTime(this.time + travelTime + buildTime)) {
        // Pause wood gathering through construction; gold cargo is still discarded.
        worker.cargoGold = 0
        worker.cargoWood = this.gatheredWood(worker)
        worker.constructionDuration = buildTime
        worker.constructionReturnDuration = returnTravelTime
        // Travel is projected separately so future casts can also affect a builder en route.
        this.transition(worker, "construction-outbound", travelTime)
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
            simulation.scheduleScroll(action.item.id as ScrollId, action.startTime, action.finishTime)
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
                type: "worker" | "construction" | "kill" | "player-whip-preparation"
                workerId?: number
                duration?: number
                travelTime?: number
                returnTravelTime?: number
            }> = []
            if (action.item.id === "whip" && action.item.kind === "scroll" &&
                !action.blocked && action.commandTime !== null) {
                events.push({ time: action.commandTime, type: "player-whip-preparation" })
            }
            if (action.item.kind === "unit-is-killed" && !action.blocked && action.commandTime !== null && action.workerId !== null) {
                events.push({ time: action.commandTime, type: "kill", workerId: action.workerId })
            }
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
                    travelTime: (action.startTime ?? action.commandTime + settings.constructionStartDelay) - action.commandTime,
                    returnTravelTime: action.workerReturnTime - action.finishTime!,
                })
            }
            return events
        })
        .filter((event) => event.time <= time)
        .sort((left, right) => left.time - right.time ||
            ({ worker: 0, kill: 1, "player-whip-preparation": 2, construction: 3 }[left.type] -
                { worker: 0, kill: 1, "player-whip-preparation": 2, construction: 3 }[right.type]))

    for (const event of events) {
        simulation.advanceTo(event.time)
        if (event.type === "worker") {
            const goldWorkers = simulation.workers.filter(({ assignment }) => assignment === "gold").length
            simulation.addWorker(goldWorkers < saturation ? "gold" : "wood")
        } else if (event.type === "kill") {
            simulation.killWorker(event.workerId!)
        } else if (event.type === "player-whip-preparation") {
            simulation.prepareGoldWorkerForWhip()
        } else {
            const worker = simulation.workers[event.workerId!]
            if (worker) {
                const travelTime = event.travelTime!
                simulation.construct(worker, Math.max(0, event.duration! - travelTime - event.returnTravelTime!), travelTime, event.returnTravelTime)
            }
        }
    }
    simulation.advanceTo(time)
    const busyOrIdle = simulation.workers.filter(
        worker => worker.state !== "killed" && (worker.assignment === "idle" || isBuildingWorker(worker) || worker.state === "idle"),
    ).length
    return {
        total: simulation.workers.filter(worker => worker.state !== "killed").length,
        gold: simulation.workers.filter(worker => worker.assignment === "gold" && !isBuildingWorker(worker) && worker.state !== "killed").length,
        wood: simulation.workers.filter(worker => worker.assignment === "wood" && !isBuildingWorker(worker) && worker.state !== "killed").length,
        busyOrIdle,
    }
}
