import { validateActionCount, validateCommandTime } from "./plannerLimits"
import { unitLossCommand } from "./unitLosses"
import { manaWellCommand } from "./manaWells"
import { resourceCommand } from "./resourceEvents"
import { FILE_VERSION, GAME_RULES_VERSION, parseBuildOrder } from "./buildOrderFile"
import { initialOpeningAction, type GameProfile, type OpeningAction } from "./gameProfile"
import type { FactionId, PlannerItem } from "./gameData"
import type { FactionProfiles } from "./profileStorage"
import { isScrollAction, scrollCommand } from "./scrolls"

export type BuildDraft = { opening: OpeningAction; items: PlannerItem[] }
export type FactionDrafts = Record<FactionId, BuildDraft>
export const draftStorageKey = (faction: FactionId) => `wl-build-draft-v2-${faction}`

type LoadedDraft = BuildDraft & { gameProfile: GameProfile }

function loadDraft(faction: FactionId, profile: GameProfile): LoadedDraft {
    try {
        const text = window.localStorage.getItem(draftStorageKey(faction))
        if (text) {
            const stored = JSON.parse(text)
            const result = parseBuildOrder(JSON.stringify(Array.isArray(stored) ? {
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profile, buildOrder: stored,
            } : stored))
            if (result.faction !== faction) throw new Error("Draft faction mismatch")
            return { opening: result.opening, items: result.buildOrder, gameProfile: result.gameProfile }
        }
        const legacyText = window.localStorage.getItem(`wl-resource-profile-v1-${faction}`)
        if (legacyText) {
            const legacy = JSON.parse(legacyText)
            const result = parseBuildOrder(JSON.stringify({
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profile,
                buildOrder: [{ type: "allocate-workers", goldWorkers: legacy.map.goldWorkers }],
            }))
            return { opening: result.opening, items: [], gameProfile: profile }
        }
    } catch {
        // A damaged draft or unavailable storage must not prevent using the planner.
    }
    return { opening: { ...initialOpeningAction }, items: [], gameProfile: profile }
}

export function loadFactionDrafts(profiles: FactionProfiles): Record<FactionId, LoadedDraft> {
    return { light: loadDraft("light", profiles.light), dark: loadDraft("dark", profiles.dark) }
}

export function saveFactionDrafts(drafts: FactionDrafts, profiles: FactionProfiles, factions: FactionId[] = ["light", "dark"]): void {
    for (const faction of factions) {
        try {
            const draft = drafts[faction]
            validateActionCount(draft.items.length)
            for (const item of draft.items) {
                if ("commandTime" in item) validateCommandTime(item.commandTime)
            }
            const buildOrder = [
                draft.opening, ...draft.items.map(item => isScrollAction(item) ? scrollCommand(item) : item.kind === "resource" ? resourceCommand(item) : item.kind === "mana-well" ? manaWellCommand(item) : item.kind === "unit-loss" ? unitLossCommand(item) : ({ itemId: item.id })),
            ]
            const document = {
                format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
                faction, gameProfile: profiles[faction], buildOrder,
            }
            parseBuildOrder(JSON.stringify(document))
            window.localStorage.setItem(draftStorageKey(faction), JSON.stringify(document))
        } catch {
            // Keep editing in memory when browser storage is unavailable or full.
        }
    }
}

const activeFactionKey = "wl-active-faction"
export function loadActiveFaction(): FactionId {
    try { return window.localStorage.getItem(activeFactionKey) === "dark" ? "dark" : "light" } catch { return "light" }
}
export function saveActiveFaction(faction: FactionId): void {
    try { window.localStorage.setItem(activeFactionKey, faction) } catch { /* Keep switching in memory. */ }
}
