import rawData from "./data.json"
import { buildingLimit, newBuilding, plannedBuildings, requirementCount } from "./buildingRules"

export type FactionId = "light" | "dark"
export type ItemKind = "building" | "unit" | "hero" | "upgrade"
export function isRecruitable(item: { kind: ItemKind | "scroll" }) {
    return item.kind === "unit" || item.kind === "hero"
}
export type BuildingType = "Economic" | "Production" | "Racial" | "Defensive"
/** Queued heroes reserve the next recruitment tier across all Altars. */
export function heroAltarLevel(previousItems: PlannerItem[]) {
    return 1 + previousItems.filter(item => item.kind === "hero").length
}
export type ItemRequirement = { item: string; count: number; minLevel?: number }
export type BuildingLimit = {
    basedOn: string
    byHighestLevel: Array<{ minLevel: number; max: number }>
}
export type IconId =
    | "lightGoldRush"
    | "lightCastle"
    | "lightSawmill"
    | "lightFarm"
    | "lightBarracks"
    | "lightFactory"
    | "lightSanctuary"
    | "lightShipyard"
    | "lightDwarvenForge"
    | "lightHumanMonument"
    | "lightElvenTree"
    | "lightAltarOfHeroes"
    | "lightTowerOfLightMagic"
    | "lightCrossbowTower"
    | "lightArtilleryTower"
    | "lightTowerOfMana"
    | "lightWorker"
    | "lightSwordsman"
    | "lightWarsmith"
    | "lightArcher"
    | "lightKnight"
    | "lightCopter"
    | "lightHealer"
    | "lightGuardsman"
    | "lightBallista"
    | "lightFoxRider"
    | "lightWindMage"
    | "lightBiker"
    | "lightSniper"
    | "lightSloop"
    | "lightCaravel"
    | "lightGilbert"
    | "lightBerin"
    | "lightMiriel"
    | "darkCitadel"
    | "darkSawmill"
    | "darkPigsty"
    | "darkBarracks"
    | "darkWorkshop"
    | "darkDarkGate"
    | "darkShipyard"
    | "darkGoblinLab"
    | "darkTotemOfOrcs"
    | "darkUndeadObelisk"
    | "darkAltarOfHeroes"
    | "darkTowerOfDarkMagic"
    | "darkSlingshotTower"
    | "darkNapalmTower"
    | "darkTowerOfMana"
    | "darkSlave"
    | "darkGoon"
    | "darkSkeletonArcher"
    | "darkBomber"
    | "darkWargRider"
    | "darkAeronaut"
    | "darkNecromancer"
    | "darkAxeMaster"
    | "darkCatapult"
    | "darkZombie"
    | "darkVenomspitter"
    | "darkDrill"
    | "darkRocketeer"
    | "darkSchooner"
    | "darkGalleon"
    | "darkGrokk"
    | "darkJax"
    | "darkEater"

type RawItem = {
    id: string
    name: string
    kind: ItemKind
    type?: BuildingType
    cost: { gold: number; wood: number; food: number }
    seconds: number
    requires?: ItemRequirement[]
    limit?: BuildingLimit
    maxCount?: number
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
    type?: BuildingType
    gold: number
    wood: number
    food: number
    seconds: number
    producer: string
    prerequisites: string[]
    requirements?: ItemRequirement[]
    limit?: BuildingLimit
    maxCount?: number
    icon: IconId
    buildingId?: string
    level?: number
    upgradeFrom?: string
    producerBuildingId?: string
} & ({ kind: ItemKind } | { kind: "scroll"; scrollId: "gold-rush"; commandTime: number })

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
    const byId = new Map(rawFaction.items.map(item => [item.id, item]))
    const sourceById = new Map(rawFaction.items.flatMap(item => (item.upgrades ?? []).map(id => [id, item.id] as const)))
    const buildingInfo = (id: string, visiting = new Set<string>()): { buildingId: string; level: number } => {
        if (visiting.has(id)) throw new Error(`Circular upgrade chain: ${id}`)
        visiting.add(id)
        const item = byId.get(id)
        if (!item) throw new Error(`Unknown building: ${id}`)
        if (item.kind === "building") return { buildingId: id, level: 1 }
        const source = sourceById.get(id)
        if (!source) throw new Error(`Missing upgrade source: ${id}`)
        const previous = buildingInfo(source, visiting)
        return { buildingId: previous.buildingId, level: previous.level + 1 }
    }
    for (const item of rawFaction.items) {
        if (item.maxCount !== undefined && (!Number.isInteger(item.maxCount) || item.maxCount < 1)) {
            throw new Error(`Invalid maximum count for ${item.id}`)
        }
        for (const requirement of item.requires ?? []) {
            if (!byId.has(requirement.item) || !Number.isInteger(requirement.count) || requirement.count < 1 ||
                (requirement.minLevel !== undefined && (!Number.isInteger(requirement.minLevel) || requirement.minLevel < 1))) {
                throw new Error(`Invalid prerequisite for ${item.id}`)
            }
        }
        if (item.limit && (!byId.has(item.limit.basedOn) || item.limit.byHighestLevel.some(entry =>
            !Number.isInteger(entry.minLevel) || entry.minLevel < 1 || !Number.isInteger(entry.max) || entry.max < 0))) {
            throw new Error(`Invalid building limit for ${item.id}`)
        }
    }
    return {
        id: rawFaction.id,
        name: rawFaction.name,
        workerName: rawFaction.workerName,
        startingTownHall: rawFaction.startingTownHall,
        items: rawFaction.items.map((item) => ({
            ...(!isRecruitable(item) ? buildingInfo(item.id) : {}),
            upgradeFrom: sourceById.get(item.id),
            producerBuildingId: isRecruitable(item)
                ? buildingInfo(rawFaction.items.find(source => source.produces?.includes(item.id))!.id).buildingId
                : undefined,
            id: item.id,
            name: item.name,
            kind: item.kind,
            type: item.type,
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
                const requiredId = requirement.minLevel && requirement.minLevel > 1
                    ? rawFaction.items.find(candidate => !isRecruitable(candidate) &&
                        buildingInfo(candidate.id).buildingId === requirement.item &&
                        buildingInfo(candidate.id).level === requirement.minLevel)?.id
                    : requirement.item
                const name = requiredId ? namesById.get(requiredId) : undefined
                if (!name) throw new Error(`Unknown prerequisite ${requiredId} for ${item.id}`)
                return name
            }),
            requirements: item.requires ?? [],
            limit: item.limit,
            maxCount: item.maxCount,
            icon: item.icon,
        })),
    }
}

