import { FILE_VERSION, GAME_RULES_VERSION, parseBuildOrder } from "./buildOrderFile"
import type { FactionId } from "./gameData"
import { initialGameProfile, type GameProfile } from "./gameProfile"

export type FactionProfiles = Record<FactionId, GameProfile>
export const profileStorageKey = (faction: FactionId) => `wl-resource-profile-v2-${faction}`

function loadProfile(faction: FactionId): GameProfile {
    try {
        const text = window.localStorage.getItem(profileStorageKey(faction))
        if (text) {
            // Reuse import validation for every profile field, including hidden settings.
            return parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: JSON.parse(text), buildOrder: [{ type: "allocate-workers", goldWorkers: 0 }],
            })).gameProfile
        }
        const legacyText = window.localStorage.getItem(`wl-resource-profile-v1-${faction}`)
        if (legacyText) {
            const legacy = JSON.parse(legacyText)
            const { goldWorkers, woodWorkers, ...map } = legacy.map
            return parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: { ...legacy, map },
                buildOrder: [{ type: "allocate-workers", goldWorkers }],
            })).gameProfile
        }
    } catch {
        // Invalid data or unavailable storage must not prevent using the planner.
    }
    return {
        basic: { ...initialGameProfile.basic }, map: { ...initialGameProfile.map },
        player: { ...initialGameProfile.player }, delays: { ...initialGameProfile.delays },
    }
}

export function loadFactionProfiles(): FactionProfiles {
    return { light: loadProfile("light"), dark: loadProfile("dark") }
}

export function saveFactionProfiles(profiles: FactionProfiles): void {
    for (const faction of ["light", "dark"] as const) {
        try {
            parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profiles[faction], buildOrder: [{ type: "allocate-workers", goldWorkers: 0 }],
            }))
            window.localStorage.setItem(profileStorageKey(faction), JSON.stringify(profiles[faction]))
        } catch {
            // Keep edits working in React state if browser storage is unavailable or full.
        }
    }
}
