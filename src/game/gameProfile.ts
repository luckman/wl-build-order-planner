import type { EconomySettings } from "./resourceSimulation"

export type GameProfile = {
    basic: { goldGatherTime: number; woodGatherTime: number; initialGoldTravelReduction: number }
    map: {
        goldTravelTime: number; woodTravelTime: number;
        sawmillWoodTravelTime: number; goldWorkers: number; woodWorkers: number
    }
    player: {
        startingGold: number; startingWood: number; goldPerTrip: number; woodPerTrip: number;
        baseFoodLimit: number; foodPerFarm: number
    }
    delays: { constructionStartDelay: number; initialOrderDelay: number }
}

export const initialGameProfile: GameProfile = {
    basic: { goldGatherTime: 3.1, woodGatherTime: 12.1, initialGoldTravelReduction: 1 },
    map: { goldTravelTime: 4, woodTravelTime: 4, sawmillWoodTravelTime: 0.5, goldWorkers: 4, woodWorkers: 1 },
    player: { startingGold: 150, startingWood: 50, goldPerTrip: 50, woodPerTrip: 50, baseFoodLimit: 20, foodPerFarm: 20 },
    delays: { constructionStartDelay: 4, initialOrderDelay: 1 },
}

/** Project the persisted profile into the worker simulator's settings; worker totals are derived. */
export function economyFromProfile(profile: GameProfile): EconomySettings {
    const { baseFoodLimit, foodPerFarm, ...resources } = profile.player
    return {
        ...profile.basic, ...profile.map, ...resources, ...profile.delays,
        workerCount: profile.map.goldWorkers + profile.map.woodWorkers,
    }
}
