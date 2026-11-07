import { matchesPreparation, matchesPreparationReuse, schedulePreparation, type PreparationReuse, type PreparationSchedule } from "./preparationScheduling"
import { isConstruction, parseConstructionSettings } from "./constructionSettings"
import { parseWorkerEvent, workerEventCommand } from "./workerEvents"
import { createManaSpentAction, manaSpentCommand, manaSpentCollision } from "./manaSpent"
import { MAX_PLAN_ACTIONS, MAX_PLAN_SECONDS, validateActionCount, validatePlanTime } from "./plannerLimits"
import { createUnitKilledAction, unitKilledCommand, foodUsedAt } from "./unitsKilled"
import { evaluateManaWells } from "./manaWells"
import { createResourcesCollectedAction, resourcesCollectedCommand, isTimedEvent } from "./resourcesCollected"
import { factions, heroAltarLevel, isRecruitable, itemCost, type PlannerItem } from "./gameData"
import { buildingLimit, completeUpgrades, newBuilding, requirementCount, type BuildingInstance } from "./buildingRules"
import { type EconomySettings, type ResourceDelivery, type WhipWindow, manaAt, resourceAt, WorkerEconomy } from "./resourceSimulation"
import { createScrollAction, scrollEffect, legionsCallEffect, isScrollAction, scrollCommand, scrollCooldown } from "./scrolls"
import { actionDuration } from "./playerLevels"
import { productionBuildingsAt, recruitmentFinish, recruitmentWork, type RecruitmentWindow } from "./recruitment"
import { timelineEnd } from "./timelineBounds"
import { replayBoundary, replayOrder, replayPreparation, ReplayHistory, type ReplayOrder } from "./buildSimulationReplay"

const RESOURCE_PROJECTION_SECONDS = 5 * 60
const CATALOG_CHECKPOINT_INTERVAL = 4

export type ScheduledAction = {
    item: PlannerItem
    cost: { gold: number; wood: number }
    blocked: boolean
    blockedReason?: string
    buildingInstanceId?: number
    commandTime: number | null
    startTime: number | null
    finishTime: number | null
    departureTime?: number | null
    workerReturnTime: number | null
    workerReturnEndTime?: number | null
    workerId: number | null
    foodReleased?: number
    manaCost?: number
}

type BuildSimulation = {
    plan: ScheduledAction[]
    orderedPlan: ScheduledAction[]
    deliveries: ResourceDelivery[]
}

type Checkpoint = {
    nextIndex: number
    simulation: WorkerEconomy
    plan: ScheduledAction[]
    spending: Array<{ time: number; gold: number; wood: number }>
    buildings: BuildingInstance[]
    unitInstances: Array<{ item: PlannerItem; readyAt: number; killed: boolean }>
    workerCompletions: number[]
    timedEventsByIndex: Map<number, ScheduledAction>
    preparationFailures: Map<number, string>
    preparedWorkers: Map<number, { workerId: number; departureTime: number }>
    lastScrollCommand: number
    lastCatalogCommand: number
}

function copyCheckpoint(checkpoint: Checkpoint): Checkpoint {
    const copyAction = (action: ScheduledAction) => ({ ...action, cost: { ...action.cost } })
    return {
        ...checkpoint,
        simulation: checkpoint.simulation.fork(),
        plan: checkpoint.plan.map(copyAction),
        spending: [...checkpoint.spending],
        buildings: checkpoint.buildings.map(building => ({ ...building,
            upgrade: building.upgrade && { ...building.upgrade, item: { ...building.upgrade.item } },
        })),
        unitInstances: checkpoint.unitInstances.map(unit => ({ ...unit, item: { ...unit.item } })),
        workerCompletions: [...checkpoint.workerCompletions],
        timedEventsByIndex: new Map([...checkpoint.timedEventsByIndex].map(([index, action]) => [index, copyAction(action)])),
        preparationFailures: new Map(checkpoint.preparationFailures),
        preparedWorkers: new Map(checkpoint.preparedWorkers),
    }
}

function restoreCheckpoint(checkpoint: Checkpoint, buildOrder: PlannerItem[], order: ReplayOrder, rowMap?: Map<number, number>) {
    const restored = copyCheckpoint(checkpoint)
    restored.nextIndex = order.catalog[restored.plan.length]?.index ?? buildOrder.length
    if (!rowMap) return restored

    for (const [position, action] of restored.plan.entries()) {
        action.item = buildOrder[order.catalog[position].index]
    }
    const remap = <T>(entries: Map<number, T>) =>
        new Map([...entries].map(([index, value]) => [rowMap.get(index)!, value]))
    restored.preparedWorkers = remap(restored.preparedWorkers)
    restored.preparationFailures = remap(restored.preparationFailures)
    // Wells are resolved from the entire fixed timeline for every pass.
    for (const [index, action] of restored.timedEventsByIndex) {
        if (action.item.kind === "mana-well") restored.timedEventsByIndex.delete(index)
        else action.item = buildOrder[rowMap.get(index)!]
    }
    restored.timedEventsByIndex = remap(restored.timedEventsByIndex)
    return restored
}

type PassOptions = {
    resume?: Checkpoint
    capture?: boolean
    captureCheckpoint?: (state: Checkpoint) => void
}
type TailReplay = {
    preparation: PreparationSchedule
    reuse: PreparationReuse
    beforeTail?: Checkpoint
    end?: Checkpoint
}

// Results and their input items are public. Keep independent state and reject
// reuse after in-place input edits.
const simulationSources = new WeakMap<BuildSimulation, {
    buildOrder: PlannerItem[]
    orderKey: string
    economy: EconomySettings
    inputs: string
    order: ReplayOrder
    history?: ReplayHistory<Checkpoint>
    tail?: TailReplay
}>()

