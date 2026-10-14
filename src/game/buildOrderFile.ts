import { createUnitLossAction, unitLossCommand, type UnitLossCommand } from "./unitLosses"
import { createManaWellAction, manaWellCommand, type ManaWellCommand } from "./manaWells"
import { createResourceAction, resourceCommand, type AddResourcesCommand } from "./resourceEvents"
import { factions, type FactionId, type PlannerItem } from "./gameData"
import { STARTING_WORKER_COUNT, initialGameProfile, initialOpeningAction, type OpeningAction, type GameProfile } from "./gameProfile"
export type { GameProfile } from "./gameProfile"
import { type ScheduledAction } from "./buildSimulation"
import { playerLevelFields, playerLevelTier } from "./playerLevels"
import { createScrollAction, isScrollAction, scrollCommand, type ScrollCommand } from "./scrolls"

export const FILE_VERSION = 2
// Bump when catalog values or simulation rules change; historical rules are not retained.
export const GAME_RULES_VERSION = "2026-10-14.6"
export const MAX_FILE_BYTES = 1024 * 1024
export type BuildOrderDocument = {
    format: "wl-build-order"
    version: number
    gameRulesVersion: string
    faction: FactionId
    gameProfile: GameProfile
    buildOrder: Array<OpeningAction | ((ScrollCommand | AddResourcesCommand | ManaWellCommand | UnitLossCommand | {
        itemId: string
    }) & {
        timings?: Pick<ScheduledAction, "commandTime" | "startTime" | "finishTime" | "workerReturnTime">
    })>
}

