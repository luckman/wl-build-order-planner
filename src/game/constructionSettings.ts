import type { PlannerItem } from "./gameData"
import { validatePlanTime } from "./plannerLimits"

export type ConstructionSettings = { useIdleWorker?: boolean; outwardDuration?: number; returnDuration?: number }
export function isConstruction(item: PlannerItem) { return item.kind === "building" || item.kind === "upgrade" }
export function parseConstructionSettings(value: unknown): ConstructionSettings {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Construction settings must be an object.")
    const raw = value as Record<string, unknown>
    const settings: ConstructionSettings = {}
    for (const field of ["outwardDuration", "returnDuration"] as const) {
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
    return { itemId: item.id, ...(isConstruction(item) && item.construction ? { construction: parseConstructionSettings(item.construction) } : {}) }
}
export function hasCustomConstruction(item: PlannerItem) {
    return isConstruction(item) && (item.construction?.useIdleWorker || item.construction?.outwardDuration !== undefined || item.construction?.returnDuration !== undefined)
}
export function constructionDescription(item: PlannerItem, globalDelay: number) {
    if (!isConstruction(item)) return ""
    const settings = item.construction
    const travel = (label: string, override?: number) => `${label}: ${override ?? globalDelay}s (${override === undefined ? "global" : "override"})`
    return `${settings?.useIdleWorker ? "Idle worker (idle at completion; no return travel)" : "Gathering worker"} · ${travel("Outward", settings?.outwardDuration)} · ${settings?.useIdleWorker ? "Return: none (idle at completion)" : travel("Return", settings?.returnDuration)}`
}
