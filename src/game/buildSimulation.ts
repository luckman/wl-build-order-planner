import { factions, isRecruitable, itemCost, type PlannerItem } from "./gameData"
import { buildingLimit, completeUpgrades, newBuilding, requirementCount } from "./buildingRules"
import { INITIAL_COMMAND_DELAY, type EconomySettings, resourceAt, WorkerEconomy } from "./resourceSimulation"

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
            (economy.goldOutboundTravel + economy.goldGatherTime + economy.goldReturnTravel) /
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

    advanceTo(INITIAL_COMMAND_DELAY)

    for (const item of buildOrder) {
        const cost = itemCost(item, plan.map((action) => action.item), initialTownHall)
        const needsProducer = item.kind !== "building"
        let scheduled = false
        let blockedReason = "Waiting for resources, food, producer, or worker"
        while (simulation.time <= until) {
            advanceTo(simulation.time)
            const time = simulation.time
            if (item.maxCount !== undefined && plan.filter(action => !action.blocked && action.item.id === item.id).length >= item.maxCount) {
                blockedReason = `${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`
                break
            }
            const completed = plan.filter(({ finishTime }) => finishTime !== null && finishTime <= time)
            const completedNames = new Set([initialTownHall, ...completed.map(({ item }) => item.name)])
            const matching = buildings.filter(building => item.kind === "upgrade"
                ? (item.upgradeFrom ? building.itemId === item.upgradeFrom : building.name === item.producer) && !building.upgrade
                : item.producerBuildingId ? building.buildingId === item.producerBuildingId : building.name === item.producer)
            const producer = matching.find(building => building.readyAt <= time && building.availableAt <= time && !building.upgrade)
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
                requirementCount(buildings, requirement, time) < requirement.count)
            const withinLimit = item.kind !== "building" || buildings.filter(building =>
                building.buildingId === (item.buildingId ?? item.id)).length < buildingLimit(item, buildings, time)
            blockedReason = item.kind === "upgrade" && !matching.length
                ? `Requires an available ${item.producer} to upgrade`
                : missingRequirement
                    ? `Requires ${missingRequirement.count} × ${namesById.get(missingRequirement.item) ?? missingRequirement.item}${missingRequirement.minLevel ? ` at level ${missingRequirement.minLevel} or higher` : ""}`
                    : !withinLimit ? `${item.name} limit reached at the current town-hall level`
                    : "Waiting for resources, food, producer, or worker"
            if (
                (!needsProducer || producer) &&
                (!requiresConstructionWorker(item) || builder) &&
                item.prerequisites.every((name) => completedNames.has(name)) &&
                !missingRequirement && withinLimit &&
                state.gold >= cost.gold &&
                state.wood >= cost.wood &&
                (!isRecruitable(item) || foodUsed + item.food <= foodLimit)
            ) {
                const startTime = time + (requiresConstructionWorker(item) ? economy.constructionStartDelay : 0)
                const finishTime = startTime + item.seconds
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
                    simulation.construct(builder, item.seconds)
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
