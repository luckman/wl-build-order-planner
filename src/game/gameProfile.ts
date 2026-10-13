import type { EconomySettings } from "./resourceSimulation"
import { initialPlayerLevels, yieldsFromLevels, type PlayerBuildingLevels } from "./playerLevels"

export type GameProfile = {
    basic: { goldGatherTime: number; woodGatherTime: number; initialGoldTravelReduction: number; manaPerMinute: number; timeBetweenScrolls: number }
    map: {
        goldTravelTime: number; woodTravelTime: number;
        sawmillWoodTravelTime: number
    }
    player: PlayerBuildingLevels & {
        startingGold: number; startingWood: number; baseFoodLimit: number; startingMana: number; baseManaLimit: number; scrollLevel: number
    }
    delays: { constructionStartDelay: number; orderDelay: number }
}

export const initialGameProfile: GameProfile = {
    basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1, manaPerMinute: 10, timeBetweenScrolls: 10 },
    map: { goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5 },
    player: { startingGold: 150, startingWood: 50, baseFoodLimit: 20, startingMana: 35, baseManaLimit: 50, scrollLevel: 1, ...initialPlayerLevels },
    delays: { constructionStartDelay: 4, orderDelay: 1 },
}

export type OpeningAction = { type: "allocate-workers"; goldWorkers: number }
export const STARTING_WORKER_COUNT = 5
export const initialOpeningAction: OpeningAction = { type: "allocate-workers", goldWorkers: 4 }

/** Combine starting conditions with the build's opening assignment for the worker simulator. */
export function economyFromProfile(profile: GameProfile, opening: OpeningAction = initialOpeningAction): EconomySettings {
    const { baseFoodLimit, ...resources } = profile.player
    const goldWorkers = Math.min(STARTING_WORKER_COUNT, opening.goldWorkers)
    return {
        ...profile.basic, ...profile.map, ...resources, ...profile.delays,
        ...yieldsFromLevels(profile.player),
        workerCount: STARTING_WORKER_COUNT, goldWorkers, woodWorkers: STARTING_WORKER_COUNT - goldWorkers,
    }
}
