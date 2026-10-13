import type { FactionId, PlannerItem } from "./gameData"

export type ScrollCommand = {
    type: "use-scroll"
    scrollId: "gold-rush"
    commandTime: number
}

/** Scroll instances carry their required timestamp separately from derived timings. */
export type ScrollAction = PlannerItem & {
    kind: "scroll"
    scrollId: "gold-rush"
    commandTime: number
}

export const GOLD_RUSH = { manaCost: 50, startDelay: 1, duration: 30, goldBonus: 10 } as const

export function createScrollAction(command: ScrollCommand, faction: FactionId): ScrollAction {
    if (command.type !== "use-scroll" || command.scrollId !== "gold-rush") throw new Error("Unknown scroll.")
    if (faction !== "light") throw new Error("Gold Rush is only available to Light.")
    if (!Number.isFinite(command.commandTime) || command.commandTime < 0 ||
        !Number.isFinite(command.commandTime + GOLD_RUSH.startDelay + GOLD_RUSH.duration)) {
        throw new Error("Scroll commandTime must be a finite non-negative number.")
    }
    return {
        id: "gold-rush", name: "Gold Rush", kind: "scroll", icon: "lightGoldRush",
        gold: 0, wood: 0, food: 0, seconds: GOLD_RUSH.duration,
        producer: "", prerequisites: [],
        scrollId: command.scrollId, commandTime: command.commandTime,
    }
}

export function isScrollAction(item: PlannerItem): item is ScrollAction {
    return item.kind === "scroll"
}

export function scrollCommand(item: ScrollAction): ScrollCommand {
    return { type: "use-scroll", scrollId: item.scrollId, commandTime: item.commandTime }
}
