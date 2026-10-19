import type { ScheduledAction } from "./buildSimulation"
import { newBuilding } from "./buildingRules"
import type { PlannerItem } from "./gameData"
import { LEGIONS_CALL, isLegionsCallTarget } from "./scrolls"

export type RecruitmentWindow = { startTime: number; finishTime: number; buildingInstanceId: number }

export type ScrollTargetOption = { item: PlannerItem; current: boolean }

/** Each exact building level is available from completion until its next upgrade starts. */
export function legionsCallTargetWindows(plan: ScheduledAction[], initial: PlannerItem) {
    const windows = [{ item: initial, buildingInstanceId: 0, startTime: 0, finishTime: Infinity }]
    for (const action of plan) {
        if (!action.blocked && action.item.kind === "building" && action.finishTime !== null && action.buildingInstanceId !== undefined) {
            windows.push({ item: action.item, buildingInstanceId: action.buildingInstanceId, startTime: action.finishTime, finishTime: Infinity })
        }
    }
    for (const action of [...plan].sort((a, b) => (a.commandTime ?? Infinity) - (b.commandTime ?? Infinity))) {
        if (action.blocked || action.item.kind !== "upgrade" || action.finishTime === null) continue
        const previous = windows.find(window => window.buildingInstanceId === action.buildingInstanceId && window.finishTime === Infinity)
        if (!previous) continue
        previous.finishTime = action.commandTime!
        windows.push({ item: action.item, buildingInstanceId: action.buildingInstanceId!, startTime: action.finishTime, finishTime: Infinity })
    }
    return windows.filter(window => isLegionsCallTarget(window.item))
}

export function legionsCallTargetOptions(plan: ScheduledAction[], initial: PlannerItem): ScrollTargetOption[] {
    const options = new Map<string, ScrollTargetOption>()
    for (const window of legionsCallTargetWindows(plan, initial)) {
        const previous = options.get(window.item.id)
        options.set(window.item.id, { item: window.item, current: !!previous?.current || window.finishTime === Infinity })
    }
    return [...options.values()].sort((a, b) => Number(b.current) - Number(a.current))
}

/** Reconstruct exact building levels at command time, independently of simulation progress. */
export function productionBuildingsAt(plan: ScheduledAction[], initial: PlannerItem, catalog: PlannerItem[], time: number) {
    const buildings = [newBuilding(initial)]
    for (const action of plan) {
        if (action.blocked || action.buildingInstanceId === undefined) continue
        if (action.item.kind === "building") buildings[action.buildingInstanceId] = newBuilding(action.item, action.finishTime!)
    }
    for (const action of [...plan].sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity))) {
        if (action.blocked || action.item.kind !== "upgrade" || action.finishTime! > time) continue
        const building = buildings[action.buildingInstanceId!]
        if (building) Object.assign(building, { itemId: action.item.id, name: action.item.name, level: action.item.level ?? building.level + 1 })
    }
    return buildings.flatMap((building, buildingInstanceId) => {
        const item = catalog.find(item => item.id === building.itemId)!
        const upgrading = plan.some(action => !action.blocked && action.item.kind === "upgrade" &&
            action.buildingInstanceId === buildingInstanceId && action.commandTime! <= time && action.finishTime! > time)
        return building.readyAt <= time && isLegionsCallTarget(item) && !upgrading ? [{ item, buildingInstanceId }] : []
    })
}

/** Overlapping casts refresh duration: productivity is never multiplied twice. */
function intervals(windows: RecruitmentWindow[], buildingInstanceId: number) {
    const merged: Array<{ startTime: number; finishTime: number }> = []
    for (const window of windows.filter(window => window.buildingInstanceId === buildingInstanceId).sort((a, b) => a.startTime - b.startTime)) {
        const previous = merged[merged.length - 1]
        if (previous && window.startTime <= previous.finishTime) previous.finishTime = Math.max(previous.finishTime, window.finishTime)
        else merged.push({ startTime: window.startTime, finishTime: window.finishTime })
    }
    return merged
}

export function recruitmentWork(start: number, finish: number, buildingInstanceId: number, windows: RecruitmentWindow[], reduction: number = LEGIONS_CALL.recruitmentTimeReduction) {
    const productivity = 1 / (1 - reduction)
    return Math.max(0, finish - start) + intervals(windows, buildingInstanceId).reduce((bonus, window) =>
        bonus + Math.max(0, Math.min(finish, window.finishTime) - Math.max(start, window.startTime)) * (productivity - 1), 0)
}

export function recruitmentFinish(start: number, work: number, buildingInstanceId: number, windows: RecruitmentWindow[], reduction: number = LEGIONS_CALL.recruitmentTimeReduction) {
    const productivity = 1 / (1 - reduction)
    let time = start
    for (const window of intervals(windows, buildingInstanceId)) {
        if (window.finishTime <= time) continue
        const normal = Math.max(0, window.startTime - time)
        if (work <= normal) return time + work
        work -= normal
        time += normal
        const capacity = (window.finishTime - time) * productivity
        if (work <= capacity) return time + work / productivity
        work -= capacity
        time = window.finishTime
    }
    return time + work
}
