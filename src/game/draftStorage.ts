import { FILE_VERSION, GAME_RULES_VERSION, parseBuildOrder } from "./buildOrderFile"
import { initialOpeningAction, type GameProfile, type OpeningAction } from "./gameProfile"
import type { FactionId, PlannerItem } from "./gameData"
import type { FactionProfiles } from "./profileStorage"

export type BuildDraft = { opening: OpeningAction; items: PlannerItem[] }
export type FactionDrafts = Record<FactionId, BuildDraft>
export const draftStorageKey = (faction: FactionId) => `wl-build-draft-v2-${faction}`

function loadDraft(faction: FactionId, profile: GameProfile): BuildDraft {
    try {
        const text = window.localStorage.getItem(draftStorageKey(faction))
        if (text) {
            const result = parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profile, buildOrder: JSON.parse(text),
            }))
            return { opening: result.opening, items: result.buildOrder }
        }
        const legacyText = window.localStorage.getItem(`wl-resource-profile-v1-${faction}`)
        if (legacyText) {
            const legacy = JSON.parse(legacyText)
            const result = parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profile,
                buildOrder: [{ type: "allocate-workers", goldWorkers: legacy.map.goldWorkers }],
            }))
            return { opening: result.opening, items: [] }
        }
    } catch {
        // A damaged draft or unavailable storage must not prevent using the planner.
    }
    return { opening: { ...initialOpeningAction }, items: [] }
}

export function loadFactionDrafts(profiles: FactionProfiles): FactionDrafts {
    return { light: loadDraft("light", profiles.light), dark: loadDraft("dark", profiles.dark) }
}

export function saveFactionDrafts(drafts: FactionDrafts): void {
    for (const faction of ["light", "dark"] as const) {
        try {
            const draft = drafts[faction]
            window.localStorage.setItem(draftStorageKey(faction), JSON.stringify([
                draft.opening, ...draft.items.map(item => ({ itemId: item.id })),
            ]))
        } catch {
            // Keep editing in memory when browser storage is unavailable or full.
        }
    }
}
