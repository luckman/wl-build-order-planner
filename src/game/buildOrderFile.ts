import { factions, type FactionId, type PlannerItem } from "./gameData"
import { type GameProfile } from "./gameProfile"
export type { GameProfile } from "./gameProfile"
import { type ScheduledAction } from "./buildSimulation"

export const FILE_VERSION = 1
// Bump when catalog values or simulation rules change; historical rules are not retained.
export const GAME_RULES_VERSION = "2026-10-09.1"
export const MAX_FILE_BYTES = 1024 * 1024
export type BuildOrderDocument = {
    format: "wl-build-order"
    version: number
    gameRulesVersion: string
    faction: FactionId
    gameProfile: GameProfile
    buildOrder: Array<{
        itemId: string
        timings?: Pick<ScheduledAction, "commandTime" | "startTime" | "finishTime" | "workerReturnTime">
    }>
}

export function serializeBuildOrder(faction: FactionId, gameProfile: GameProfile, actions: ScheduledAction[], includeTimings = false) {
    const document: BuildOrderDocument = {
        format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
        faction, gameProfile,
        buildOrder: actions.map(({ item, commandTime, startTime, finishTime, workerReturnTime }) => ({
            itemId: item.id,
            ...(includeTimings ? { timings: { commandTime, startTime, finishTime, workerReturnTime } } : {}),
        })),
    }
    return JSON.stringify(document, null, 2)
}

function object(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} must be an object.`)
    return value as Record<string, unknown>
}
function number(value: unknown, path: string, positive = false, integer = false): number {
    if (typeof value !== "number" || !Number.isFinite(value) || (positive ? value <= 0 : value < 0) ||
        (integer && !Number.isSafeInteger(value))) {
        throw new Error(`${path} must be a ${positive ? "positive" : "non-negative"}${integer ? " integer" : " number"}.`)
    }
    return value
}

/** Transport-independent parsing for files and future shareable links. Timings are never read. */
export function parseBuildOrder(text: string): {
    faction: FactionId; buildOrder: PlannerItem[]; gameProfile: GameProfile; warning: string | null
} {
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error("The file is not valid JSON.") }
    const doc = object(value, "Build order")
    if (doc.format !== "wl-build-order") throw new Error("Choose a WL build-order JSON file.")
    if (doc.version !== FILE_VERSION) throw new Error(`Unsupported JSON format version: ${String(doc.version)}.`)
    if (doc.faction !== "light" && doc.faction !== "dark") throw new Error("Faction must be light or dark.")
    if (typeof doc.gameRulesVersion !== "string" || !doc.gameRulesVersion.trim()) throw new Error("Missing gameRulesVersion.")
    const profile = object(doc.gameProfile, "gameProfile")
    const fields: { [Block in keyof GameProfile]: Array<keyof GameProfile[Block]> } = {
        basic: ["goldGatherTime", "woodGatherTime", "initialGoldTravelReduction"],
        map: ["goldTravelTime", "woodTravelTime", "sawmillWoodTravelTime", "goldWorkers", "woodWorkers"],
        player: ["startingGold", "startingWood", "goldPerTrip", "woodPerTrip", "baseFoodLimit", "foodPerFarm"],
        delays: ["constructionStartDelay", "initialOrderDelay"],
    }
    const parsed: Record<string, Record<string, number>> = {}
    for (const block of Object.keys(fields) as Array<keyof GameProfile>) {
        const raw = object(profile[block], `gameProfile.${block}`)
        parsed[block] = {}
        for (const key of fields[block]) {
            parsed[block][key] = number(raw[key], `gameProfile.${block}.${key}`,
                key === "goldGatherTime" || key === "woodGatherTime", key === "goldWorkers" || key === "woodWorkers")
        }
    }
    const gameProfile = parsed as unknown as GameProfile
    if (gameProfile.map.goldWorkers + gameProfile.map.woodWorkers > 1000) throw new Error("A profile can contain at most 1,000 starting workers.")
    if (!Array.isArray(doc.buildOrder) || doc.buildOrder.length > 1000) throw new Error("buildOrder must be an array of at most 1,000 actions.")
    const catalog = new Map(factions[doc.faction].items.map(item => [item.id, item]))
    const buildOrder = doc.buildOrder.map((entry: unknown, index: number) => {
        const action = object(entry, `Action ${index + 1}`)
        const item = typeof action.itemId === "string" ? catalog.get(action.itemId) : undefined
        if (!item) throw new Error(`Action ${index + 1}: unknown item ID ${String(action.itemId)} for ${doc.faction}.`)
        return item
    })
    return {
        faction: doc.faction, buildOrder, gameProfile,
        warning: doc.gameRulesVersion === GAME_RULES_VERSION ? null :
            "This build order was exported with different game rules. It has been recalculated using the current rules, so timings and action availability may differ.",
    }
}
