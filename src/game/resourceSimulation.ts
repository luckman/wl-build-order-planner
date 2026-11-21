import type { PlannerItem, WorkerCasualtyGroup } from "./gameData"
import type { WorkerEventAction } from "./workerEvents"
import { woodReturnTargetError, type WoodReturnAction, type WoodReturnResult } from "./woodReturn"
import { alignTimeWithGoldMinerLimit, goldMinerLimitTimeKey, profileGoldMinerLimit, timestampRoundoff, type GoldMinerLimitAction } from "./goldMinerLimit"
import { manualWorkerMoveIdentities, recordManualWorkerMoveBoundary, type ManualWorkerMoveAction, type ManualWorkerMoveResult, type ManualWorkerMoveSource } from "./manualWorkerMoves"
import { growingWoodTravelTime } from "./gatheringRules"
import { MAX_PLAN_ACTIONS, MAX_SIMULATION_STEPS, validateEconomyDurations, validatePlanTime } from "./plannerLimits"
import type { PlayerBuildingLevels } from "./playerLevels"
import { scrollEffect, whipEffect, type ScrollId } from "./scrolls"

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
    previousAssignment?: "gold" | "wood"
    retainedJourneyDuration?: number
    state: "preparation" | "reactivation" | "idle" | "outbound" | "waiting" | "gathering" | "deposit" | "construction-outbound" | "construction" | "construction-return" | "killed"
    stateSince: number
    nextAt: number
    cargoGold: number
    cargoWood: number
    whipUntil: number
    lastManualMoveAt?: number
    woodReturnIndex?: number
    woodReturnTarget?: number
    constructionDuration?: number
    constructionReturnDuration?: number
}

export type WhipWindow = { startTime: number; finishTime: number }
const isBuildingWorker = (worker: GatheringWorker) => worker.state === "preparation" || worker.state === "construction" ||
    worker.state === "construction-outbound" || worker.state === "construction-return"

export type WorkerAllocation = {
    total: number
    gold: number
    wood: number
    idle: number
    buildingOrTravelling: number
}

type HeldTransition = { worker: GatheringWorker; nextAt: number; state: "outbound" | "construction-return" }
type PendingManualMove = { resultIndex: number; action: ManualWorkerMoveAction; workerIds: Set<number> }

type WorkerStateAction = {
    item: PlannerItem
    commandTime: number | null
    finishTime: number | null
    workerReturnTime: number | null
    workerId: number | null
    startTime?: number | null
    departureTime?: number | null
    blocked?: boolean
}

/** Chronological worker simulation shared by income previews and build scheduling. */
export class WorkerEconomy {
    workers: GatheringWorker[] = []
    deliveries: ResourceDelivery[] = []
    readonly eventBoundaries = new Set<number>()
    time = 0
    private steps = 0
    private explicitGoldLimit: number | undefined
    private allowWoodReassignment = false
    private readonly profileGoldLimit: number
    private mineWorker: number | null = null
    private delayedInitialWoodWorkerIds: number[] = []
    private applyingWorkerCommands = false
    private commandTransitions: HeldTransition[] = []
    private pendingManualMoves: PendingManualMove[] = []
    private manualMoveResults: ManualWorkerMoveResult[] = []
    private woodReturnResults: WoodReturnResult[] = []
    private pendingWoodReturns = 0
    private sawmillCompletions: number[] = []
    private lumberGatheringWindows: Array<{ startTime: number; finishTime: number; bonus: number }> = []
    private goldRushWindows: Array<{ startTime: number; finishTime: number; bonus: number }> = []
    private whipStarts: WhipWindow[] = []
    private readonly whip: ReturnType<typeof whipEffect>

    constructor(private settings: EconomySettings, private constructionWhipWindows: WhipWindow[] = [], private recordBoundaries = false) {
        this.whip = whipEffect(settings)
        this.profileGoldLimit = profileGoldMinerLimit(settings)
        validateEconomyDurations(settings, Math.max(settings.workerCount, settings.goldWorkers + settings.woodWorkers))
        for (const count of [settings.workerCount, settings.goldWorkers, settings.woodWorkers]) {
            if (!Number.isInteger(count) || count < 0 || count > MAX_PLAN_ACTIONS + 5) throw new Error("Unsupported worker count.")
        }
        for (let i = 0; i < settings.goldWorkers; i++) {
            this.addWorker("gold", true)
        }
        for (let i = 0; i < settings.woodWorkers; i++) {
            const worker = this.addWorker("wood")
            if (i > 0) {
                this.delayedInitialWoodWorkerIds.push(worker.id)
                this.transition(worker, "idle", Infinity)
            }
        }
        for (let i = this.workers.length; i < settings.workerCount; i++) {
            this.addWorker("idle")
        }
    }

