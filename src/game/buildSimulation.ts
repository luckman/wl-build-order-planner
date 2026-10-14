import { MAX_PLAN_SECONDS, validateActionCount, validatePlanTime } from "./plannerLimits"
import { createUnitLossAction, unitLossCommand, foodUsedAt } from "./unitLosses"
import { evaluateManaWells } from "./manaWells"
import { createResourceAction, resourceCommand, isTimedEvent } from "./resourceEvents"
import { factions, heroAltarLevel, isRecruitable, itemCost, type PlannerItem } from "./gameData"
import { buildingLimit, completeUpgrades, newBuilding, requirementCount } from "./buildingRules"
import { type EconomySettings, manaAt, resourceAt, WorkerEconomy } from "./resourceSimulation"
import { createScrollAction, SCROLLS, isScrollAction, scrollCommand, scrollCooldown } from "./scrolls"
import { actionDuration } from "./playerLevels"

export type ScheduledAction = {
    item: PlannerItem
    cost: { gold: number; wood: number }
    blocked: boolean
    blockedReason?: string
    buildingInstanceId?: number
    commandTime: number | null
    startTime: number | null
    finishTime: number | null
    workerReturnTime: number | null
    workerId: number | null
    foodReleased?: number
    manaCost?: number
}

function requiresConstructionWorker(item: PlannerItem) {
    return item.kind === "building" || item.kind === "upgrade"
}

