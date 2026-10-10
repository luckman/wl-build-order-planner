import { factions, heroAltarLevel, isRecruitable, itemCost, type PlannerItem } from "./gameData"
import { buildingLimit, completeUpgrades, newBuilding, requirementCount } from "./buildingRules"
import { type EconomySettings, resourceAt, WorkerEconomy } from "./resourceSimulation"
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
    until = 600,
) {
    const simulation = new WorkerEconomy(economy)
    const plan: ScheduledAction[] = []
    const spending: Array<{ time: number; gold: number; wood: number }> = []
    const catalog = Object.values(factions).find(faction => faction.startingTownHall === initialTownHall)!.items
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
        while (workerCompletions.length && workerCompletions[0] <= time) {
            simulation.advanceTo(workerCompletions[0])
            workerCompletions.shift()
            const goldCount = simulation.workers.filter(({ assignment }) => assignment === "gold").length
            simulation.addWorker(goldCount < saturation ? "gold" : "wood")
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
        const cost = itemCost(item, plan.map((action) => action.item), initialTownHall)
        const needsProducer = item.kind !== "building"
        const requiredAltarLevel = item.kind === "hero"
            ? heroAltarLevel(plan.filter(action => !action.blocked).map(action => action.item)) : 1
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
            if (item.maxCount !== undefined && plan.filter(action => !action.blocked && action.item.id === item.id).length >= item.maxCount) {
                blockedReason = `${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`
                break
            }
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
            const foodUsed =
                initialFoodUsed +
                plan.reduce(
                    (sum, action) => sum + (!action.blocked && isRecruitable(action.item) ? action.item.food : 0),
                    0,
                )
            const foodLimit =
                baseFoodLimit +
                completed.filter(({ item }) => item.id === "farm" || item.id === "pigsty").length * foodPerFarm
            const missingRequirement = item.requirements?.find(requirement =>
                requirementCount(unlockedBuildings, requirement, time) < requirement.count)
            const withinLimit = item.kind !== "building" || buildings.filter(building =>
                building.buildingId === (item.buildingId ?? item.id)).length < buildingLimit(item, unlockedBuildings, time)
            blockedReason = item.kind === "upgrade" && !matching.length
                ? `Requires an available ${item.producer} to upgrade`
                : missingRequirement
                    ? `Requires ${missingRequirement.count} × ${namesById.get(missingRequirement.item) ?? missingRequirement.item}${missingRequirement.minLevel ? ` at level ${missingRequirement.minLevel} or higher` : ""}`
                    : !withinLimit ? `${item.name} limit reached at the current ${item.limit?.basedOn === initial.id
                        ? "town-hall" : namesById.get(item.limit?.basedOn ?? "") ?? "prerequisite"} level`
                    : !heroTierUnlocked
                        ? `Requires at least one ${item.producer} at level ${requiredAltarLevel} or higher for hero ${requiredAltarLevel}`
                    : "Waiting for resources, food, producer, or worker"
            if (
                (!needsProducer || producer) &&
                (!requiresConstructionWorker(item) || builder) &&
                item.prerequisites.every((name) => completedNames.has(name)) &&
                !missingRequirement && withinLimit && heroTierUnlocked &&
                state.gold >= cost.gold &&
                state.wood >= cost.wood &&
                (!isRecruitable(item) || foodUsed + item.food <= foodLimit)
            ) {
                const startTime = time + (requiresConstructionWorker(item) ? economy.constructionStartDelay : 0)
                const duration = actionDuration(item, economy)
                const finishTime = startTime + duration
                const workerReturnTime = builder ? finishTime + economy.constructionStartDelay : null
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
        Math.max(
            until,
            simulation.time,
            ...plan.map(({ finishTime, workerReturnTime }) => workerReturnTime ?? finishTime ?? 0),
        ),
    )
    return { plan, deliveries: simulation.deliveries }
}