    fork() {
        const copy: WorkerEconomy = Object.create(WorkerEconomy.prototype)
        return Object.assign(copy, this, {
            workers: this.workers.map(worker => ({ ...worker })),
            deliveries: this.deliveries.map(delivery => ({ ...delivery })),
            eventBoundaries: new Set(this.eventBoundaries),
            delayedInitialWoodWorkerIds: [...this.delayedInitialWoodWorkerIds],
            sawmillCompletions: [...this.sawmillCompletions],
            lumberGatheringWindows: [...this.lumberGatheringWindows],
            goldRushWindows: [...this.goldRushWindows],
            whipStarts: [...this.whipStarts],
            manualMoveResults: this.manualMoveResults.map(result => ({ ...result })),
            woodReturnResults: this.woodReturnResults.map(result => ({ ...result })),
            pendingManualMoves: this.pendingManualMoves.map(move => ({ ...move, workerIds: new Set(move.workerIds) })),
        })
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
        if (assignment === "gold") this.expireWoodReassignmentAtLimit()
        return worker
    }

    applyGoldMinerLimit(action: GoldMinerLimitAction) {
        this.allowWoodReassignment = this.canReassignWoodOnIncrease(action)
        this.explicitGoldLimit = action.goldLimit
    }

    private canReassignWoodOnIncrease(action: GoldMinerLimitAction) {
        return action.reassign && action.goldLimit > this.goldMinerLimit && this.goldAssignments < action.goldLimit
    }

    get goldMinerLimit() {
        return this.explicitGoldLimit ?? this.profileGoldLimit
    }

    get hasExplicitGoldMinerLimit() {
        return this.explicitGoldLimit !== undefined
    }

    get goldAssignments() {
        return this.workers.filter(({ assignment }) => assignment === "gold").length
    }

    addRecruit() {
        return this.addWorker(this.goldAssignments < this.goldMinerLimit ? "gold" : "wood")
    }

    /** Construction workers cannot be selected; wood gatherers are killed before gold miners. */
    selectWorkerToKill(group: WorkerCasualtyGroup = "gathering") {
        const priority = (worker: GatheringWorker) => worker.assignment === "wood" || this.delayedInitialWoodWorkerIds.includes(worker.id)
            ? 0 : worker.assignment === "gold" ? 1 : 2
        return this.workers.filter(worker => this.canKillWorker(worker) &&
            (group === "idle" ? worker.assignment === "idle" && worker.state === "idle" : worker.assignment !== "idle"))
            .sort((a, b) => priority(a) - priority(b) || a.id - b.id)[0]
    }

    killWorker(workerId: number) {
        const worker = this.workers[workerId]
        if (!worker || !this.canKillWorker(worker)) return false
        this.finishWoodReturn(worker, "Worker killed before depositing the wood.")
        if (this.mineWorker === workerId) this.mineWorker = null
        this.delayedInitialWoodWorkerIds = this.delayedInitialWoodWorkerIds.filter(id => id !== workerId)
        worker.assignment = "idle"
        worker.cargoGold = 0
        worker.cargoWood = 0
        this.transition(worker, "killed", Infinity)
        this.pruneManualMovePools()
        this.startMine()
        return true
    }

    private canKillWorker(worker: GatheringWorker) {
        if (worker.state === "killed") return false
        if (!isBuildingWorker(worker)) return true
        return this.isHeldInstantReturn(worker)
    }

    private isHeldInstantReturn(worker: GatheringWorker) {
        // A finished, instantaneous return can be held briefly for a same-time move.
        return worker.state === "construction-return" && this.commandTransitions.some(transition =>
            transition.worker === worker && transition.state === "construction-return" && transition.nextAt === this.time)
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
        else if (id === "whip") this.whipStarts.push({ startTime, finishTime })
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
        if (worker.state === "reactivation" || worker.state === "outbound" || worker.state === "deposit") return this.whip.movementMultiplier
        if (worker.state === "gathering" && worker.assignment === "wood") {
            return Math.max(0.001, this.settings.woodGatherTime) / Math.max(0.001, this.settings.woodGatherTime - this.whip.woodTimeReduction)
        }
        return 1
    }

    private changeWhip(worker: GatheringWorker, until: number, wasActive: boolean) {
        const remaining = (worker.nextAt - this.time) * this.rate(worker, wasActive)
        worker.whipUntil = until
        worker.nextAt = this.time + remaining / this.rate(worker)
    }

    /** Project travel across activation/expiry boundaries; construction itself is never sped up. */
    constructionTravelTime(worker: GatheringWorker, duration = this.settings.constructionStartDelay) {
        return this.projectConstructionTravel(this.time, worker.whipUntil, false, duration)
    }

    constructionReturnTravelTime(finishTime: number, duration = this.settings.constructionStartDelay) {
        // Construction removed the old effect. Only a fresh cast can speed up return.
        return this.projectConstructionTravel(finishTime, -Infinity, true, duration)
    }

