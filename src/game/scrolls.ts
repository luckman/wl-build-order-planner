import type { FactionId, PlannerItem } from "./gameData"

export type ScrollId = "gold-rush" | "lumber-gathering"

export type ScrollCommand = {
    type: "use-scroll"
    scrollId: ScrollId
    commandTime: number
}

/** Scroll instances carry their required timestamp separately from derived timings. */
export type ScrollAction = PlannerItem & {
    kind: "scroll"
    scrollId: ScrollId
    commandTime: number
}

export const GOLD_RUSH = { manaCost: 50, startDelay: 1, duration: 30, goldBonus: 10 } as const
export const LUMBER_GATHERING = { manaCost: 25, startDelay: 1, duration: 30, woodBonus: 15 } as const
export const SCROLLS = {
    "gold-rush": { ...GOLD_RUSH, name: "Gold Rush", icon: "lightGoldRush",
        description: "50 mana · starts after 1 second · +10 gold per mine exit for 30 seconds." },
    "lumber-gathering": { ...LUMBER_GATHERING, name: "Lumber Gathering", icon: "lightLumberGathering",
        description: "25 mana · starts after 1 second · +15 wood per gathering stage completed in the forest during the next 30 seconds." },
} as const

export function scrollCooldown(settings: { timeBetweenScrolls?: number; scrollCooldownReduction?: number }): number {
    return (settings.timeBetweenScrolls ?? 10) * (1 - (settings.scrollCooldownReduction ?? 0) / 100)
}

export function createScrollAction(command: ScrollCommand, faction: FactionId): ScrollAction {
    if (command.type !== "use-scroll" || (command.scrollId !== "gold-rush" && command.scrollId !== "lumber-gathering")) throw new Error("Unknown scroll.")
    const scroll = SCROLLS[command.scrollId]
    if (faction !== "light") throw new Error(`${scroll.name} is only available to Light.`)
    if (!Number.isFinite(command.commandTime) || command.commandTime < 0 ||
        !Number.isFinite(command.commandTime + scroll.startDelay + scroll.duration)) {
        throw new Error("Scroll commandTime must be a finite non-negative number.")
    }
    return {
        id: command.scrollId, name: scroll.name, kind: "scroll", icon: scroll.icon,
        gold: 0, wood: 0, food: 0, seconds: scroll.duration,
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
