import { FILE_VERSION, GAME_RULES_VERSION, parseBuildOrder } from "./buildOrderFile"
import type { FactionId } from "./gameData"
import { initialGameProfile, type GameProfile } from "./gameProfile"

export type FactionProfiles = Record<FactionId, GameProfile>
export const profileStorageKey = (faction: FactionId) => `wl-resource-profile-v2-${faction}`

export function loadSavedProfile(faction: FactionId): GameProfile | null {
    try {
        const text = window.localStorage.getItem(profileStorageKey(faction))
        if (text) {
            // Reuse import validation for every profile field, including hidden settings.
            return parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: JSON.parse(text), buildOrder: [{ type: "allocate-workers", goldWorkers: 0 }],
            })).gameProfile
        }
    } catch {
        // Invalid data or unavailable storage must not prevent using the planner.
    }
    return null
}

export function loadFactionProfiles(): FactionProfiles {
    return { light: loadSavedProfile("light") ?? initialGameProfile, dark: loadSavedProfile("dark") ?? initialGameProfile }
}

export function saveProfile(faction: FactionId, profile: GameProfile): void {
    const parsed = parseBuildOrder(JSON.stringify({
        format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
        faction, gameProfile: profile, buildOrder: [{ type: "allocate-workers", goldWorkers: 0 }],
    }))
    window.localStorage.setItem(profileStorageKey(faction), JSON.stringify(parsed.gameProfile))
}

export function saveFactionProfiles(profiles: FactionProfiles): void {
    for (const faction of ["light", "dark"] as const) {
        try {
            saveProfile(faction, profiles[faction])
        } catch {
            // Keep edits working in React state if browser storage is unavailable or full.
        }
    }
}
