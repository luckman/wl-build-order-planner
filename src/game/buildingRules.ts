import type { ItemRequirement, PlannerItem } from "./gameData"

export type BuildingInstance = {
    itemId: string
    buildingId: string
    level: number
    name: string
    readyAt: number
    availableAt: number
    upgrade?: { item: PlannerItem; finishTime: number }
}

export function newBuilding(item: PlannerItem, readyAt = 0): BuildingInstance {
    return {
        itemId: item.id, buildingId: item.buildingId ?? item.id, level: item.level ?? 1,
        name: item.name, readyAt, availableAt: readyAt,
    }
}

export function completeUpgrades(buildings: BuildingInstance[], time: number) {
    for (const building of buildings) {
        if (building.upgrade && building.upgrade.finishTime <= time) {
            building.itemId = building.upgrade.item.id
            building.level = building.upgrade.item.level ?? building.level + 1
            building.name = building.upgrade.item.name
            building.upgrade = undefined
        }
    }
}

export function requirementCount(buildings: BuildingInstance[], requirement: ItemRequirement, time = Infinity) {
    return buildings.filter(building => building.readyAt <= time &&
        building.buildingId === requirement.item && building.level >= (requirement.minLevel ?? 1)).length
}

export function buildingLimit(item: PlannerItem, buildings: BuildingInstance[], time = Infinity) {
    if (!item.limit) return Infinity
    const highest = Math.max(0, ...buildings.filter(building => building.buildingId === item.limit!.basedOn &&
        building.readyAt <= time).map(building => building.level))
    return [...item.limit.byHighestLevel].sort((a, b) => b.minLevel - a.minLevel)
        .find(entry => entry.minLevel <= highest)?.max ?? 0
}

export function plannedBuildings(items: PlannerItem[], initial: PlannerItem) {
    const buildings = [newBuilding(initial)]
    for (const item of items) {
        if (item.kind === "building") buildings.push(newBuilding(item))
        if (item.kind === "upgrade") {
            const source = buildings.find(building => building.itemId === item.upgradeFrom)
            if (source) Object.assign(source, newBuilding(item))
        }
    }
    return buildings
}
