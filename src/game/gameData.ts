import rawData from "./data.json"

export type FactionId = "light" | "dark"
export type ItemKind = "building" | "unit" | "upgrade"
export type IconId =
    | "lightCastle"
    | "lightSawmill"
    | "lightFarm"
    | "lightBarracks"
    | "lightWorker"
    | "lightSwordsman"
    | "lightWarsmith"
    | "lightArcher"
    | "darkCitadel"
    | "darkSawmill"
    | "darkPigsty"
    | "darkBarracks"
    | "darkSlave"
    | "darkGoon"
    | "darkSkeletonArcher"
    | "darkBomber"

type RawItem = {
    id: string
    name: string
    kind: ItemKind
    cost: { gold: number; wood: number; food: number }
    seconds: number
    requires?: string[]
    produces?: string[]
    upgrades?: string[]
    icon: IconId
}

type RawFaction = {
    id: FactionId
    name: string
    workerName: string
    startingTownHall: string
    items: RawItem[]
}

export type PlannerItem = {
    id: string
    name: string
    kind: ItemKind
    gold: number
    wood: number
    food: number
    seconds: number
    producer: string
    prerequisites: string[]
    icon: IconId
}

export type Faction = {
    id: FactionId
    name: string
    workerName: string
    startingTownHall: string
    items: PlannerItem[]
}

function producerByItemId(items: RawItem[]) {
    const producers = new Map<string, string>()
    for (const item of items) {
        for (const producedId of [...(item.produces ?? []), ...(item.upgrades ?? [])]) {
            if (producers.has(producedId)) throw new Error(`Multiple producers configured for ${producedId}`)
            producers.set(producedId, item.name)
        }
    }
    return producers
}

function createFaction(rawFaction: RawFaction): Faction {
    const namesById = new Map(rawFaction.items.map((item) => [item.id, item.name]))
    const producers = producerByItemId(rawFaction.items)
    return {
        id: rawFaction.id,
        name: rawFaction.name,
        workerName: rawFaction.workerName,
        startingTownHall: rawFaction.startingTownHall,
        items: rawFaction.items.map((item) => ({
            id: item.id,
            name: item.name,
            kind: item.kind,
            gold: item.cost.gold,
            wood: item.cost.wood,
            food: item.cost.food,
            seconds: item.seconds,
            producer:
                item.kind === "building"
                    ? rawFaction.workerName
                    : (() => {
                          const producer = producers.get(item.id)
                          if (!producer) throw new Error(`No producer configured for ${item.id}`)
                          return producer
                      })(),
            prerequisites: (item.requires ?? []).map((requirement) => {
                const name = namesById.get(requirement)
                if (!name) throw new Error(`Unknown prerequisite ${requirement} for ${item.id}`)
                return name
            }),
            icon: item.icon,
        })),
    }
}

export const factions = Object.fromEntries(
    (rawData.factions as RawFaction[]).map((faction) => [faction.id, createFaction(faction)]),
) as Record<FactionId, Faction>

export function buildOrderWithDependencies(
    faction: Faction,
    buildOrder: PlannerItem[],
    selectedItem: PlannerItem,
): PlannerItem[] {
    const itemsByName = new Map(faction.items.map((item) => [item.name, item]))
    const availableNames = new Set([...buildOrder.map((item) => item.name), faction.startingTownHall])
    const visitingNames = new Set<string>()
    const dependencies: PlannerItem[] = []

    const addDependencies = (item: PlannerItem) => {
        if (visitingNames.has(item.name)) throw new Error(`Circular prerequisite for ${item.name}`)
        visitingNames.add(item.name)
        for (const prerequisiteName of item.prerequisites) {
            if (availableNames.has(prerequisiteName)) continue
            const prerequisite = itemsByName.get(prerequisiteName)
            if (!prerequisite) throw new Error(`Unknown prerequisite ${prerequisiteName} for ${item.name}`)
            addDependencies(prerequisite)
            availableNames.add(prerequisite.name)
            dependencies.push(prerequisite)
        }
        visitingNames.delete(item.name)
    }

    addDependencies(selectedItem)
    return [...buildOrder, ...dependencies, selectedItem]
}
