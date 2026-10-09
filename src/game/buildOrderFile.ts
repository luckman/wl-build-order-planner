import { factions, type FactionId, type PlannerItem } from "./gameData"
import { type EconomySettings } from "./resourceSimulation"
import { type ScheduledAction } from "./buildSimulation"

export const FILE_VERSION = 1
// Bump when catalog values or simulation rules change; historical rules are not retained.
export const GAME_RULES_VERSION = "2026-10-09.1"
export const MAX_FILE_BYTES = 1024 * 1024
export type GameProfile = {
    economy: Omit<EconomySettings, "workerCount">
    baseFoodLimit: number
    foodPerFarm: number
}
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
    faction: FactionId; buildOrder: PlannerItem[]; economy: EconomySettings;
    baseFoodLimit: number; foodPerFarm: number; warning: string | null
} {
    let value: unknown
    try { value = JSON.parse(text) } catch { throw new Error("The file is not valid JSON.") }
    const doc = object(value, "Build order")
    if (doc.format !== "wl-build-order") throw new Error("Choose a WL build-order JSON file.")
    if (doc.version !== FILE_VERSION) throw new Error(`Unsupported JSON format version: ${String(doc.version)}.`)
    if (doc.faction !== "light" && doc.faction !== "dark") throw new Error("Faction must be light or dark.")
    if (typeof doc.gameRulesVersion !== "string" || !doc.gameRulesVersion.trim()) throw new Error("Missing gameRulesVersion.")
    const profile = object(doc.gameProfile, "gameProfile")
    const raw = object(profile.economy, "gameProfile.economy")
    const economy = {} as EconomySettings
    const keys: Array<keyof Omit<EconomySettings, "workerCount">> = [
        "startingGold", "startingWood", "goldWorkers", "woodWorkers", "goldPerTrip", "woodPerTrip",
        "goldOutboundTravel", "goldReturnTravel", "goldGatherTime", "woodOutboundTravel",
        "woodReturnTravel", "woodGatherTime", "constructionStartDelay",
    ]
    for (const key of keys) economy[key] = number(raw[key], `gameProfile.economy.${key}`,
        key === "goldGatherTime" || key === "woodGatherTime", key === "goldWorkers" || key === "woodWorkers")
    economy.workerCount = economy.goldWorkers + economy.woodWorkers
    if (economy.workerCount > 1000) throw new Error("A profile can contain at most 1,000 starting workers.")
    const baseFoodLimit = number(profile.baseFoodLimit, "gameProfile.baseFoodLimit")
    const foodPerFarm = number(profile.foodPerFarm, "gameProfile.foodPerFarm")
    if (!Array.isArray(doc.buildOrder) || doc.buildOrder.length > 1000) throw new Error("buildOrder must be an array of at most 1,000 actions.")
    const catalog = new Map(factions[doc.faction].items.map(item => [item.id, item]))
    const buildOrder = doc.buildOrder.map((entry: unknown, index: number) => {
        const action = object(entry, `Action ${index + 1}`)
        const item = typeof action.itemId === "string" ? catalog.get(action.itemId) : undefined
        if (!item) throw new Error(`Action ${index + 1}: unknown item ID ${String(action.itemId)} for ${doc.faction}.`)
        return item
    })
    return {
        faction: doc.faction, buildOrder, economy, baseFoodLimit, foodPerFarm,
        warning: doc.gameRulesVersion === GAME_RULES_VERSION ? null :
            "This build order was exported with different game rules. It has been recalculated using the current rules, so timings and action availability may differ.",
    }
}