    private projectConstructionTravel(startTime: number, effectUntil: number, includeStart = false, duration = this.settings.constructionStartDelay) {
        let remaining = duration
        let time = startTime
        let until = effectUntil
        const starts = [...this.constructionWhipWindows, ...this.whipStarts]
            .filter(window => includeStart ? window.startTime >= time : window.startTime > time)
            .sort((a, b) => a.startTime - b.startTime)
        for (;;) {
            while (starts[0]?.startTime === time) until = starts.shift()!.finishTime
            const rate = until > time ? this.whip.movementMultiplier : 1
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
                (next.whipUntil > this.time ? this.whip.goldTimeReduction : 0)))
        }
    }

    get nextEventTime() {
        return Math.min(
            ...this.workers.map(worker => worker.woodReturnTarget === undefined ? worker.nextAt : this.woodDepartureTime(worker)),
            this.delayedInitialWoodWorkerIds.length ? this.settings.orderDelay : Infinity,
            ...this.sawmillCompletions.filter(time => time > this.time),
            ...this.whipStarts.map(window => window.startTime),
            ...this.workers.filter(worker => worker.whipUntil > this.time).map(worker => worker.whipUntil),
        )
    }

    advanceTo(time: number, commandsAtTime?: () => void, incomingGoldLimit?: GoldMinerLimitAction, incomingManualMoveSources?: ReadonlySet<ManualWorkerMoveSource>) {
        validatePlanTime(time, "Simulation time")
        const roundoff = commandsAtTime ? timestampRoundoff(time) : 0
        for (let next = this.nextEventTime; next <= time + roundoff; next = this.nextEventTime) {
            if (commandsAtTime && Math.abs(next - time) <= roundoff) {
                for (const worker of this.workers) {
                    if (Math.abs(worker.nextAt - time) <= roundoff) worker.nextAt = time
                }
                next = this.nextEventTime
                if (next > time && this.pendingWoodReturns &&
                    this.workers.some(worker => Math.abs(this.woodDepartureTime(worker) - time) <= roundoff)) {
                    next = time
                }
            }
            if (next > time) break
            this.time = next
            const atCommand = next === time && commandsAtTime !== undefined
            const transitions: HeldTransition[] | undefined = !this.applyingWorkerCommands &&
                (atCommand || this.hasExplicitGoldMinerLimit || this.hasPendingManualMoves) ? [] : undefined
            do {
                this.advanceWorkerEvents(transitions, atCommand ? incomingGoldLimit : undefined,
                    atCommand ? incomingManualMoveSources : undefined, atCommand ? roundoff : 0)
            } while (transitions && this.nextEventTime === next)

            if (atCommand) {
                const runCommands = commandsAtTime!
                commandsAtTime = undefined
                this.runWorkerCommands(runCommands, transitions ?? [])
            } else if (transitions && this.hasPendingManualMoves) {
                this.runWorkerCommands(() => this.resolvePendingManualMoves(), transitions)
            }
            if (transitions) this.reassignAtTransitions(transitions)
        }
        this.time = time
        if (commandsAtTime) {
            this.runWorkerCommands(commandsAtTime, [])
            this.reassignAtTransitions([])
        }
    }

    private runWorkerCommands(commands: () => void, transitions: HeldTransition[]) {
        this.applyingWorkerCommands = true
        this.commandTransitions = this.hasPendingManualMoves || transitions.length > 1
            ? transitions.sort((a, b) => a.worker.id - b.worker.id) : transitions
        try { commands() } finally {
            this.commandTransitions = []
            this.applyingWorkerCommands = false
        }
    }

    get hasPendingManualMoves() {
        return this.pendingManualMoves.length > 0
    }

    get manualMoveCheckpointWeight() {
        return this.pendingManualMoves.reduce((weight, move) => weight + move.workerIds.size, this.manualMoveResults.length)
    }

    get woodReturnCheckpointWeight() {
        return this.woodReturnResults.length
    }

    get hasPendingWoodReturns() {
        return this.pendingWoodReturns > 0
    }

    woodReturnResult(index: number): WoodReturnResult {
        const result = this.woodReturnResults[index]
        return result.endTime === null
            ? { ...result, reason: "Worker could not deposit before the plan limit." }
            : { ...result }
    }

    startWoodReturn(action: WoodReturnAction) {
        const result: WoodReturnResult = { workerId: null, departedAt: null, endTime: this.time, delivered: 0 }
        const index = this.woodReturnResults.push(result) - 1
        if (action.mode === "target") {
            const error = woodReturnTargetError(action.target, this.settings.woodPerTrip)
            if (error) {
                result.reason = error
                return
            }
        }
        let selected: GatheringWorker | undefined
        let cargo = 0
        let reserved = false
        // Workers are stored in ascending ID order. Keep the first on an exact tie.
        for (const worker of this.workers) {
            if (worker.assignment !== "wood" || worker.state !== "gathering") continue
            if (worker.woodReturnIndex !== undefined) {
                reserved = true
                continue
            }
            const amount = this.gatheredWood(worker)
            if (!selected || amount > cargo) {
                selected = worker
                cargo = amount
            }
        }
        if (!selected) {
            result.reason = reserved ? "No eligible wood gatherer is available. Chopping workers already have a wood return order."
                : "No wood gatherer is actively chopping."
            return
        }
        const nextWhole = Math.ceil(cargo)
        const wholeWood = nextWhole > 0 && this.woodTargetTime(selected, nextWhole) <= this.time ? nextWhole : Math.floor(cargo)
        if (action.mode === "immediate" && wholeWood < 1) {
            result.reason = "No eligible gatherer has at least one whole wood."
            return
        }
        result.workerId = selected.id
        result.endTime = null
        selected.woodReturnIndex = index
        this.pendingWoodReturns++
        if (action.mode === "target" && wholeWood < action.target) {
            selected.woodReturnTarget = action.target
        } else {
            this.departWithWood(selected, wholeWood)
            if (selected.nextAt === this.time) this.advanceTo(this.time)
        }
    }

    private departWithWood(worker: GatheringWorker, wood: number) {
        this.woodReturnResults[worker.woodReturnIndex!].departedAt = this.time
        delete worker.woodReturnTarget
        worker.cargoWood = wood
        this.transition(worker, "deposit", this.travel("wood"))
    }

    private finishWoodReturn(worker: GatheringWorker, reason?: string) {
        if (worker.woodReturnIndex === undefined) return
        const result = this.woodReturnResults[worker.woodReturnIndex]
        result.endTime = this.time
        if (reason) result.reason = reason
        else result.delivered = worker.cargoWood
        delete worker.woodReturnIndex
        delete worker.woodReturnTarget
        this.pendingWoodReturns--
    }

    private woodTargetTime(worker: GatheringWorker, amount: number) {
        const remainingFraction = (this.settings.woodPerTrip - amount) / this.settings.woodPerTrip
        const remainingSeconds = Math.max(0.001, this.settings.woodGatherTime) * remainingFraction / this.rate(worker)
        return goldMinerLimitTimeKey(worker.nextAt - remainingSeconds)
    }

    private woodDepartureTime(worker: GatheringWorker) {
        return worker.woodReturnTarget === undefined ? Infinity : Math.max(this.time, this.woodTargetTime(worker, worker.woodReturnTarget))
    }

    manualWorkerMoveResult(index: number) {
        return { ...this.manualMoveResults[index] }
    }

    startManualWorkerMove(action: ManualWorkerMoveAction) {
        const { source, destination } = manualWorkerMoveIdentities[action.move]
        const workerIds = new Set(this.workers.filter(worker => worker.assignment === source &&
            worker.lastManualMoveAt !== this.time).map(worker => worker.id))
        const resultIndex = this.manualMoveResults.length
        const goldSlots = destination === "gold" ? this.openGoldSlots() : 0
        let reason = workerIds.size < action.count
            ? `Only ${workerIds.size} source workers available for ${action.count} requested.` : undefined
        if (!reason && destination === "gold" && goldSlots < action.count) {
            reason = `Only ${goldSlots} gold slots available for ${action.count} requested. Increase the gold limit or reduce the worker count.`
        }
        this.manualMoveResults.push(reason ? { completed: 0, endTime: this.time, reason } : { completed: 0, endTime: null })
        if (!reason) {
            const move = { resultIndex, action, workerIds }
            this.pendingManualMoves.push(move)
            this.resolveManualMove(move)
        }
        return reason
    }

    resolvePendingManualMoves() {
        for (const move of this.pendingManualMoves) {
            this.resolveManualMove(move)
        }
    }

    private resolveManualMove(move: PendingManualMove) {
        const result = this.manualMoveResults[move.resultIndex]
        if (result.endTime !== null) return
        const { source, destination } = manualWorkerMoveIdentities[move.action.move]
        const held = new Map(this.commandTransitions.filter(({ worker, state }) => worker.assignment === source &&
            move.workerIds.has(worker.id) && worker.state === state && worker.nextAt === Infinity &&
            worker.lastManualMoveAt !== this.time).map(transition => [transition.worker.id, transition]))
        const eligible = source === "wood"
            ? this.rankWoodReassignmentCandidates(new Set(held.keys()), move.workerIds)
            : [...held.values()].map(({ worker }) => ({ worker, remainingTravel: 0 }))
        for (const { worker, remainingTravel } of eligible) {
            if (destination === "gold" && this.openGoldSlots() === 0) {
                result.endTime = this.time
                result.reason = "The gold limit is full. Increase the gold limit or reduce the worker count."
                this.pruneManualMovePools()
                return
            }
            const transition = held.get(worker.id)
            if (transition) worker.nextAt = transition.nextAt
            worker.lastManualMoveAt = this.time
            move.workerIds.delete(worker.id)
            result.completed++
            if (result.completed === move.action.count) result.endTime = this.time
            this.redirectGatherer(worker, destination, remainingTravel)
            if (result.endTime !== null) break
        }
    }

    private pruneManualMovePools() {
        if (!this.hasPendingManualMoves) return
        for (const move of this.pendingManualMoves) {
            const result = this.manualMoveResults[move.resultIndex]
            if (result.endTime !== null) continue
            const { source } = manualWorkerMoveIdentities[move.action.move]
            for (const id of move.workerIds) {
                if (this.workers[id].assignment !== source) move.workerIds.delete(id)
            }
            const outstanding = move.action.count - result.completed
            if (move.workerIds.size >= outstanding) continue
            result.endTime = this.time
            result.reason = `Only ${move.workerIds.size} source workers remain for ${outstanding} outstanding.`
        }
        this.pendingManualMoves = this.pendingManualMoves.filter(move => this.manualMoveResults[move.resultIndex].endTime === null)
    }

    private reassignAtTransitions(transitions: HeldTransition[]) {
        const woodTransitions = this.allowWoodReassignment ? new Set<number>() : undefined
        // Deposits have already credited their loads. A simultaneous command can
        // invalidate eligibility, and completed recruits can occupy gold slots.
        for (const { worker, nextAt, state } of transitions.sort((a, b) => a.worker.id - b.worker.id)) {
            if (worker.state !== state || worker.nextAt !== Infinity) continue
            worker.nextAt = nextAt
            if (worker.lastManualMoveAt === this.time) continue
            if (worker.assignment === "gold" && this.explicitGoldLimit !== undefined && this.goldAssignments > this.explicitGoldLimit) {
                this.redirectGatherer(worker, "wood")
            } else {
                if (worker.assignment === "wood") woodTransitions?.add(worker.id)
            }
        }
        if (woodTransitions) this.reassignWoodGatherers(woodTransitions)
    }

    private expireWoodReassignmentAtLimit() {
        if (this.allowWoodReassignment && this.goldAssignments >= this.goldMinerLimit) this.allowWoodReassignment = false
    }

    private openGoldSlots() {
        return Math.max(0, this.goldMinerLimit - this.goldAssignments)
    }

    private rankWoodReassignmentCandidates(woodTransitions: ReadonlySet<number>, sourcePool?: ReadonlySet<number>) {
        return this.workers.flatMap(worker => {
            const ready = woodTransitions.has(worker.id)
            if ((sourcePool && !sourcePool.has(worker.id)) || worker.assignment !== "wood" || worker.lastManualMoveAt === this.time ||
                worker.cargoWood !== 0 || (!ready && worker.state !== "outbound")) return []
            const remainingTravel = ready ? 0 : (worker.nextAt - this.time) * this.rate(worker)
            return [{ worker, remainingTravel }]
        }).sort((left, right) => right.remainingTravel - left.remainingTravel || left.worker.id - right.worker.id)
    }

    private reassignWoodGatherers(woodTransitions: ReadonlySet<number>) {
        const openSlots = this.openGoldSlots()
        const eligible = this.rankWoodReassignmentCandidates(woodTransitions)
        for (const { worker, remainingTravel } of eligible.slice(0, openSlots)) {
            this.redirectGatherer(worker, "gold", remainingTravel)
        }
    }

    private redirectGatherer(worker: GatheringWorker, destination: "gold" | "wood", remainingTravel = 0) {
        // Move from the site on the first leg. The normal return is already
        // projected through Whip, so recover its distance before changing routes.
        const returnTravel = worker.state === "construction-return" ? this.remainingJourney(worker) : 0
        const destinationTravel = destination === "gold" ? this.settings.goldTravelTime : this.woodTravelAfterGold()
        worker.assignment = destination
        this.transition(worker, "outbound", Math.max(remainingTravel, returnTravel, destinationTravel))
        if (destination === "gold") this.expireWoodReassignmentAtLimit()
        this.pruneManualMovePools()
    }

    private woodTravelAfterGold() {
        return this.sawmillCompletions.some(finish => finish <= this.time)
            ? this.settings.maxWoodTravelTime
            : this.travel("wood")
    }

    private canRedirectFinishedBuilder(worker: GatheringWorker, incomingGoldLimit: GoldMinerLimitAction | undefined,
        incomingManualMoveSources: ReadonlySet<ManualWorkerMoveSource> | undefined) {
        if (worker.assignment === "idle") return false
        const eligibleForManualMove = incomingManualMoveSources?.has(worker.assignment) ||
            this.pendingManualMoves.some(move => move.workerIds.has(worker.id))
        if (worker.assignment === "gold") {
            const limit = incomingGoldLimit?.goldLimit ?? this.explicitGoldLimit
            return worker.cargoGold === 0 && ((limit !== undefined && this.goldAssignments > limit) || eligibleForManualMove)
        }
        return worker.cargoWood === 0 && (eligibleForManualMove ||
            (incomingGoldLimit ? this.canReassignWoodOnIncrease(incomingGoldLimit) : this.allowWoodReassignment))
    }

    private advanceWorkerEvents(transitions: HeldTransition[] | undefined, incomingGoldLimit: GoldMinerLimitAction | undefined,
        incomingManualMoveSources: ReadonlySet<ManualWorkerMoveSource> | undefined, roundoff: number) {
        if (++this.steps > MAX_SIMULATION_STEPS) throw new Error("Simulation work budget exceeded.")
        if (this.recordBoundaries) this.eventBoundaries.add(this.time)
        // A construction finishing exactly at activation is already returning
        // and can receive a fresh effect. The previous effect was cleared at start.
        for (const worker of this.workers.filter(worker => worker.state === "construction" && worker.nextAt === this.time)) {
            this.transition(worker, "construction-return", worker.constructionReturnDuration!)
            if (transitions && this.canRedirectFinishedBuilder(worker, incomingGoldLimit, incomingManualMoveSources)) {
                transitions.push({ worker, nextAt: worker.nextAt, state: "construction-return" })
                worker.nextAt = Infinity
            }
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
        if (this.pendingWoodReturns) {
            // Whip changes gathering and travel rates at the boundary. A due
            // departure uses the movement rate in effect once the worker leaves.
            for (const worker of this.workers) {
                if (worker.woodReturnTarget !== undefined && this.woodDepartureTime(worker) <= this.time + roundoff) {
                    this.departWithWood(worker, worker.woodReturnTarget)
                }
            }
        }
        // Process simultaneous arrivals/departures before assigning the mine slot.
        for (const worker of this.workers.filter((candidate) => candidate.nextAt === this.time)) {
            if (++this.steps > MAX_SIMULATION_STEPS) throw new Error("Simulation work budget exceeded.")
            if (worker.state === "construction-outbound") {
                worker.whipUntil = -Infinity
                this.transition(worker, "construction", worker.constructionDuration!)
            } else if (worker.state === "reactivation" || worker.state === "outbound" || worker.state === "construction-return") {
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
                this.finishWoodReturn(worker)
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
                    if (transitions) {
                        transitions.push({ worker, nextAt: worker.nextAt, state: "outbound" })
                        worker.nextAt = Infinity
                    }
                }
            }
        }
        this.startMine()
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

    selectBuilder(useIdleWorker = false) {
        return useIdleWorker ? this.workers.find(worker => worker.assignment === "idle" && worker.state === "idle") : this.selectBuilderExcluding(new Set(), true)
    }

    private selectBuilderExcluding(excluded: Set<number>, allowReturning = false) {
        const amount = (worker: GatheringWorker) => {
            if (worker.assignment === "wood") return this.gatheredWood(worker)
            if (worker.state === "deposit") {
                return worker.cargoGold
            }
            return 0
        }
        const priority = (worker: GatheringWorker) =>
            worker.assignment === "wood" ? 0 : 1
        const available = (worker: GatheringWorker) =>
            !isBuildingWorker(worker) || (worker.state === "construction-return" &&
                (allowReturning || (worker.assignment === "wood" && this.isHeldInstantReturn(worker))))
        return this.workers
            .filter(worker => !excluded.has(worker.id) && worker.assignment !== "idle" && available(worker) &&
                worker.state !== "killed" && !(worker.assignment === "gold" && worker.state === "gathering"))
            .sort((a, b) => priority(a) - priority(b) || amount(a) - amount(b) || a.id - b.id)[0]
    }

    remainingJourney(worker: GatheringWorker) {
        if (worker.state === "preparation") return worker.retainedJourneyDuration ?? 0
        if (worker.state === "reactivation") return Math.max(0, (worker.nextAt - this.time) * this.rate(worker))
        if (worker.state !== "construction-return") return 0
        // Return arrival already projects future Whip boundaries. Integrate the remaining
        // projected journey back into normal-speed distance, rather than counting seconds.
        const windows = [...this.constructionWhipWindows, ...this.whipStarts].filter(window => window.startTime >= worker.stateSince)
        const boundaries = [this.time, worker.nextAt, ...windows.flatMap(window => [window.startTime, window.finishTime]), worker.whipUntil]
            .filter(time => time >= this.time && time <= worker.nextAt).sort((a, b) => a - b)
        let remaining = 0
        for (let i = 1; i < boundaries.length; i++) {
            const time = boundaries[i - 1]
            const active = worker.whipUntil > time || windows.some(window => window.startTime <= time && window.finishTime > time)
            remaining += (boundaries[i] - time) * (active ? this.whip.movementMultiplier : 1)
        }
        return remaining
    }

    applyWorkerEvent(item: WorkerEventAction) {
        const selected: GatheringWorker[] = []
        if (item.workerEvent === "make-active") {
            selected.push(...this.workers.filter(worker => worker.assignment === "idle" && worker.state === "idle" && worker.previousAssignment !== undefined).slice(0, item.count))
        } else {
            // Select the whole batch before changing assignments. Reuse the builder ranking.
            const excluded = new Set<number>()
            for (let i = 0; i < item.count; i++) {
                const worker = this.selectBuilderExcluding(excluded)
                if (!worker) break
                selected.push(worker)
                excluded.add(worker.id)
            }
        }
        if (selected.length !== item.count) return false
        for (const worker of selected) {
            if (item.workerEvent === "make-idle") {
                this.finishWoodReturn(worker, "Worker made idle before depositing the wood.")
                worker.previousAssignment = worker.assignment as "gold" | "wood"
                worker.cargoWood = this.gatheredWood(worker)
                worker.cargoGold = 0
                worker.assignment = "idle"
                this.delayedInitialWoodWorkerIds = this.delayedInitialWoodWorkerIds.filter(id => id !== worker.id)
                this.transition(worker, "idle", Infinity)
            } else {
                const savedAssignment = worker.previousAssignment!
                const goldIsFull = savedAssignment === "gold" &&
                    this.explicitGoldLimit !== undefined && this.goldAssignments >= this.explicitGoldLimit
                worker.assignment = goldIsFull ? "wood" : savedAssignment
                this.transition(worker, "reactivation", item.travelDuration)
            }
        }
        this.expireWoodReassignmentAtLimit()
        this.pruneManualMovePools()
        this.advanceTo(this.time)
        return true
    }

    private interruptGathering(worker: GatheringWorker) {
        this.finishWoodReturn(worker, "Worker assigned to construction before depositing the wood.")
        this.delayedInitialWoodWorkerIds = this.delayedInitialWoodWorkerIds.filter(id => id !== worker.id)
        worker.cargoGold = 0
        worker.cargoWood = worker.assignment === "idle" ? worker.cargoWood : this.gatheredWood(worker)
    }

    prepareConstruction(worker: GatheringWorker) {
        worker.retainedJourneyDuration = this.remainingJourney(worker)
        this.interruptGathering(worker)
        this.transition(worker, "preparation", Infinity)
    }

    construct(worker: GatheringWorker, buildTime: number, travelTime = this.constructionTravelTime(worker),
        returnTravelTime = this.constructionReturnTravelTime(this.time + travelTime + buildTime)) {
        this.interruptGathering(worker)
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
    let gold = settings.startingGold
    let wood = settings.startingWood
    // Affordability depends on the exact floating-point addition order.
    for (const delivery of deliveries) {
        if (delivery.time <= time) {
            gold += delivery.gold
            wood += delivery.wood
        }
    }
    for (const event of spending) {
        if (event.time <= time) {
            gold += event.gold
            wood += event.wood
        }
    }
    return { time, gold, wood }
}

/** Returns the worker allocation at a command timestamp, including builders in transit. */
function replayWorkerEconomy(
    settings: EconomySettings,
    actions: WorkerStateAction[],
    time: number,
    observeBeforeCommands?: (simulation: WorkerEconomy) => void,
) {
    const simulation = new WorkerEconomy(settings)
    const goldLimitTimes = new Map<number, number>()
    const manualMoveSourcesByTime = new Map<number, Set<ManualWorkerMoveSource>>()
    const woodReturnTimes = new Set<number>()
    for (const action of actions) {
        if (action.item.kind === "limit-gold-miners" && !action.blocked && action.commandTime !== null) {
            goldLimitTimes.set(goldMinerLimitTimeKey(action.commandTime), action.commandTime)
        }
        if (action.item.kind === "manual-worker-move" && action.commandTime !== null) {
            recordManualWorkerMoveBoundary(action.item, action.commandTime, goldLimitTimes, manualMoveSourcesByTime)
        }
        if (action.item.kind === "wood-return" && action.commandTime !== null) {
            goldLimitTimes.set(goldMinerLimitTimeKey(action.commandTime), action.commandTime)
            woodReturnTimes.add(action.commandTime)
        }
        if (action.item.kind === "scroll" && !action.blocked && action.startTime != null && action.finishTime !== null) {
            simulation.scheduleScroll(action.item.id as ScrollId, action.startTime, action.finishTime)
        }
        if (action.item.id === "sawmill" && action.finishTime !== null) {
            simulation.scheduleSawmill(action.finishTime)
        }
    }
    const allocationTime = alignTimeWithGoldMinerLimit(time, goldLimitTimes)
    const eventPriority = { "limit-gold-miners": 0, worker: 1, "worker-event": 2, "manual-worker-move": 2, "wood-return": 2,
        kill: 2, prepare: 3, "player-whip-preparation": 3, construction: 4 }
    const events = actions
        .flatMap((action) => {
            const events: Array<{
                time: number
                type: keyof typeof eventPriority
                action?: WorkerEventAction
                manualMove?: ManualWorkerMoveAction
                woodReturn?: WoodReturnAction
                goldMinerLimit?: GoldMinerLimitAction
                workerId?: number
                duration?: number
                travelTime?: number
                returnTravelTime?: number
            }> = []
            if (action.item.kind === "worker-event" && action.commandTime !== null) {
                events.push({ time: alignTimeWithGoldMinerLimit(action.commandTime, goldLimitTimes), type: "worker-event",
                    action: action.blocked ? undefined : action.item })
            }
            if (action.item.kind === "manual-worker-move" && action.commandTime !== null) {
                events.push({ time: alignTimeWithGoldMinerLimit(action.commandTime, goldLimitTimes), type: "manual-worker-move",
                    manualMove: action.item })
            }
            if (action.item.kind === "wood-return" && action.commandTime !== null) {
                events.push({ time: alignTimeWithGoldMinerLimit(action.commandTime, goldLimitTimes), type: "wood-return", woodReturn: action.item })
            }
            if (action.item.kind === "limit-gold-miners" && !action.blocked && action.commandTime !== null) {
                events.push({ time: action.commandTime, type: "limit-gold-miners", goldMinerLimit: action.item })
            }
            if (action.item.id === "whip" && action.item.kind === "scroll" &&
                !action.blocked && action.commandTime !== null) {
                events.push({ time: action.commandTime, type: "player-whip-preparation" })
            }
            if (action.item.kind === "unit-is-killed" && action.commandTime !== null) {
                events.push({ time: alignTimeWithGoldMinerLimit(action.commandTime, goldLimitTimes), type: "kill",
                    workerId: action.blocked ? undefined : action.workerId ?? undefined })
            }
            if ((action.item.id === "worker" || action.item.id === "slave") && action.finishTime !== null) {
                events.push({ time: alignTimeWithGoldMinerLimit(action.finishTime, goldLimitTimes), type: "worker" })
            }
            if (
                (action.item.kind === "building" || action.item.kind === "upgrade") &&
                action.commandTime !== null &&
                action.workerReturnTime !== null &&
                action.workerId !== null
            ) {
                if (action.departureTime != null && action.departureTime < action.commandTime) {
                    events.push({ time: action.departureTime, type: "prepare", workerId: action.workerId })
                }
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
        .filter(event => event.time < allocationTime || (!observeBeforeCommands && event.time === allocationTime))
        .sort((left, right) => left.time - right.time || eventPriority[left.type] - eventPriority[right.type])

    const applyEvent = (event: (typeof events)[number]) => {
        if (event.type === "limit-gold-miners") {
            simulation.applyGoldMinerLimit(event.goldMinerLimit!)
        } else if (event.type === "worker") {
            simulation.addRecruit()
        } else if (event.type === "prepare") {
            simulation.prepareConstruction(simulation.workers[event.workerId!])
        } else if (event.type === "worker-event") {
            if (event.action) simulation.applyWorkerEvent(event.action)
        } else if (event.type === "manual-worker-move") {
            simulation.startManualWorkerMove(event.manualMove!)
        } else if (event.type === "wood-return") {
            simulation.startWoodReturn(event.woodReturn!)
        } else if (event.type === "kill") {
            if (event.workerId !== undefined) simulation.killWorker(event.workerId)
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
    for (let index = 0; index < events.length; ) {
        const { time } = events[index]
        const applyWorkerCommands = () => {
            while (events[index]?.time === time && eventPriority[events[index].type] < eventPriority.kill) {
                applyEvent(events[index++])
            }
            simulation.resolvePendingManualMoves()
            while (events[index]?.time === time && eventPriority[events[index].type] <= eventPriority.kill) {
                applyEvent(events[index++])
            }
        }
        const { type } = events[index]
        const manualMoveAtTime = manualMoveSourcesByTime.get(time)
        if (type === "limit-gold-miners" ||
            ((simulation.hasExplicitGoldMinerLimit || simulation.hasPendingManualMoves || manualMoveAtTime ||
                simulation.hasPendingWoodReturns || woodReturnTimes.has(time)) &&
                eventPriority[type] <= eventPriority.kill)) {
            simulation.advanceTo(time, applyWorkerCommands, events[index].goldMinerLimit, manualMoveAtTime)
            while (events[index]?.time === time) {
                simulation.advanceTo(time)
                applyEvent(events[index++])
            }
        } else {
            // Plans before the first limit retain the existing per-event progression.
            simulation.advanceTo(time)
            applyEvent(events[index++])
        }
    }
    simulation.advanceTo(allocationTime, observeBeforeCommands && (() => observeBeforeCommands(simulation)))
    return simulation
}

export function projectedGoldAssignmentsBefore(settings: EconomySettings, actions: WorkerStateAction[], time: number) {
    let assignments = 0
    replayWorkerEconomy(settings, actions, time, simulation => { assignments = simulation.goldAssignments })
    return assignments
}

export function workerAllocationAt(settings: EconomySettings, actions: WorkerStateAction[], time: number): WorkerAllocation {
    const simulation = replayWorkerEconomy(settings, actions, time)
    const buildingOrTravelling = simulation.workers.filter(
        worker => worker.state !== "killed" && (isBuildingWorker(worker) || worker.state === "reactivation" || (worker.state === "idle" && worker.assignment !== "idle")),
    ).length
    return {
        idle: simulation.workers.filter(worker => worker.assignment === "idle" && worker.state === "idle").length,
        total: simulation.workers.filter(worker => worker.state !== "killed").length,
        gold: simulation.workers.filter(worker => worker.assignment === "gold" && !isBuildingWorker(worker) && worker.state !== "reactivation" && worker.state !== "idle" && worker.state !== "killed").length,
        wood: simulation.workers.filter(worker => worker.assignment === "wood" && !isBuildingWorker(worker) && worker.state !== "reactivation" && worker.state !== "idle" && worker.state !== "killed").length,
        buildingOrTravelling,
    }
}
