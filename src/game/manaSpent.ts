import type { FactionId, PlannerItem } from "./gameData"
import { validateCommandTime } from "./plannerLimits"

export type ManaSpentCommand = { type: "mana-spent"; commandTime: number; mana: number }
export type ManaSpentAction = PlannerItem & { kind: "mana-spent"; commandTime: number; mana: number }

export function createManaSpentAction(command: ManaSpentCommand, faction: FactionId): ManaSpentAction {
    validateCommandTime(command.commandTime)
    if (!Number.isInteger(command.commandTime)) throw new Error("Mana spent command time must be a whole second.")
    if (typeof command.mana !== "number" || !Number.isFinite(command.mana) || !Number.isInteger(command.mana) || command.mana <= 0)
        throw new Error("Mana spent amount must be a finite positive whole number.")
    return { id: "mana-spent", name: "Mana spent", kind: "mana-spent", commandTime: command.commandTime, mana: command.mana,
        icon: faction === "light" ? "lightManaSpent" : "darkManaSpent", gold: 0, wood: 0, food: 0, seconds: 0, producer: "", prerequisites: [] }
}

export function manaSpentCommand(item: ManaSpentAction): ManaSpentCommand {
    return { type: "mana-spent", commandTime: item.commandTime, mana: item.mana }
}

/** Inspect all commands, including blocked ones; source row order must never hide a collision. */
export function manaSpentCollision(items: PlannerItem[]): string | null {
    const commands = items.filter(item => item.kind === "mana-spent" || item.kind === "scroll")
    for (const item of commands) {
        if (item.kind === "mana-spent" && commands.some(other => other !== item &&
            (other.kind === "scroll" || other.kind === "mana-spent") && other.commandTime === item.commandTime))
            return "Mana spent cannot share a command timestamp with another Mana spent event or a scroll."
    }
    return null
}