function projectSimulation(result: Pick<ReturnType<typeof simulateBuildOrderPass>, "plan" | "orderedPlan" | "projectDeliveries">): BuildSimulation {
    const buildEnd = Math.max(0, ...result.orderedPlan.map(action => action.blocked ? 0 : action.finishTime!))
    const horizon = Math.min(MAX_PLAN_SECONDS, Math.max(buildEnd + RESOURCE_PROJECTION_SECONDS, timelineEnd(result.plan)))
    return { plan: result.plan, orderedPlan: result.orderedPlan, deliveries: result.projectDeliveries(horizon) }
}

function isSupportedTail(item: PlannerItem, initialTownHall: string) {
    if (!(isConstruction(item) || isRecruitable(item)) || (item.construction?.preparationDuration ?? 0) !== 0) return false
    // The planner adds a row ID and may specify travel without preparation.
    const { orderId, construction, ...catalogFields } = item as PlannerItem & { orderId?: string }
    const catalogItem = Object.values(factions).find(faction => faction.startingTownHall === initialTownHall)
        ?.items.find(candidate => candidate.id === item.id)
    return !!catalogItem && Object.keys(catalogItem).length === Object.keys(catalogFields).length &&
        Object.entries(catalogItem).every(([key, value]) => {
            const actual = catalogFields[key as keyof typeof catalogFields]
            return actual === value || JSON.stringify(actual) === JSON.stringify(value)
        })
}

export function simulateBuildOrder(
    buildOrder: PlannerItem[],
    economy: EconomySettings,
    initialFoodUsed: number,
    baseFoodLimit: number,
    foodPerFarm: number,
    initialTownHall: string,
    options: number | { until?: number; previous?: BuildSimulation } = MAX_PLAN_SECONDS,
): BuildSimulation {
    const until = typeof options === "number" ? options : options.until ?? MAX_PLAN_SECONDS
    const previous = typeof options === "number" ? undefined : options.previous
    const inputs = JSON.stringify([economy, initialFoodUsed, baseFoodLimit, foodPerFarm, initialTownHall, until])
    const prior = previous && simulationSources.get(previous)
    const source = prior && prior.economy === economy && prior.inputs === inputs &&
        prior.orderKey === JSON.stringify(prior.buildOrder) ? prior : undefined
    const order = replayOrder(buildOrder)
    // These effects can change the finish or travel time of work started
    // before the cast. Let the forecast convergence replay from the opening.
    const forecasts = buildOrder.some(item => item.id === "whip" || item.id === "legions-call" ||
        (item.kind === "scroll" && (item.scrollId === "whip" || item.scrollId === "legions-call")))
    const history = !forecasts && order.catalog.length >= CATALOG_CHECKPOINT_INTERVAL ? new ReplayHistory<Checkpoint>() : undefined
    const boundary = history && source?.history && replayBoundary(source.order, order)
    // A removed late event may also shrink the effective scheduling horizon.
    const fixedBoundary = boundary?.fixedTime === Infinity ? Infinity : Math.min(boundary?.fixedTime ?? Infinity, until)
    let windows: WhipWindow[] = []
    let recruitmentWindows: RecruitmentWindow[] = []
    const run = (preparation?: PreparationSchedule, collectCandidatesThrough?: number,
        options?: Pick<PassOptions, "resume" | "capture"> & { speculative?: boolean }) => {
        const signature = history && replayPreparation(buildOrder, order, preparation)
        const collecting = collectCandidatesThrough !== undefined
        // Capturing the dedicated final-removal checkpoint requires processing
        // the final row, even if a general checkpoint already includes it.
        const maxCount = order.catalog.length - Number(!!options?.capture)
        const local = signature && !options?.resume
            ? history!.find(signature, collecting, maxCount, Infinity) : undefined
        const reused = signature && !options?.resume && boundary
            ? source!.history!.find(signature, collecting, Math.min(maxCount, boundary.catalogCount), fixedBoundary, local?.count) : undefined
        const point = reused || local
        const resume = options?.resume ? copyCheckpoint(options.resume) : point &&
            restoreCheckpoint(point.state, buildOrder, order, reused && boundary ? boundary.rowMap : undefined)
        const captureCheckpoint = signature && !options?.speculative ? (state: Checkpoint) => {
            const { simulation } = state
            const weight = simulation.deliveries.length + simulation.eventBoundaries.size + simulation.workers.length +
                state.plan.length + state.unitInstances.length + state.timedEventsByIndex.size
            history!.capture(state.plan.length, simulation.time, collecting, signature, weight, () => copyCheckpoint(state))
        } : undefined
        return simulateBuildOrderPass(buildOrder, economy, initialFoodUsed, baseFoodLimit, foodPerFarm,
            initialTownHall, until, windows, recruitmentWindows, preparation, collectCandidatesThrough,
            { resume, capture: options?.capture, captureCheckpoint })
    }
    const verify = (preparation: PreparationSchedule) => run(preparation, undefined, { speculative: true })
    const remember = (pass: Parameters<typeof projectSimulation>[0], tail?: TailReplay) => {
        const result = projectSimulation(pass)
        if (history || tail) {
            simulationSources.set(result, { buildOrder: [...buildOrder], orderKey: JSON.stringify(buildOrder),
                economy, inputs, order, history, tail })
        }
        return result
    }

    const tail = source?.tail
    if (source && tail && Math.abs(buildOrder.length - source.buildOrder.length) === 1) {
        const removing = buildOrder.length < source.buildOrder.length
        const shorter = removing ? buildOrder : source.buildOrder
        const longer = removing ? source.buildOrder : buildOrder
        if (shorter.length >= tail.reuse.minimumPrefixLength && shorter.every((item, index) => item === longer[index]) &&
            isSupportedTail(longer[longer.length - 1], initialTownHall)) {
            try {
                const selected = run(tail.preparation, undefined,
                    { resume: removing ? tail.beforeTail : tail.end, capture: true, speculative: true })
                // The unchanged prefix keeps earlier rejected candidates invalid.
                // Every accepted refinement must also work with the changed tail.
                if (matchesPreparationReuse(verify, selected, tail)) {
                    return remember(selected, { ...tail, beforeTail: selected.beforeTail, end: selected.end })
                }
            } catch {
                // Let the full search handle a speculative replay that exceeds a limit.
            }
        }
    }

    const firstChangedRow = source?.buildOrder.findIndex((item, index) => item !== buildOrder[index]) ?? 0
    const commonRows = firstChangedRow < 0 ? source!.buildOrder.length : firstChangedRow
    const reusablePreparation = tail && boundary && boundary.fixedTime === Infinity &&
        commonRows >= tail.reuse.minimumPrefixLength &&
        buildOrder.every((item, index) => (item.construction?.preparationDuration ?? 0) <= 0 || index < commonRows)
        ? { ...tail, verify } : undefined

    // Casts can change work already scheduled into the future. Replay with accepted
    // travel/recruitment forecasts, keeping target and mana validation chronological.
    for (let pass = 0; pass <= MAX_PLAN_ACTIONS + 1; pass++) {
        const prepared = buildOrder.some(item => (item.construction?.preparationDuration ?? 0) > 0)
            ? schedulePreparation(buildOrder, economy, run, reusablePreparation) : undefined
        const result = prepared ?? run()
        const next = result.orderedPlan.filter(action => action.item.id === "whip" && !action.blocked)
            .map(action => ({ startTime: action.startTime!, finishTime: action.finishTime! }))
        const nextRecruitment = result.orderedPlan.filter(action => action.item.id === "legions-call" && !action.blocked)
            .map(action => ({ startTime: action.startTime!, finishTime: action.finishTime!, buildingInstanceId: action.buildingInstanceId! }))
        if (JSON.stringify(next) === JSON.stringify(windows) && JSON.stringify(nextRecruitment) === JSON.stringify(recruitmentWindows)) {
            // Whip and Legion's Call can change earlier work through forecasts.
            if (prepared?.preparation.commands.size && !prepared.preparation.blocked.size &&
                !windows.length && !recruitmentWindows.length && prepared.reuse.minimumPrefixLength <= buildOrder.length &&
                matchesPreparation(result, prepared.preparation)) {
                const selected = run(prepared.preparation, undefined, { capture: true })
                return remember(selected, { preparation: prepared.preparation, reuse: prepared.reuse,
                    beforeTail: selected.beforeTail, end: selected.end })
            }
            return remember(result)
        }
        windows = next
        recruitmentWindows = nextRecruitment
    }
    throw new Error("Scroll, construction and recruitment timing did not converge.")
}

