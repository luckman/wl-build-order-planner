import type { EconomySettings } from "./resourceSimulation"
import { initialPlayerLevels, yieldsFromLevels, type PlayerBuildingLevels } from "./playerLevels"

export type GameProfile = {
    basic: { goldGatherTime: number; woodGatherTime: number; initialGoldTravelReduction: number }
    map: {
        goldTravelTime: number; woodTravelTime: number;
        sawmillWoodTravelTime: number; goldWorkers: number; woodWorkers: number
    }
    player: PlayerBuildingLevels & {
        startingGold: number; startingWood: number; baseFoodLimit: number
    }
    delays: { constructionStartDelay: number; orderDelay: number }
}

export const initialGameProfile: GameProfile = {
    basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1 },
    map: { goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5, goldWorkers: 4, woodWorkers: 1 },
    player: { startingGold: 150, startingWood: 50, baseFoodLimit: 20, ...initialPlayerLevels },
    delays: { constructionStartDelay: 4, orderDelay: 1 },
}

/** Project the persisted profile into the worker simulator's settings; worker totals are derived. */
export function economyFromProfile(profile: GameProfile): EconomySettings {
    const { baseFoodLimit, ...resources } = profile.player
    return {
        ...profile.basic, ...profile.map, ...resources, ...profile.delays,
        ...yieldsFromLevels(profile.player),
        workerCount: profile.map.goldWorkers + profile.map.woodWorkers,
    }
}