export const factions = Object.fromEntries(
    (rawData.factions as RawFaction[]).map((faction) => [faction.id, createFaction(faction)]),
) as Record<FactionId, Faction>

/** Each earlier order reserves a copy, even before construction starts. */
export function itemCost(item: PlannerItem, previousItems: PlannerItem[], initialTownHall: string) {
    const scales = item.kind === "building" && (item.type === "Production" || item.type === "Racial")
    const multiplier = scales
        ? 2 ** (
          Number(item.name === initialTownHall) +
          previousItems.filter((previous) => previous.kind === "building" && previous.id === item.id).length)
        : 1
    return { gold: item.gold * multiplier, wood: item.wood * multiplier }
}

export function buildOrderWithDependencies(
    faction: Faction,
    buildOrder: PlannerItem[],
    selectedItem: PlannerItem,
): PlannerItem[] {
    const byId = new Map(faction.items.map(item => [item.id, item]))
    const initial = faction.items.find(item => item.name === faction.startingTownHall)!
    const buildings = plannedBuildings(buildOrder, initial)
    const result = [...buildOrder]
    const visiting = new Set<string>()

    const ensureRequirement = (requirement: ItemRequirement) => {
        while (requirementCount(buildings, requirement) < requirement.count) {
            const base = byId.get(requirement.item)
            if (!base) throw new Error(`Unknown prerequisite ${requirement.item}`)
            const lower = buildings.find(building => building.buildingId === requirement.item &&
                building.level < (requirement.minLevel ?? 1))
            if (lower) {
                const next = faction.items.find(item => item.upgradeFrom === lower.itemId)
                if (!next) throw new Error(`No upgrade available for ${lower.name}`)
                add(next)
            } else {
                add(base)
            }
        }
    }

    const add = (item: PlannerItem) => {
        if (item.maxCount !== undefined && result.filter(previous => previous.id === item.id).length >= item.maxCount) {
            throw new Error(`${item.name} limit reached (maximum ${item.maxCount}, including queued recruitment)`)
        }
        if (visiting.has(item.id)) throw new Error(`Circular prerequisite or building limit for ${item.name}`)
        visiting.add(item.id)
        if (item.kind === "upgrade" && !buildings.some(building => building.itemId === item.upgradeFrom)) {
            const source = byId.get(item.upgradeFrom!)
            if (!source) throw new Error(`Missing upgrade source for ${item.name}`)
            // Do not silently buy another building for a duplicate upgrade.
            if (!buildings.some(building => building.buildingId === item.buildingId && building.level < (item.level ?? 1))) {
                throw new Error(`Requires another ${source.name}`)
            }
            add(source)
        }
        for (const requirement of item.requirements ?? []) ensureRequirement(requirement)
        if (item.kind === "hero") {
            ensureRequirement({ item: item.producerBuildingId!, count: 1, minLevel: heroAltarLevel(result) })
        }
        if (item.kind === "building" && item.limit) {
            const count = buildings.filter(building => building.buildingId === (item.buildingId ?? item.id)).length
            if (count >= buildingLimit(item, buildings)) {
                const threshold = [...item.limit.byHighestLevel].sort((a, b) => a.minLevel - b.minLevel)
                    .find(entry => entry.max > count)
                if (!threshold) throw new Error(`${item.name} limit reached`)
                ensureRequirement({ item: item.limit.basedOn, count: 1, minLevel: threshold.minLevel })
            }
        }
        if (item.kind === "building") buildings.push(newBuilding(item))
        if (item.kind === "upgrade") {
            const source = buildings.find(building => building.itemId === item.upgradeFrom)
            if (!source) throw new Error(`Requires another ${byId.get(item.upgradeFrom!)?.name}`)
            Object.assign(source, newBuilding(item))
        }
        result.push(item)
        visiting.delete(item.id)
    }
    add(selectedItem)
    return result
}