function simulateBuildOrderPass(
    buildOrder: PlannerItem[],
    economy: EconomySettings,
    initialFoodUsed: number,
    baseFoodLimit: number,
    foodPerFarm: number,
    initialTownHall: string,
    until = MAX_PLAN_SECONDS,
    constructionWhipWindows: WhipWindow[] = [],
    recruitmentWindows: RecruitmentWindow[] = [],
    preparation?: PreparationSchedule,
    collectCandidatesThrough?: number,
    { resume: restored, capture, captureCheckpoint }: PassOptions = {},
) {
    validateActionCount(buildOrder.length)
    validatePlanTime(until, "Simulation horizon")
    const recruitmentReduction = legionsCallEffect(economy).recruitmentTimeReduction
    const { items: catalog, id: faction } = Object.values(factions).find(faction => faction.startingTownHall === initialTownHall)!
    const initial = catalog.find(item => item.name === initialTownHall)!
    const workerItem = catalog.find(item => item.id === (faction === "light" ? "worker" : "slave"))!
    const simulation = restored?.simulation ?? new WorkerEconomy(economy, constructionWhipWindows, collectCandidatesThrough !== undefined)
    const passState: Checkpoint = restored ?? {
        nextIndex: 0,
        simulation,
        plan: [],
        spending: [],
        buildings: [newBuilding(initial)],
        unitInstances: simulation.workers.map(() => ({ item: workerItem, readyAt: 0, killed: false })),
        workerCompletions: [],
        timedEventsByIndex: new Map(),
        preparationFailures: new Map(),
        preparedWorkers: new Map(),
        lastScrollCommand: -Infinity,
        lastCatalogCommand: -Infinity,
    }
    const { nextIndex, plan, spending, buildings, unitInstances, workerCompletions, timedEventsByIndex,
        preparationFailures, preparedWorkers } = passState
    const collision = manaSpentCollision(buildOrder)
    if (collision) throw new Error(collision)
    const pendingScrolls = buildOrder.flatMap<{ item: Extract<PlannerItem, { kind: "scroll" | "mana-spent" }>; index: number }>((item, index) => {
        if (item.kind === "mana-spent") {
            createManaSpentAction(manaSpentCommand(item), faction)
            return [{ item, index }]
        }
        if (!isScrollAction(item)) return []
        createScrollAction(scrollCommand(item), faction)
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const pendingResourcesCollected = buildOrder.flatMap((item, index) => {
        if (item.kind !== "resources-collected") return []
        createResourcesCollectedAction(resourcesCollectedCommand(item))
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const pendingWorkerAndLossEvents = buildOrder.flatMap((item, index) => {
        if (item.kind !== "unit-is-killed" && item.kind !== "worker-event") return []
        if (item.kind === "worker-event") parseWorkerEvent(workerEventCommand(item))
        else createUnitKilledAction(unitKilledCommand(item), faction)
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const resolvedEvents = [...timedEventsByIndex.values()]
    const unitKilledPlan = resolvedEvents.filter(action => action.item.kind === "unit-is-killed")
    const lastFixedCommand = Math.max(0,
        pendingWorkerAndLossEvents[pendingWorkerAndLossEvents.length - 1]?.item.commandTime ?? 0,
        pendingResourcesCollected[pendingResourcesCollected.length - 1]?.item.commandTime ?? 0,
        pendingScrolls[pendingScrolls.length - 1]?.item.commandTime ?? 0,
    )
    // Timed commands are processed independently of their position among catalog rows.
    until = Math.max(until, lastFixedCommand, ...pendingScrolls.map(({ item }) => {
        if (item.kind === "mana-spent") return 0
        const scroll = scrollEffect(item.scrollId, economy)
        return item.commandTime + scroll.startDelay + scroll.duration
    }))
    const scrollPlan = resolvedEvents.filter(action => isScrollAction(action.item) || action.item.kind === "mana-spent")
    for (const pending of [pendingScrolls, pendingResourcesCollected, pendingWorkerAndLossEvents]) {
        while (pending.length && timedEventsByIndex.has(pending[0].index)) pending.shift()
    }
    const wellPlan: ScheduledAction[] = evaluateManaWells(buildOrder).map(({ item, index, blocked, blockedReason }) => {
        const action: ScheduledAction = { item, cost: { gold: 0, wood: 0 }, blocked, blockedReason,
            commandTime: item.commandTime, startTime: blocked ? null : item.commandTime,
            finishTime: blocked ? null : item.commandTime, workerReturnTime: null, workerId: null }
        timedEventsByIndex.set(index, action)
        return action
    })
    until = Math.max(until, ...wellPlan.map(action => action.commandTime!))
    until = Math.min(MAX_PLAN_SECONDS, until)
    const namesById = new Map([...catalog, ...buildOrder].map(item => [item.id, item.name]))
    const pendingDepartures = [...(preparation?.commands ?? [])]
        .filter(([index]) => index >= nextIndex && !preparation?.blocked.has(index) &&
            !preparedWorkers.has(index) && !preparationFailures.has(index))
        .map(([index, command]) => ({ index, time: command - buildOrder[index].construction!.preparationDuration! }))
        .sort((a, b) => a.time - b.time || a.index - b.index)
    const interruptReturn = (workerId: number, time: number) => {
        const interrupted = plan.find(action => action.workerId === workerId && action.finishTime! <= time && (action.workerReturnEndTime ?? action.workerReturnTime ?? 0) > time)
        if (interrupted) interrupted.workerReturnEndTime = time
    }
    const saturation = Math.max(
        1,
        Math.ceil(
            (2 * economy.goldTravelTime + economy.goldGatherTime) /
                Math.max(0.001, economy.goldGatherTime),
        ),
    )

    const advanceTo = (time: number) => {
        workerCompletions.sort((a, b) => a - b)
        while (Math.min(pendingDepartures[0]?.time ?? Infinity, workerCompletions[0] ?? Infinity, pendingScrolls[0]?.item.commandTime ?? Infinity, pendingResourcesCollected[0]?.item.commandTime ?? Infinity, pendingWorkerAndLossEvents[0]?.item.commandTime ?? Infinity) <= time) {
            const eventTime = Math.min(pendingDepartures[0]?.time ?? Infinity, workerCompletions[0] ?? Infinity, pendingScrolls[0]?.item.commandTime ?? Infinity, pendingResourcesCollected[0]?.item.commandTime ?? Infinity, pendingWorkerAndLossEvents[0]?.item.commandTime ?? Infinity)
            simulation.advanceTo(eventTime)
            while (workerCompletions[0] === eventTime) {
                workerCompletions.shift()
                const goldCount = simulation.workers.filter(({ assignment }) => assignment === "gold").length
                simulation.addWorker(goldCount < saturation ? "gold" : "wood")
            }
            while (pendingWorkerAndLossEvents[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingWorkerAndLossEvents.shift()!
                if (item.kind === "worker-event") {
                    const blocked = !simulation.applyWorkerEvent(item)
                    timedEventsByIndex.set(index, { item, blocked, cost: { gold: 0, wood: 0 }, commandTime: eventTime,
                        startTime: blocked ? null : eventTime, finishTime: blocked ? null : eventTime, workerReturnTime: null, workerId: null,
                        ...(blocked ? { blockedReason: `${item.name}: not enough eligible workers for count ${item.count}.` } : {}) })
                    continue
                }
                const target = catalog.find(unit => unit.id === item.unitId)!
                const isWorker = target.id === workerItem.id
                const instance = unitInstances.find(unit => unit.item.id === target.id && !unit.killed && unit.readyAt <= eventTime)
                const worker = isWorker ? simulation.selectWorkerToKill(item.workerGroup) : undefined
                const blocked = !instance || (isWorker && !worker)
                if (!blocked) {
                    instance!.killed = true
                    if (worker) simulation.killWorker(worker.id)
                }
                const action: ScheduledAction = { item, cost: { gold: 0, wood: 0 }, blocked,
                    commandTime: eventTime, startTime: blocked ? null : eventTime, finishTime: blocked ? null : eventTime,
                    workerReturnTime: null, workerId: blocked ? null : worker?.id ?? null,
                    foodReleased: blocked ? 0 : target.food,
                    ...(blocked ? { blockedReason: isWorker && instance
                        ? `Unit is killed: no available ${item.workerGroup === "idle" ? "idle" : "gathering"} ${target.name}; workers assigned to construction cannot be killed.`
                        : `Unit is killed requires a living ${target.name} at this timestamp (recruitment must be complete).` } : {}) }
                unitKilledPlan.push(action)
                timedEventsByIndex.set(index, action)
            }
            while (pendingResourcesCollected[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingResourcesCollected.shift()!
                const available = resourceAt(economy, simulation.deliveries, spending, eventTime)
                simulation.deliveries.push({ time: eventTime,
                    gold: Math.max(-available.gold, item.collectedGold),
                    wood: Math.max(-available.wood, item.collectedWood), worker: -1 })
                timedEventsByIndex.set(index, { item, cost: { gold: 0, wood: 0 }, blocked: false,
                    commandTime: eventTime, startTime: eventTime, finishTime: eventTime,
                    workerReturnTime: null, workerId: null })
            }
            while (pendingScrolls[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingScrolls.shift()!
                if (item.kind === "mana-spent") {
                    const availableMana = manaAt(economy, [...plan, ...scrollPlan, ...wellPlan], eventTime).mana
                    const cooldownUntil = passState.lastScrollCommand + scrollCooldown(economy)
                    const cooldownBlocked = eventTime < cooldownUntil
                    const manaBlocked = availableMana + 1e-9 < item.mana
                    const blocked = cooldownBlocked || manaBlocked
                    const action: ScheduledAction = { item, cost: { gold: 0, wood: 0 }, blocked,
                        commandTime: eventTime, startTime: blocked ? null : eventTime, finishTime: blocked ? null : eventTime,
                        workerReturnTime: null, workerId: null, manaCost: item.mana,
                        ...(blocked ? { blockedReason: cooldownBlocked
                            ? `Scroll cooldown: Mana spent can be used at ${cooldownUntil} seconds`
                            : `Insufficient mana for Mana spent: requires ${item.mana}, available ${availableMana.toFixed(1)}` } : {}) }
                    scrollPlan.push(action)
                    timedEventsByIndex.set(index, action)
                    if (!blocked) passState.lastScrollCommand = eventTime
                    continue
                }
                const scroll = scrollEffect(item.scrollId, economy)
                const availableMana = manaAt(economy, [...plan, ...scrollPlan, ...wellPlan], eventTime).mana
                const readyMana = manaAt(economy, [...plan, ...scrollPlan, ...wellPlan], Math.max(0, eventTime - economy.orderDelay)).mana
                const cooldownUntil = passState.lastScrollCommand + scrollCooldown(economy) + economy.orderDelay
                const cooldownBlocked = eventTime < cooldownUntil
                const manaBlocked = availableMana + 1e-9 < scroll.manaCost
                const orderDelayBlocked = eventTime < economy.orderDelay || readyMana + 1e-9 < scroll.manaCost
                const startTime = eventTime + scroll.startDelay
                const finishTime = startTime + scroll.duration
                const horizonBlocked = finishTime > MAX_PLAN_SECONDS
                const targets = item.scrollId === "legions-call"
                    ? productionBuildingsAt(plan, initial, catalog, eventTime).filter(({ item: target }) => target.id === item.targetItemId) : []
                // Compare remaining work, undoing forecast speedups after this command.
                // This prevents a cast from changing its own target on the next replay.
                const earlierRecruitmentWindows = scrollPlan.filter(action => action.item.id === "legions-call" && !action.blocked)
                    .map(action => ({ startTime: action.startTime!, finishTime: action.finishTime!, buildingInstanceId: action.buildingInstanceId! }))
                const timeLeft = (id: number) => {
                    const work = plan.filter(action => !action.blocked && isRecruitable(action.item) &&
                    action.buildingInstanceId === id && action.commandTime! <= eventTime && action.finishTime! > eventTime)
                    .reduce((work, action) => work + recruitmentWork(eventTime, action.finishTime!, id, recruitmentWindows, recruitmentReduction), 0)
                    return recruitmentFinish(eventTime, work, id, earlierRecruitmentWindows, recruitmentReduction) - eventTime
                }
                targets.sort((a, b) => timeLeft(b.buildingInstanceId) - timeLeft(a.buildingInstanceId) || a.buildingInstanceId - b.buildingInstanceId)
                const targetBlocked = item.scrollId === "legions-call" && !targets.length
                const blocked = cooldownBlocked || manaBlocked || orderDelayBlocked || horizonBlocked || targetBlocked
                scrollPlan.push({ item, cost: { gold: 0, wood: 0 }, commandTime: eventTime,
                    buildingInstanceId: targets[0]?.buildingInstanceId,
                    startTime: blocked ? null : startTime, finishTime: blocked ? null : finishTime,
                    workerReturnTime: null, workerId: null, manaCost: scroll.manaCost, blocked,
                    ...(blocked ? { blockedReason: targetBlocked
                        ? `Legion's Call requires an available ${namesById.get(item.targetItemId!) ?? item.targetItemId} at the command timestamp`
                        : horizonBlocked
                        ? "Scroll effect would exceed the 30:00 plan limit"
                        : cooldownBlocked
                        ? `Scroll cooldown: next scroll can be used at ${cooldownUntil} seconds`
                        : manaBlocked ? `Insufficient mana for ${scroll.name}: requires ${scroll.manaCost}, available ${availableMana.toFixed(1)}`
                        : `Scroll order delay: ${scroll.manaCost} mana must be available for ${economy.orderDelay} seconds before the command` } : {}),
                })
                timedEventsByIndex.set(index, scrollPlan[scrollPlan.length - 1])
                if (!blocked) {
                    passState.lastScrollCommand = eventTime
                    // Model the player's miner preparation now; the scroll itself activates later.
                    if (item.scrollId === "whip") simulation.prepareGoldWorkerForWhip()
                    simulation.scheduleScroll(item.scrollId, startTime, finishTime)
                }
            }
            while (pendingDepartures[0]?.time === eventTime) {
                const { index } = pendingDepartures.shift()!
                const item = buildOrder[index]
                const worker = simulation.selectBuilder(item.construction?.useIdleWorker)
                if (!worker) preparationFailures.set(index, item.construction?.useIdleWorker
                    ? "No available idle worker at preparation departure." : "No eligible gathering worker at preparation departure.")
                else {
                    interruptReturn(worker.id, eventTime)
                    preparedWorkers.set(index, { workerId: worker.id, departureTime: eventTime })
                    simulation.prepareConstruction(worker)
                }
            }
        }
        simulation.advanceTo(time)
        completeUpgrades(buildings, time)
    }

    if (!restored) advanceTo(economy.orderDelay)

    // Evaluate technology and capacity at the time their order delay has elapsed.
    // Replaying completed upgrades preserves the earlier levels of each instance.
    const unlockedBuildingsAt = (time: number) => {
        const unlocked = [newBuilding(initial, economy.orderDelay), ...plan.filter(action => action.item.kind === "building" && !action.blocked)
            .map(action => newBuilding(action.item, action.finishTime! + economy.orderDelay))]
        const upgrades = plan.filter(action => action.item.kind === "upgrade" && action.finishTime !== null && action.finishTime + economy.orderDelay <= time)
            .sort((a, b) => a.finishTime! - b.finishTime!)
        for (const action of upgrades) {
            const building = unlocked[action.buildingInstanceId!]
            building.itemId = action.item.id
            building.level = action.item.level ?? building.level + 1
            building.name = action.item.name
        }
        return unlocked
    }

    // Catalog commands run after fixed events at the same timestamp. Save the
    // state between rows, before draining pending work for the projection.
    const captureAt = (index: number) => !pendingDepartures.length && !pendingScrolls.length &&
        !pendingResourcesCollected.length && !pendingWorkerAndLossEvents.length
        ? copyCheckpoint({ ...passState, nextIndex: index })
        : undefined
    let beforeTail: Checkpoint | undefined
    let canCapture = captureCheckpoint
    for (let itemIndex = nextIndex; itemIndex < buildOrder.length; itemIndex++) {
        const item = buildOrder[itemIndex]
        if (isTimedEvent(item)) continue
        if (canCapture && plan.length && plan.length % CATALOG_CHECKPOINT_INTERVAL === 0) canCapture(passState)
        if (capture && itemIndex === buildOrder.length - 1 && !preparation?.commands.has(itemIndex)) {
            beforeTail = captureAt(itemIndex)
        }
        if (item.construction) parseConstructionSettings(item.construction)
        const cost = itemCost(item, plan.map((action) => action.item), initialTownHall)
        const needsProducer = item.kind !== "building"
        let scheduled = false
        let blockedReason = "Waiting for resources, food, producer, or worker"
        // Only earlier successful orders can unlock this action. Detect impossible
        // dependencies without spending the simulation horizon waiting for later rows.
        const eventualBuildings = unlockedBuildingsAt(Infinity)
        const missingEarlierRequirement = item.requirements?.find(requirement =>
            requirementCount(eventualBuildings, requirement, Infinity) < requirement.count)
        const eventualProducer = eventualBuildings.some(building => item.kind === "upgrade"
            ? (item.upgradeFrom ? building.itemId === item.upgradeFrom : building.name === item.producer)
            : item.producerBuildingId ? building.buildingId === item.producerBuildingId : building.name === item.producer)
        const earlierNames = new Set([initialTownHall, ...plan.filter(action => !action.blocked).map(action => action.item.name)])
        const missingEarlierName = item.prerequisites.find(name => !earlierNames.has(name))
        const eventualHeroTier = item.kind === "hero" ? heroAltarLevel(unitInstances.filter(unit => !unit.killed).map(unit => unit.item)) : 1
        const pendingHeroLoss = pendingWorkerAndLossEvents.some(({ item: event }) => event.kind === "unit-is-killed" && catalog.some(unit => unit.id === event.unitId && unit.kind === "hero"))
        const missingHeroTier = item.kind === "hero" && !pendingHeroLoss && !unitInstances.some(unit => unit.item.id === item.id && !unit.killed) && requirementCount(eventualBuildings,
            { item: item.producerBuildingId!, count: 1, minLevel: eventualHeroTier }, Infinity) < 1
        const dependencyProblem = preparation?.blocked.get(itemIndex) ?? (missingHeroTier ? `Requires at least one ${item.producer} at level ${eventualHeroTier} or higher for hero ${eventualHeroTier}` : missingEarlierRequirement
            ? `Requires ${missingEarlierRequirement.count} × ${namesById.get(missingEarlierRequirement.item) ?? missingEarlierRequirement.item}${missingEarlierRequirement.minLevel ? ` at level ${missingEarlierRequirement.minLevel} or higher` : ""}`
            : item.kind === "upgrade" && !eventualProducer
                ? `Requires an available ${item.producer} to upgrade`
                : needsProducer && !eventualProducer
                    ? `Requires ${item.producer} earlier in the build order`
                    : missingEarlierName ? `Requires ${missingEarlierName} earlier in the build order` : null)
        if (dependencyProblem) blockedReason = dependencyProblem
        // Earlier orders already reserve their costs, even when checking readiness
        // before their command time. The same resources cannot unlock two orders.
        const reservedSpending = spending.map(event => ({ ...event, time: 0 }))
        const reservedFood = plan.map(action => ({ ...action, commandTime: 0 }))
        while (!dependencyProblem && simulation.time <= until) {
            advanceTo(simulation.time)
            const time = simulation.time
            if (preparationFailures.has(itemIndex)) { blockedReason = preparationFailures.get(itemIndex)!; break }
            const preparationCommand = preparation?.commands.get(itemIndex) ?? item.construction?.preparationDuration ?? 0
            // Only construction commands need spacing; recruitment retains its normal queue.
            const commandReadyAt = isConstruction(item)
                ? Math.max(passState.lastCatalogCommand, passState.lastScrollCommand) + economy.orderDelay : -Infinity
            const unlockedBuildings = unlockedBuildingsAt(time)
            const maxCountReached = item.maxCount !== undefined && unitInstances.filter(unit => unit.item.id === item.id && !unit.killed).length >= item.maxCount
            if (maxCountReached && !pendingWorkerAndLossEvents.some(kill => kill.item.kind === "unit-is-killed" && kill.item.unitId === item.id)) {
                blockedReason = `${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`
                break
            }
            const requiredAltarLevel = item.kind === "hero"
                ? heroAltarLevel(unitInstances.filter(unit => !unit.killed).map(unit => unit.item)) : 1
            const completed = plan.filter(({ finishTime }) => finishTime !== null && finishTime <= time)
            const completedNames = new Set([initialTownHall, ...completed.filter(action => action.finishTime! + economy.orderDelay <= time).map(({ item }) => item.name)])
            const matching = buildings.filter(building => item.kind === "upgrade"
                ? (item.upgradeFrom ? building.itemId === item.upgradeFrom : building.name === item.producer) && !building.upgrade
                : item.producerBuildingId ? building.buildingId === item.producerBuildingId : building.name === item.producer)
            const readyProducers = isRecruitable(item) ? [...matching]
                : matching.filter(building => building.readyAt + economy.orderDelay <= time && !building.upgrade)
            if (isRecruitable(item)) readyProducers.sort((a, b) =>
                recruitmentFinish(Math.max(time, a.readyAt + economy.orderDelay, a.availableAt), actionDuration(item, economy), buildings.indexOf(a), recruitmentWindows, recruitmentReduction) -
                recruitmentFinish(Math.max(time, b.readyAt + economy.orderDelay, b.availableAt), actionDuration(item, economy), buildings.indexOf(b), recruitmentWindows, recruitmentReduction))
            const producer = isRecruitable(item)
                ? readyProducers[0]?.availableAt <= time && readyProducers[0].readyAt + economy.orderDelay <= time && !readyProducers[0].upgrade
                    ? readyProducers[0] : undefined
                : readyProducers.find(building => building.availableAt <= time)
            const heroTierUnlocked = item.kind !== "hero" || requirementCount(unlockedBuildings,
                { item: item.producerBuildingId!, count: 1, minLevel: requiredAltarLevel }, time) >= 1
            const prepared = preparedWorkers.get(itemIndex)
            const builder = isConstruction(item) ? preparation?.commands.has(itemIndex)
                ? prepared ? simulation.workers[prepared.workerId] : undefined
                : simulation.selectBuilder(item.construction?.useIdleWorker) : undefined
            const state = resourceAt(economy, simulation.deliveries, spending, time)
            // Avoid missing a delivery at the exact boundary through subtraction rounding.
            const readinessTime = Math.max(0, Math.min(time, time - economy.orderDelay + 1e-9))
            const readyResources = resourceAt(economy, simulation.deliveries, reservedSpending, readinessTime)
            const readyFoodUsed = foodUsedAt([...reservedFood, ...unitKilledPlan], initialFoodUsed, readinessTime)
            const readyFoodLimit = baseFoodLimit + completed.filter(action =>
                (action.item.id === "farm" || action.item.id === "pigsty") && action.finishTime! <= readinessTime).length * foodPerFarm
            const foodUsed = foodUsedAt([...plan, ...unitKilledPlan], initialFoodUsed, time)
            const foodLimit =
                baseFoodLimit +
                completed.filter(({ item }) => item.id === "farm" || item.id === "pigsty").length * foodPerFarm
            const missingRequirement = item.requirements?.find(requirement =>
                requirementCount(unlockedBuildings, requirement, time) < requirement.count)
            const withinLimit = item.kind !== "building" || buildings.filter(building =>
                building.buildingId === (item.buildingId ?? item.id)).length < buildingLimit(item, unlockedBuildings, time)
            blockedReason = maxCountReached ? `${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`
                : item.kind === "upgrade" && !matching.length
                ? `Requires an available ${item.producer} to upgrade`
                : missingRequirement
                    ? `Requires ${missingRequirement.count} × ${namesById.get(missingRequirement.item) ?? missingRequirement.item}${missingRequirement.minLevel ? ` at level ${missingRequirement.minLevel} or higher` : ""}`
                    : !withinLimit ? `${item.name} limit reached at the current ${item.limit?.basedOn === initial.id
                        ? "town-hall" : namesById.get(item.limit?.basedOn ?? "") ?? "prerequisite"} level`
                    : !heroTierUnlocked
                        ? `Requires at least one ${item.producer} at level ${requiredAltarLevel} or higher for hero ${requiredAltarLevel}`
                    : isRecruitable(item) && foodUsed + item.food > foodLimit
                        ? `Insufficient supply: requires ${item.food}, available ${Math.max(0, foodLimit - foodUsed)} (${foodUsed}/${foodLimit} used)`
                    : "Waiting for resources, food, producer, or worker"
            const purchaseReady = (
                time >= commandReadyAt && time >= preparationCommand &&
                (!needsProducer || producer) &&
                item.prerequisites.every((name) => completedNames.has(name)) &&
                !missingRequirement && withinLimit && heroTierUnlocked && !maxCountReached &&
                state.gold >= cost.gold &&
                state.wood >= cost.wood &&
                (cost.gold === 0 || readyResources.gold >= cost.gold) &&
                (cost.wood === 0 || readyResources.wood >= cost.wood) &&
                (!isRecruitable(item) || (foodUsed + item.food <= foodLimit && readyFoodUsed + item.food <= readyFoodLimit))
            )
            if (purchaseReady && item.construction?.useIdleWorker && !builder) {
                blockedReason = "No available idle worker at construction departure."
                break
            }
            if (purchaseReady && (!isConstruction(item) || builder)) {
                const travelTime = builder ? simulation.constructionTravelTime(builder, item.construction?.outwardDuration) : 0
                const startTime = time + travelTime
                const duration = actionDuration(item, economy)
                const finishTime = isRecruitable(item) && producer
                    ? recruitmentFinish(startTime, duration, buildings.indexOf(producer), recruitmentWindows, recruitmentReduction)
                    : startTime + duration
                const returnTravelTime = builder && !item.construction?.useIdleWorker ? simulation.constructionReturnTravelTime(finishTime, Math.max(item.construction?.returnDuration ?? economy.constructionStartDelay, simulation.remainingJourney(builder))) : 0
                const workerReturnTime = builder ? finishTime + returnTravelTime : null
                if ((workerReturnTime ?? finishTime) > MAX_PLAN_SECONDS) {
                    blockedReason = "Action would exceed the 30:00 plan limit"
                    break
                }
                if (builder && !prepared) interruptReturn(builder.id, time)
                plan.push({
                    item,
                    cost,
                    blocked: false,
                    commandTime: time,
                    departureTime: builder ? prepared?.departureTime ?? time : null,
                    startTime,
                    finishTime,
                    workerReturnTime,
                    workerReturnEndTime: workerReturnTime,
                    workerId: builder?.id ?? null,
                    buildingInstanceId: producer ? buildings.indexOf(producer) : item.kind === "building" ? buildings.length : undefined,
                })
                if (isRecruitable(item)) unitInstances.push({ item, readyAt: finishTime, killed: false })
                spending.push({ time, gold: -cost.gold, wood: -cost.wood })
                passState.lastCatalogCommand = time
                if (builder) {
                    simulation.construct(builder, duration, travelTime, returnTravelTime)
                }
                if (producer) {
                    producer.availableAt = finishTime
                    if (item.kind === "upgrade") producer.upgrade = { item, finishTime }
                }
                if (item.kind === "building") {
                    buildings.push(newBuilding(item, finishTime))
                    if (item.id === "sawmill") simulation.scheduleSawmill(finishTime)
                }
                if (item.id === "worker" || item.id === "slave") {
                    workerCompletions.push(finishTime)
                }
                scheduled = true
                break
            }
            const nextTime = Math.min(
                ...[
                    simulation.nextEventTime,
                    pendingDepartures[0]?.time ?? Infinity,
                    preparationCommand,
                    commandReadyAt,
                    pendingScrolls[0]?.item.commandTime ?? Infinity,
                    pendingResourcesCollected[0]?.item.commandTime ?? Infinity,
                    pendingWorkerAndLossEvents[0]?.item.commandTime ?? Infinity,
                    ...workerCompletions,
                    ...buildings.map(({ availableAt }) => availableAt),
                    ...plan.flatMap(({ finishTime }) => (finishTime === null ? [] : [finishTime])),
                    ...plan.flatMap(({ finishTime }) => (finishTime === null ? [] : [finishTime + economy.orderDelay])),
                    simulation.deliveries.reduce((next, event) => {
                        const readyAt = event.time + economy.orderDelay
                        return readyAt > time ? Math.min(next, readyAt) : next
                    }, Infinity),
                    ...unitKilledPlan.map(action => action.commandTime! + economy.orderDelay),
                ]
                    // Past events cannot unblock an action.
                    .filter((candidate) => candidate > time),
            )
            if (!Number.isFinite(nextTime) || nextTime > until) {
                break
            }
            advanceTo(nextTime)
        }
        if (!scheduled) {
            canCapture = undefined
            plan.push({
                item,
                cost,
                blocked: true,
                blockedReason,
                commandTime: null,
                startTime: null,
                finishTime: null,
                workerReturnTime: null,
                workerId: null,
            })
        }
    }
    if (canCapture && plan.length) canCapture(passState)
    const end = capture ? captureAt(buildOrder.length) : undefined
    const replayEnd = Math.min(MAX_PLAN_SECONDS, Math.max(
        until,
        simulation.time,
        ...plan.map(({ finishTime, workerReturnTime }) => workerReturnTime ?? finishTime ?? 0),
    ))
    // Finish resolving fixed commands and reservations. Only candidate generation
    // needs additional gathering boundaries, and later ones cannot improve its command.
    advanceTo(Math.min(replayEnd, Math.max(
        simulation.time,
        lastFixedCommand,
        collectCandidatesThrough ?? 0,
        ...pendingDepartures.map(({ time }) => time),
    )))
    // Preserve source row identity for existing consumers; orderedPlan is the chronological view.
    const catalogPlan = [...plan]
    const inputPlan = buildOrder.map((item, index) => isTimedEvent(item)
        ? timedEventsByIndex.get(index)!
        : catalogPlan.shift()!)
    const orderedPlan = inputPlan.map((action, index) => ({ action, index }))
        .sort((a, b) => (a.action.commandTime ?? Infinity) - (b.action.commandTime ?? Infinity) || a.index - b.index)
        .map(({ action }) => action)
    const projectDeliveries = (horizon: number) => {
        // Scheduling may have searched beyond the output horizon for a blocked action.
        if (simulation.time > horizon) return simulation.deliveries.filter(({ time }) => time <= horizon)
        if (simulation.time < horizon) advanceTo(horizon)
        return simulation.deliveries
    }
    const candidateEventTimes = collectCandidatesThrough === undefined ? []
        : [...simulation.eventBoundaries, ...simulation.deliveries.map(({ time }) => time)]
    return { plan: inputPlan, orderedPlan, preparationFailures, candidateEventTimes, projectDeliveries, beforeTail, end }
}