export function simulateBuildOrder(
    buildOrder: PlannerItem[],
    economy: EconomySettings,
    initialFoodUsed: number,
    baseFoodLimit: number,
    foodPerFarm: number,
    initialTownHall: string,
    until = MAX_PLAN_SECONDS,
) {
    validateActionCount(buildOrder.length)
    validatePlanTime(until, "Simulation horizon")
    const simulation = new WorkerEconomy(economy)
    const plan: ScheduledAction[] = []
    const spending: Array<{ time: number; gold: number; wood: number }> = []
    const catalog = Object.values(factions).find(faction => faction.startingTownHall === initialTownHall)!.items
    const faction = Object.values(factions).find(faction => faction.startingTownHall === initialTownHall)!.id
    const pendingScrolls = buildOrder.flatMap((item, index) => {
        if (!isScrollAction(item)) return []
        createScrollAction(scrollCommand(item), faction)
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const pendingResources = buildOrder.flatMap((item, index) => {
        if (item.kind !== "resource") return []
        createResourceAction(resourceCommand(item))
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const pendingLosses = buildOrder.flatMap((item, index) => {
        if (item.kind !== "unit-loss") return []
        createUnitLossAction(unitLossCommand(item), faction)
        return [{ item, index }]
    }).sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
    const lossPlan: ScheduledAction[] = []
    const workerItem = catalog.find(item => item.id === (faction === "light" ? "worker" : "slave"))!
    const unitInstances: Array<{ item: PlannerItem; readyAt: number; lost: boolean }> =
        simulation.workers.map(() => ({ item: workerItem, readyAt: 0, lost: false }))
    // Timed commands are processed independently of their position among catalog rows.
    until = Math.max(until, ...pendingLosses.map(({ item }) => item.commandTime), ...pendingResources.map(({ item }) => item.commandTime), ...pendingScrolls.map(({ item }) => item.commandTime + SCROLLS[item.scrollId].startDelay + SCROLLS[item.scrollId].duration))
    const scrollPlan: ScheduledAction[] = []
    let lastScrollCommand = -Infinity
    const timedEventsByIndex = new Map<number, ScheduledAction>()
    const wellPlan: ScheduledAction[] = evaluateManaWells(buildOrder).map(({ item, index, blocked, blockedReason }) => {
        const action: ScheduledAction = { item, cost: { gold: 0, wood: 0 }, blocked, blockedReason,
            commandTime: item.commandTime, startTime: blocked ? null : item.commandTime,
            finishTime: blocked ? null : item.commandTime, workerReturnTime: null, workerId: null }
        timedEventsByIndex.set(index, action)
        return action
    })
    until = Math.max(until, ...wellPlan.map(action => action.commandTime!))
    until = Math.min(MAX_PLAN_SECONDS, until)
    const initial = catalog.find(item => item.name === initialTownHall)!
    const namesById = new Map([...catalog, ...buildOrder].map(item => [item.id, item.name]))
    const buildings = [newBuilding(initial)]
    const workerCompletions: number[] = []
    const saturation = Math.max(
        1,
        Math.ceil(
            (2 * economy.goldTravelTime + economy.goldGatherTime) /
                Math.max(0.001, economy.goldGatherTime),
        ),
    )

    const advanceTo = (time: number) => {
        workerCompletions.sort((a, b) => a - b)
        while (Math.min(workerCompletions[0] ?? Infinity, pendingScrolls[0]?.item.commandTime ?? Infinity, pendingResources[0]?.item.commandTime ?? Infinity, pendingLosses[0]?.item.commandTime ?? Infinity) <= time) {
            const eventTime = Math.min(workerCompletions[0] ?? Infinity, pendingScrolls[0]?.item.commandTime ?? Infinity, pendingResources[0]?.item.commandTime ?? Infinity, pendingLosses[0]?.item.commandTime ?? Infinity)
            simulation.advanceTo(eventTime)
            while (workerCompletions[0] === eventTime) {
                workerCompletions.shift()
                const goldCount = simulation.workers.filter(({ assignment }) => assignment === "gold").length
                simulation.addWorker(goldCount < saturation ? "gold" : "wood")
            }
            while (pendingLosses[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingLosses.shift()!
                const target = catalog.find(unit => unit.id === item.unitId)!
                const isWorker = target.id === workerItem.id
                const instance = unitInstances.find(unit => unit.item.id === target.id && !unit.lost && unit.readyAt <= eventTime)
                const worker = isWorker ? simulation.selectLossWorker() : undefined
                const blocked = !instance || (isWorker && !worker)
                if (!blocked) {
                    instance!.lost = true
                    if (worker) simulation.loseWorker(worker.id)
                }
                const action: ScheduledAction = { item, cost: { gold: 0, wood: 0 }, blocked,
                    commandTime: eventTime, startTime: blocked ? null : eventTime, finishTime: blocked ? null : eventTime,
                    workerReturnTime: null, workerId: blocked ? null : worker?.id ?? null,
                    foodReleased: blocked ? 0 : target.food,
                    ...(blocked ? { blockedReason: isWorker && instance
                        ? `Lose unit: no available ${target.name}; workers assigned to construction cannot be lost.`
                        : `Lose unit requires a living ${target.name} at this timestamp (recruitment must be complete).` } : {}) }
                lossPlan.push(action)
                timedEventsByIndex.set(index, action)
            }
            while (pendingResources[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingResources.shift()!
                simulation.deliveries.push({ time: eventTime, gold: item.resourceGold, wood: item.resourceWood, worker: -1 })
                timedEventsByIndex.set(index, { item, cost: { gold: 0, wood: 0 }, blocked: false,
                    commandTime: eventTime, startTime: eventTime, finishTime: eventTime,
                    workerReturnTime: null, workerId: null })
            }
            while (pendingScrolls[0]?.item.commandTime === eventTime) {
                const { item, index } = pendingScrolls.shift()!
                const scroll = SCROLLS[item.scrollId]
                const availableMana = manaAt(economy, [...plan, ...scrollPlan, ...wellPlan], eventTime).mana
                const readyMana = manaAt(economy, [...plan, ...scrollPlan, ...wellPlan], Math.max(0, eventTime - economy.orderDelay)).mana
                const cooldownUntil = lastScrollCommand + scrollCooldown(economy) + economy.orderDelay
                const cooldownBlocked = eventTime < cooldownUntil
                const manaBlocked = availableMana + 1e-9 < scroll.manaCost
                const orderDelayBlocked = eventTime < economy.orderDelay || readyMana + 1e-9 < scroll.manaCost
                const startTime = eventTime + scroll.startDelay
                const finishTime = startTime + scroll.duration
                const horizonBlocked = finishTime > MAX_PLAN_SECONDS
                const blocked = cooldownBlocked || manaBlocked || orderDelayBlocked || horizonBlocked
                scrollPlan.push({ item, cost: { gold: 0, wood: 0 }, commandTime: eventTime,
                    startTime: blocked ? null : startTime, finishTime: blocked ? null : finishTime,
                    workerReturnTime: null, workerId: null, manaCost: scroll.manaCost, blocked,
                    ...(blocked ? { blockedReason: horizonBlocked
                        ? "Scroll effect would exceed the 30:00 plan limit"
                        : cooldownBlocked
                        ? `Scroll cooldown: next scroll can be used at ${cooldownUntil} seconds`
                        : manaBlocked ? `Insufficient mana for ${scroll.name}: requires ${scroll.manaCost}, available ${availableMana.toFixed(1)}`
                        : `Scroll order delay: ${scroll.manaCost} mana must be available for ${economy.orderDelay} seconds before the command` } : {}),
                })
                timedEventsByIndex.set(index, scrollPlan[scrollPlan.length - 1])
                if (!blocked) {
                    lastScrollCommand = eventTime
                    simulation.scheduleScroll(item.scrollId, startTime, finishTime)
                }
            }
        }
        simulation.advanceTo(time)
        completeUpgrades(buildings, time)
    }

    advanceTo(economy.orderDelay)

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

    for (const item of buildOrder) {
        if (isTimedEvent(item)) continue
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
        const dependencyProblem = missingEarlierRequirement
            ? `Requires ${missingEarlierRequirement.count} × ${namesById.get(missingEarlierRequirement.item) ?? missingEarlierRequirement.item}${missingEarlierRequirement.minLevel ? ` at level ${missingEarlierRequirement.minLevel} or higher` : ""}`
            : item.kind === "upgrade" && !eventualProducer
                ? `Requires an available ${item.producer} to upgrade`
                : needsProducer && !eventualProducer
                    ? `Requires ${item.producer} earlier in the build order`
                    : missingEarlierName ? `Requires ${missingEarlierName} earlier in the build order` : null
        if (dependencyProblem) blockedReason = dependencyProblem
        while (!dependencyProblem && simulation.time <= until) {
            advanceTo(simulation.time)
            const time = simulation.time
            const unlockedBuildings = unlockedBuildingsAt(time)
            const maxCountReached = item.maxCount !== undefined && unitInstances.filter(unit => unit.item.id === item.id && !unit.lost).length >= item.maxCount
            if (maxCountReached && !pendingLosses.some(loss => loss.item.unitId === item.id)) {
                blockedReason = `${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`
                break
            }
            const requiredAltarLevel = item.kind === "hero"
                ? heroAltarLevel(unitInstances.filter(unit => !unit.lost).map(unit => unit.item)) : 1
            const completed = plan.filter(({ finishTime }) => finishTime !== null && finishTime <= time)
            const completedNames = new Set([initialTownHall, ...completed.filter(action => action.finishTime! + economy.orderDelay <= time).map(({ item }) => item.name)])
            const matching = buildings.filter(building => item.kind === "upgrade"
                ? (item.upgradeFrom ? building.itemId === item.upgradeFrom : building.name === item.producer) && !building.upgrade
                : item.producerBuildingId ? building.buildingId === item.producerBuildingId : building.name === item.producer)
            const producer = matching.find(building => building.readyAt + economy.orderDelay <= time && building.availableAt <= time && !building.upgrade)
            const heroTierUnlocked = item.kind !== "hero" || requirementCount(unlockedBuildings,
                { item: item.producerBuildingId!, count: 1, minLevel: requiredAltarLevel }, time) >= 1
            const builder = requiresConstructionWorker(item) ? simulation.selectBuilder() : undefined
            const state = resourceAt(economy, simulation.deliveries, spending, time)
            const foodUsed = foodUsedAt([...plan, ...lossPlan], initialFoodUsed, time)
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
            if (
                (!needsProducer || producer) &&
                (!requiresConstructionWorker(item) || builder) &&
                item.prerequisites.every((name) => completedNames.has(name)) &&
                !missingRequirement && withinLimit && heroTierUnlocked && !maxCountReached &&
                state.gold >= cost.gold &&
                state.wood >= cost.wood &&
                (!isRecruitable(item) || foodUsed + item.food <= foodLimit)
            ) {
                const startTime = time + (requiresConstructionWorker(item) ? economy.constructionStartDelay : 0)
                const duration = actionDuration(item, economy)
                const finishTime = startTime + duration
                const workerReturnTime = builder ? finishTime + economy.constructionStartDelay : null
                if ((workerReturnTime ?? finishTime) > MAX_PLAN_SECONDS) {
                    blockedReason = "Action would exceed the 30:00 plan limit"
                    break
                }
                plan.push({
                    item,
                    cost,
                    blocked: false,
                    commandTime: time,
                    startTime,
                    finishTime,
                    workerReturnTime,
                    workerId: builder?.id ?? null,
                    buildingInstanceId: producer ? buildings.indexOf(producer) : item.kind === "building" ? buildings.length : undefined,
                })
                if (isRecruitable(item)) unitInstances.push({ item, readyAt: finishTime, lost: false })
                spending.push({ time, gold: -cost.gold, wood: -cost.wood })
                if (builder) {
                    simulation.construct(builder, duration)
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
                    pendingScrolls[0]?.item.commandTime ?? Infinity,
                    pendingResources[0]?.item.commandTime ?? Infinity,
                    pendingLosses[0]?.item.commandTime ?? Infinity,
                    ...workerCompletions,
                    ...buildings.map(({ availableAt }) => availableAt),
                    ...plan.flatMap(({ finishTime }) => (finishTime === null ? [] : [finishTime])),
                    ...plan.flatMap(({ finishTime }) => (finishTime === null ? [] : [finishTime + economy.orderDelay])),
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
    advanceTo(
        Math.min(MAX_PLAN_SECONDS, Math.max(
            until,
            simulation.time,
            ...plan.map(({ finishTime, workerReturnTime }) => workerReturnTime ?? finishTime ?? 0),
        )),
    )
    // Preserve source row identity for existing consumers; orderedPlan is the chronological view.
    const catalogPlan = [...plan]
    const inputPlan = buildOrder.map((item, index) => isTimedEvent(item)
        ? timedEventsByIndex.get(index)!
        : catalogPlan.shift()!)
    const orderedPlan = inputPlan.map((action, index) => ({ action, index }))
        .sort((a, b) => (a.action.commandTime ?? Infinity) - (b.action.commandTime ?? Infinity) || a.index - b.index)
        .map(({ action }) => action)
    return { plan: inputPlan, orderedPlan, deliveries: simulation.deliveries }
}