export function serializeBuildOrder(faction: FactionId, gameProfile: GameProfile, actions: ScheduledAction[], includeTimings = false,
    opening: OpeningAction = initialOpeningAction) {
    const document: BuildOrderDocument = {
        format: "wl-build-order", version: FILE_VERSION, gameRulesVersion: GAME_RULES_VERSION,
        faction, gameProfile,
        buildOrder: [opening, ...actions.map(({ item, commandTime, startTime, finishTime, workerReturnTime }) => ({
            ...(isScrollAction(item) ? scrollCommand(item) : item.kind === "resource" ? resourceCommand(item) : item.kind === "mana-well" ? manaWellCommand(item) : item.kind === "unit-loss" ? unitLossCommand(item) : { itemId: item.id }),
            ...(includeTimings ? { timings: { commandTime, startTime, finishTime, workerReturnTime } } : {}),
        }))],
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
    faction: FactionId; buildOrder: PlannerItem[]; opening: OpeningAction; gameProfile: GameProfile; warning: string | null
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
        basic: ["goldGatherTime", "woodGatherTime", "initialGoldTravelReduction", "manaPerMinute", "timeBetweenScrolls"],
        map: ["goldTravelTime", "woodTravelTime", "sawmillWoodTravelTime"],
        player: ["startingGold", "startingWood", "baseFoodLimit", "startingMana", "baseManaLimit", "scrollLevel",
            "manaAccumulation", "manaFromManaWells", "scrollCooldownReduction",
            "goldMiningTimeReduction", "woodMiningTimeReduction", ...playerLevelFields],
        delays: ["constructionStartDelay", "orderDelay"],
    }
    const parsed: Record<string, Record<string, number>> = {}
    for (const block of Object.keys(fields) as Array<keyof GameProfile>) {
        const raw = object(profile[block], `gameProfile.${block}`)
        parsed[block] = {}
        for (const key of fields[block]) {
            // Default fields added after the initial profile schema, retaining older settings.
            const optionalField = ["startingMana", "baseManaLimit", "manaPerMinute", "manaTowerLevel", "timeBetweenScrolls", "scrollLevel",
                "manaAccumulation", "manaFromManaWells", "scrollCooldownReduction",
                "goldMiningTimeReduction", "woodMiningTimeReduction"].includes(key)
            const value = key === "manaAccumulation" && !(key in raw) ? parsed.basic.manaPerMinute :
                optionalField && !(key in raw) ? initialGameProfile[block][key as keyof typeof initialGameProfile[typeof block]] : raw[key]
            parsed[block][key] = number(value, `gameProfile.${block}.${key}`,
                key === "goldGatherTime" || key === "woodGatherTime")
            if (key === "scrollCooldownReduction" && parsed[block][key] > 100) {
                throw new Error("gameProfile.player.scrollCooldownReduction must be from 0 to 100 percent.")
            }
            if (key === "goldMiningTimeReduction" || key === "woodMiningTimeReduction") {
                const maximum = key === "goldMiningTimeReduction" ? 1 : 5
                if (parsed[block][key] > maximum) {
                    throw new Error(`gameProfile.player.${key} must be from 0 to ${maximum.toFixed(1)} seconds.`)
                }
            }
            if (key === "scrollLevel" && (!Number.isInteger(parsed[block][key]) || parsed[block][key] < 1 || parsed[block][key] > 6)) {
                throw new Error("gameProfile.player.scrollLevel must be an integer from 1 to 6.")
            }
            if (block === "player" && playerLevelFields.some(field => field === key)) {
                try { playerLevelTier(parsed[block][key]) } catch {
                    throw new Error(`gameProfile.player.${key} must be an integer from 1 to 24.`)
                }
            }
        }
    }
    const gameProfile = parsed as unknown as GameProfile
    if (gameProfile.player.baseManaLimit < gameProfile.player.startingMana) {
        throw new Error("gameProfile.player.baseManaLimit (base mana capacity) must be greater than or equal to startingMana (starting mana).")
    }
    if (!Array.isArray(doc.buildOrder) || doc.buildOrder.length < 1 || doc.buildOrder.length > 1001) throw new Error("buildOrder must start with a worker allocation and contain at most 1,000 subsequent actions.")
    const first = object(doc.buildOrder[0], "Opening action")
    if (first.type !== "allocate-workers") throw new Error("The first action must allocate starting workers.")
    const goldWorkers = number(first.goldWorkers, "Opening action.goldWorkers", false, true)
    if (goldWorkers > STARTING_WORKER_COUNT) throw new Error("The opening allocation exceeds the starting worker count of five.")
    const opening: OpeningAction = { type: "allocate-workers", goldWorkers }
    const faction = doc.faction
    const catalog = new Map(factions[faction].items.map(item => [item.id, item]))
    const buildOrder = doc.buildOrder.slice(1).map((entry: unknown, index: number) => {
        const action = object(entry, `Action ${index + 1}`)
        if (action.type === "lose-unit") {
            if (typeof action.unitId !== "string") throw new Error(`Action ${index + 1}.unitId must identify a unit.`)
            return createUnitLossAction({ type: "lose-unit", unitId: action.unitId,
                commandTime: number(action.commandTime, `Action ${index + 1}.commandTime`) }, faction)
        }
        if (action.type === "capture-mana-well" || action.type === "lose-mana-well") {
            return createManaWellAction({ type: action.type,
                commandTime: number(action.commandTime, `Action ${index + 1}.commandTime`) })
        }
        if (action.type === "add-resources") {
            return createResourceAction({ type: "add-resources",
                commandTime: number(action.commandTime, `Action ${index + 1}.commandTime`),
                gold: number(action.gold, `Action ${index + 1}.gold`),
                wood: number(action.wood, `Action ${index + 1}.wood`) })
        }
        if (action.type === "use-scroll") {
            if (action.scrollId !== "gold-rush" && action.scrollId !== "lumber-gathering") throw new Error(`Action ${index + 1}: unknown scroll ID ${String(action.scrollId)}.`)
            return createScrollAction({ type: "use-scroll", scrollId: action.scrollId,
                commandTime: number(action.commandTime, `Action ${index + 1}.commandTime`) }, faction)
        }
        if ("type" in action) throw new Error("Worker allocation is only allowed as the opening action.")
        const item = typeof action.itemId === "string" ? catalog.get(action.itemId) : undefined
        if (!item) throw new Error(`Action ${index + 1}: unknown item ID ${String(action.itemId)} for ${doc.faction}.`)
        return item
    })
    return {
        faction: doc.faction, buildOrder, opening, gameProfile,
        warning: doc.gameRulesVersion === GAME_RULES_VERSION ? null :
            "This build order was exported with different game rules. It has been recalculated using the current rules, so timings and action availability may differ.",
    }
}
