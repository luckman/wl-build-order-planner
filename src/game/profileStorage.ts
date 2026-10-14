import { FILE_VERSION, parseGameProfile } from "./buildOrderFile"
import type { FactionId } from "./gameData"
import { initialGameProfile, type GameProfile } from "./gameProfile"

export type FactionProfiles = Record<FactionId, GameProfile>
export const profileStorageKey = (faction: FactionId) => `wl-resource-profile-v2-${faction}`

const PROFILE_STORAGE_FORMAT = "wl-personal-profile"

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
}

function storedProfile(faction: FactionId, gameProfile: GameProfile) {
    // The profile payload shares the public JSON schema version, not its framing
    // or rules revision. Any future schema migration must handle both formats.
    return { format: PROFILE_STORAGE_FORMAT, version: FILE_VERSION, faction, gameProfile }
}

function validateStoredPayload(value: unknown): GameProfile {
    // Unlike public imports, a saved profile must contain recognizable settings.
    if (!record(value) || !Object.keys(initialGameProfile).some(block =>
        record(value[block]) && Object.keys(initialGameProfile[block as keyof GameProfile]).some(key => key in (value[block] as Record<string, unknown>)))) {
        throw new Error("Missing saved profile settings")
    }
    return parseGameProfile(value)
}

export function loadSavedProfile(faction: FactionId): GameProfile | null {
    try {
        const text = window.localStorage.getItem(profileStorageKey(faction))
        if (text === null) return null
        const value: unknown = JSON.parse(text)
        if (!record(value)) return null
        // Envelope-like objects must never enter the raw-profile legacy path.
        if (["format", "version", "faction", "gameProfile"].some(key => key in value)) {
            if (value.format !== PROFILE_STORAGE_FORMAT || value.version !== FILE_VERSION || value.faction !== faction) return null
            return validateStoredPayload(value.gameProfile)
        }
        const profile = validateStoredPayload(value)
        // Raw entries had no faction metadata; the faction-specific key identifies
        // them. Failed migration writes still leave the validated profile usable.
        try { window.localStorage.setItem(profileStorageKey(faction), JSON.stringify(storedProfile(faction, profile))) } catch { /* Retry on a later read. */ }
        return profile
    } catch {
        // Invalid data or unavailable storage must not prevent using the planner.
        return null
    }
}

export function loadFactionProfiles(): FactionProfiles {
    return { light: loadSavedProfile("light") ?? initialGameProfile, dark: loadSavedProfile("dark") ?? initialGameProfile }
}

export function saveProfile(faction: FactionId, profile: GameProfile): void {
    const parsed = validateStoredPayload(profile)
    window.localStorage.setItem(profileStorageKey(faction), JSON.stringify(storedProfile(faction, parsed)))
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
