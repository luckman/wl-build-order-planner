import { validateCommandTime } from "./plannerLimits"
import type { FactionId, PlannerItem } from "./gameData"

export type ScrollId = "gold-rush" | "lumber-gathering" | "whip"

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
const SCROLL_DURATIONS = [30, 30.3, 30.8, 31.5, 32.4, 33.5] as const
export const WHIP = { manaCost: 50, startDelay: 1, duration: 30,
    woodTimeReduction: 2, goldTimeReduction: 0.5, movementMultiplier: 1.15 } as const

export function scrollEffect(id: ScrollId, settings: { lightGoldRushLevel?: number; lightLumberGatheringLevel?: number; darkWhipLevel?: number }) {
    const level = (id === "whip" ? settings.darkWhipLevel : id === "gold-rush" ? settings.lightGoldRushLevel : settings.lightLumberGatheringLevel) ?? 1
    if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error("Scroll level must be an integer from 1 to 6.")
    if (id === "whip") return { ...SCROLLS.whip, incomeBonus: 0 }
    const duration = SCROLL_DURATIONS[level - 1]
    const incomeBonus = (id === "gold-rush" ? GOLD_RUSH.goldBonus : LUMBER_GATHERING.woodBonus) + level - 1
    const scroll = SCROLLS[id]
    return { ...scroll, duration, incomeBonus,
        description: id === "gold-rush"
            ? `${scroll.manaCost} mana · starts after 1 second · +${incomeBonus} gold per mine exit for ${duration} seconds.`
            : `${scroll.manaCost} mana · starts after 1 second · +${incomeBonus} wood per gathering stage completed in the forest during the next ${duration} seconds.` }
}
export const SCROLLS = {
    "gold-rush": { ...GOLD_RUSH, faction: "light", name: "Gold Rush", icon: "lightGoldRush",
        description: "50 mana · starts after 1 second · +10 gold per mine exit for 30 seconds." },
    "lumber-gathering": { ...LUMBER_GATHERING, faction: "light", name: "Lumber Gathering", icon: "lightLumberGathering",
        description: "25 mana · starts after 1 second · +15 wood per gathering stage completed in the forest during the next 30 seconds." },
    whip: { ...WHIP, faction: "dark", name: "Whip", icon: "darkWhip",
        description: "50 mana · starts after 1 second · workers: wood harvesting −2 seconds, gold mining −0.5 seconds, movement speed +15% for 30 seconds." },
} as const

export function scrollCooldown(settings: { timeBetweenScrolls?: number; scrollCooldownReduction?: number }): number {
    return (settings.timeBetweenScrolls ?? 10) * (1 - (settings.scrollCooldownReduction ?? 0) / 100)
}

export function createScrollAction(command: ScrollCommand, faction: FactionId): ScrollAction {
    if (command.type !== "use-scroll" || !Object.prototype.hasOwnProperty.call(SCROLLS, command.scrollId)) throw new Error("Unknown scroll.")
    const scroll = SCROLLS[command.scrollId]
    if (faction !== scroll.faction) throw new Error(`${scroll.name} is only available to ${scroll.faction === "light" ? "Light" : "Dark"}.`)
    if (!Number.isFinite(command.commandTime) || command.commandTime < 0 ||
        !Number.isFinite(command.commandTime + scroll.startDelay + scroll.duration)) {
        throw new Error("Scroll commandTime must be a finite non-negative number.")
    }
    validateCommandTime(command.commandTime)
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
