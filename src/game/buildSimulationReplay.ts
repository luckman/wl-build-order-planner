import type { PlannerItem } from "./gameData"
import type { PreparationSchedule } from "./preparationScheduling"
import { isTimedEvent } from "./resourcesCollected"

type ReplayRow = { index: number; key: string }
export type ReplayOrder = ReturnType<typeof replayOrder>

export function replayOrder(items: PlannerItem[]) {
    const catalog: ReplayRow[] = []
    const fixed: Array<ReplayRow & { time: number }> = []
    const catalogPositions = new Map<number, number>()
    for (const [index, item] of items.entries()) {
        const key = JSON.stringify(item)
        if (isTimedEvent(item) && "commandTime" in item) {
            fixed.push({ index, key, time: item.commandTime })
        } else {
            catalogPositions.set(index, catalog.length)
            catalog.push({ index, key })
        }
    }
    fixed.sort((a, b) => a.time - b.time || a.index - b.index)
    return { catalog, fixed, catalogPositions }
}

function commonPrefix(previous: ReplayRow[], current: ReplayRow[]) {
    const mismatch = previous.findIndex((row, position) => row.key !== current[position]?.key)
    return mismatch < 0 ? previous.length : mismatch
}

export function replayBoundary(previous: ReplayOrder, current: ReplayOrder) {
    const catalogCount = commonPrefix(previous.catalog, current.catalog)
    const fixedCount = commonPrefix(previous.fixed, current.fixed)
    // Include both the removed and the inserted effect. A checkpoint at the
    // boundary itself may have applied events before a same-time catalog row.
    const fixedTime = Math.min(previous.fixed[fixedCount]?.time ?? Infinity, current.fixed[fixedCount]?.time ?? Infinity)
    const rowMap = new Map<number, number>()
    for (const [before, after, count] of [
        [previous.catalog, current.catalog, catalogCount],
        [previous.fixed, current.fixed, fixedCount],
    ] as const) {
        for (let position = 0; position < count; position++) {
            rowMap.set(before[position].index, after[position].index)
        }
    }
    return { catalogCount, fixedTime, rowMap }
}

export function replayPreparation(items: PlannerItem[], order: ReplayOrder, schedule?: PreparationSchedule) {
    const commands = [...(schedule?.commands ?? [])].filter(([index]) => !schedule?.blocked.has(index)).map(([index, command]) => ({
        position: order.catalogPositions.get(index)!,
        command,
        departure: command - items[index].construction!.preparationDuration!,
    })).sort((a, b) => a.position - b.position)
    const blocked = [...(schedule?.blocked.keys() ?? [])].map(index => order.catalogPositions.get(index)!)
    return (count: number, time: number) => {
        // A reservation can already have changed the economy for a row that
        // the catalog scheduler has yet to reach.
        let requiredCatalogCount = count
        let key = ""
        for (const { position, command, departure } of commands) {
            if (position >= count && departure > time) continue
            requiredCatalogCount = Math.max(requiredCatalogCount, position + 1)
            key += `${position}:${command},`
        }
        for (const position of blocked) {
            if (position < count) key += `blocked:${position},`
        }
        return { key, requiredCatalogCount }
    }
}

type ReplayPreparation = ReturnType<typeof replayPreparation>
type ReplayPoint<T> = {
    count: number
    time: number
    collecting: boolean
    preparationKey: string
    requiredCatalogCount: number
    weight: number
    state: T
}

// Bound both the number of distinct preparation trials and the cumulative
// size of their copied histories. Snapshots are never mutated by a replay.
const MAX_CHECKPOINTS = 128
const MAX_HISTORY_ENTRIES = 50000
export class ReplayHistory<T> {
    private points = new Map<string, ReplayPoint<T>>()
    private weight = 0

    find(preparation: ReplayPreparation, collecting: boolean, catalogCount: number, fixedTime: number, afterCount = 0) {
        let best: ReplayPoint<T> | undefined
        for (const point of this.points.values()) {
            if (point.collecting !== collecting || point.count <= (best?.count ?? afterCount) ||
                point.requiredCatalogCount > catalogCount || point.time >= fixedTime) continue
            if (preparation(point.count, point.time).key === point.preparationKey) best = point
        }
        return best
    }

    capture(count: number, time: number, collecting: boolean, preparation: ReplayPreparation, weight: number, copy: () => T) {
        if (weight > MAX_HISTORY_ENTRIES) return
        const { key: preparationKey, requiredCatalogCount } = preparation(count, time)
        const key = `${count}|${time}|${collecting}|${preparationKey}`
        if (this.points.has(key)) return
        while (this.points.size >= MAX_CHECKPOINTS || this.weight + weight > MAX_HISTORY_ENTRIES) {
            const oldest = this.points.keys().next().value!
            this.weight -= this.points.get(oldest)!.weight
            this.points.delete(oldest)
        }
        this.points.set(key, { count, time, collecting, preparationKey, requiredCatalogCount, weight, state: copy() })
        this.weight += weight
    }
}
