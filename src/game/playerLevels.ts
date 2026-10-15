import { isRecruitable, type PlannerItem } from "./gameData"

export const playerLevelFields = [
    "townHallLevel", "sawmillLevel", "farmLevel", "barracksLevel",
    "industrialBuildingLevel", "arcaneBuildingLevel", "workerLevel", "manaTowerLevel",
    "shipyardLevel", "altarOfHeroesLevel",
] as const
export type PlayerLevelField = typeof playerLevelFields[number]
export type PlayerBuildingLevels = Record<PlayerLevelField, number>

export const initialPlayerLevels: PlayerBuildingLevels = {
    townHallLevel: 1, sawmillLevel: 1, farmLevel: 1, barracksLevel: 1,
    industrialBuildingLevel: 1, arcaneBuildingLevel: 1, workerLevel: 1, manaTowerLevel: 1,
    shipyardLevel: 1, altarOfHeroesLevel: 1,
}

/** Player progression is separate from building upgrades performed during a match. */
export function playerLevelTier(level: number) {
    if (!Number.isInteger(level) || level < 1 || level > 24) {
        throw new Error("Player levels must be integers from 1 to 24.")
    }
    return Math.floor((level - 1) / 4)
}

export function yieldsFromLevels(levels: PlayerBuildingLevels) {
    return {
        goldPerTrip: 50 + playerLevelTier(levels.townHallLevel),
        woodPerTrip: 50 + playerLevelTier(levels.sawmillLevel),
        foodPerFarm: 20 + playerLevelTier(levels.farmLevel),
        manaPerTower: 50 + playerLevelTier(levels.manaTowerLevel),
    }
}

/** Production bonuses reduce recruitment duration independently of worker level. */
export function productionDuration(item: PlannerItem, levels: PlayerBuildingLevels) {
    if (!isRecruitable(item)) return item.seconds
    const producer = item.producerBuildingId ?? item.producer.toLowerCase().replace(/ /g, "-")
    let field: PlayerLevelField | undefined
    switch (producer) {
        case "castle": case "citadel": field = "townHallLevel"; break
        case "barracks": field = "barracksLevel"; break
        case "factory": case "workshop": field = "industrialBuildingLevel"; break
        case "sanctuary": case "dark-gate": field = "arcaneBuildingLevel"; break
        case "shipyard": field = "shipyardLevel"; break
        case "altar-of-heroes": field = "altarOfHeroesLevel"; break
    }
    return field ? item.seconds * (1 - (playerLevelTier(levels[field]) + 1) / 100) : item.seconds
}

/** Worker bonuses shorten construction/upgrades without changing either travel leg. */
export function actionDuration(item: PlannerItem, levels: PlayerBuildingLevels) {
    if (item.kind === "building" || item.kind === "upgrade") {
        return item.seconds * (1 - playerLevelTier(levels.workerLevel) / 100)
    }
    return productionDuration(item, levels)
}
