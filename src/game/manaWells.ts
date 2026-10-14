import { validateCommandTime } from "./plannerLimits"
import type { PlannerItem } from "./gameData"

export type ManaWellEventType = "mana-well-is-captured" | "mana-well-is-lost"
export type ManaWellCommand = { type: ManaWellEventType; commandTime: number }
export type ManaWellAction = PlannerItem & { kind: "mana-well"; wellEvent: ManaWellEventType; commandTime: number }
export const MANA_WELL_EVENTS = {
    "mana-well-is-captured": { name: "Mana well is captured", icon: "manaWellIsCaptured" },
    "mana-well-is-lost": { name: "Mana well is lost", icon: "manaWellIsLost" },
} as const

export function createManaWellAction(command: ManaWellCommand): ManaWellAction {
    if (command.type !== "mana-well-is-captured" && command.type !== "mana-well-is-lost") throw new Error("Unknown mana well event.")
    if (!Number.isFinite(command.commandTime) || command.commandTime < 0) throw new Error("Mana well commandTime must be a finite non-negative number.")
    validateCommandTime(command.commandTime)
    return { id: command.type, ...MANA_WELL_EVENTS[command.type], kind: "mana-well", wellEvent: command.type,
        commandTime: command.commandTime, gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}
export function manaWellCommand(item: ManaWellAction): ManaWellCommand {
    return { type: item.wellEvent, commandTime: item.commandTime }
}

/** Timestamp order, with source order resolving simultaneous captures/losses. Invalid losses have no effect. */
export function evaluateManaWells(items: PlannerItem[]) {
    let owned = 0
    return items.flatMap((item, index) => item.kind === "mana-well" ? [{ item, index }] : [])
        .sort((a, b) => a.item.commandTime - b.item.commandTime || a.index - b.index)
        .map(({ item, index }) => {
            createManaWellAction(manaWellCommand(item))
            const blocked = item.wellEvent === "mana-well-is-lost" && owned === 0
            if (!blocked) owned += item.wellEvent === "mana-well-is-captured" ? 1 : -1
            return { item, index, owned, blocked,
                blockedReason: blocked ? "Mana well is lost requires at least one owned mana well at this timestamp." : undefined }
        })
}

type WellStateAction = { item: { kind: string; id: string }; commandTime?: number | null; blocked?: boolean }
export function manaWellCountAt(actions: WellStateAction[], time: number) {
    let owned = 0
    for (const action of actions.filter(action => !action.blocked && action.item.kind === "mana-well" &&
        action.commandTime != null && action.commandTime <= time).sort((a, b) => a.commandTime! - b.commandTime!)) {
        owned = Math.max(0, owned + (action.item.id === "mana-well-is-captured" ? 1 : -1))
    }
    return owned
}
