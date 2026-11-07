import type { PlannerItem } from "./gameData"
import { validatePlanTime } from "./plannerLimits"

export const constructionTimeModifiers = [0, 50, 100] as const
export type ConstructionTimeModifier = typeof constructionTimeModifiers[number]
export type ConstructionSettings = {
    timeModifier?: ConstructionTimeModifier
    preparationDuration?: number
    useIdleWorker?: boolean
    outwardDuration?: number
    returnDuration?: number
}
export function isConstruction(item: PlannerItem) { return item.kind === "building" || item.kind === "upgrade" }
export function canModifyConstructionTime(item: PlannerItem) {
    return item.kind === "building" && item.id !== "castle" && item.id !== "citadel"
}
export function parseConstructionTimeModifier(value: unknown, eligible: boolean): ConstructionTimeModifier | undefined {
    if (value === undefined) return undefined
    const modifier = constructionTimeModifiers.find(percent => percent === value)
    if (modifier === undefined) throw new Error("Construction time modifier must be 0, 50, or 100 percent.")
    if (modifier !== 0 && !eligible) {
        throw new Error("Construction time modifier is only available for buildings other than Castle and Citadel.")
    }
    return modifier
}
export function parseConstructionSettings(item: PlannerItem, value: unknown): ConstructionSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Construction settings must be an object.")
    const raw = value as Record<string, unknown>
    const settings: ConstructionSettings = {}
    const modifier = parseConstructionTimeModifier(raw.timeModifier, canModifyConstructionTime(item))
    if (modifier !== undefined) settings.timeModifier = modifier
    for (const field of ["preparationDuration", "outwardDuration", "returnDuration"] as const) {
        if (raw[field] !== undefined) {
            if (typeof raw[field] !== "number") throw new Error(`${field} must be a finite nonnegative duration.`)
            validatePlanTime(raw[field] as number, field)
            settings[field] = raw[field] as number
        }
    }
    if (raw.useIdleWorker !== undefined) {
        if (typeof raw.useIdleWorker !== "boolean") throw new Error("useIdleWorker must be boolean.")
        settings.useIdleWorker = raw.useIdleWorker
    }
    return settings
}
export function constructionCommand(item: PlannerItem) {
    return { itemId: item.id, ...(isConstruction(item) && item.construction ? { construction: parseConstructionSettings(item, item.construction) } : {}) }
}
export function hasCustomConstruction(item: PlannerItem) {
    const settings = item.construction
    return isConstruction(item) && (!!settings?.timeModifier || (settings?.preparationDuration ?? 0) > 0 ||
        settings?.useIdleWorker || settings?.outwardDuration !== undefined || settings?.returnDuration !== undefined)
}
export function constructionDescription(item: PlannerItem, globalDelay: number) {
    if (!isConstruction(item)) return ""
    const settings = item.construction
    const travel = (label: string, override?: number) => `${label}: ${override ?? globalDelay}s (${override === undefined ? "global" : "override"})`
    return `Preparation: ${settings?.preparationDuration ?? 0}s · ${settings?.useIdleWorker ? "Idle worker" : "Gathering worker"} · ${travel("Outward", settings?.outwardDuration)} · ${settings?.useIdleWorker ? "Worker idle at completion (no return travel)" : travel("Return", settings?.returnDuration)}`
}
