import type { PlannerItem } from "./gameData"
import { type EconomySettings, resourceAt, WorkerEconomy } from "./resourceSimulation"

export type ScheduledAction = {
    item: PlannerItem
    blocked: boolean
    commandTime: number | null
    startTime: number | null
    finishTime: number | null
    workerReturnTime: number | null
    workerId: number | null
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
    const producers = [{ name: initialTownHall, availableAt: 0 }]
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
    }

    for (const item of buildOrder) {
        const needsProducer = item.kind !== "building"
        const matching = producers.filter(({ name }) => name === item.producer)
        let scheduled = false
        while (simulation.time <= until) {
            advanceTo(simulation.time)
            const time = simulation.time
            const completed = plan.filter(({ finishTime }) => finishTime !== null && finishTime <= time)
            const completedNames = new Set([initialTownHall, ...completed.map(({ item }) => item.name)])
            const producer = matching.find(({ availableAt }) => availableAt <= time)
            const builder = item.kind === "building" ? simulation.selectBuilder() : undefined
            const state = resourceAt(economy, simulation.deliveries, spending, time)
            const foodUsed =
                initialFoodUsed +
                plan.reduce(
                    (sum, action) => sum + (!action.blocked && action.item.kind === "unit" ? action.item.food : 0),
                    0,
                )
            const foodLimit =
                baseFoodLimit +
                completed.filter(({ item }) => item.id === "farm" || item.id === "pigsty").length * foodPerFarm
            if (
                (!needsProducer || producer) &&
                (item.kind !== "building" || builder) &&
                item.prerequisites.every((name) => completedNames.has(name)) &&
                state.gold >= item.gold &&
                state.wood >= item.wood &&
                (item.kind !== "unit" || foodUsed + item.food <= foodLimit)
            ) {
                const startTime = time + (item.kind === "building" ? economy.constructionStartDelay : 0)
                const finishTime = startTime + item.seconds
                const workerReturnTime = builder ? finishTime + economy.constructionStartDelay : null
                plan.push({
                    item,
                    blocked: false,
                    commandTime: time,
                    startTime,
                    finishTime,
                    workerReturnTime,
                    workerId: builder?.id ?? null,
                })
                spending.push({ time, gold: -item.gold, wood: -item.wood })
                if (builder) {
                    simulation.construct(builder, item.seconds)
                }
                if (producer) {
                    producer.availableAt = finishTime
                }
                if (item.kind === "building") {
                    producers.push({ name: item.name, availableAt: finishTime })
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
                    ...matching.map(({ availableAt }) => availableAt),
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
                blocked: true,
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
