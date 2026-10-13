import { factions, type FactionId } from "./gameData"
import type { BuildDraft } from "./draftStorage"

type BuildOrderTemplate = {
    name: string
    itemIds: string[]
}

export const buildOrderTemplates: Record<FactionId, BuildOrderTemplate[]> = {
    light: [
        {
            name: "10 workers t2 on basic account",
            itemIds: ["worker", "worker", "worker", "worker", "barracks", "farm", "worker", "castle-lvl-2"],
        },
        {
            name: "10 workers t2 with swordsman",
            itemIds: ["worker", "worker", "worker", "barracks", "worker", "farm", "worker", "swordsman", "castle-lvl-2"],
        },
    ],
    dark: [],
}

export function createBuildOrderFromTemplate(faction: FactionId, template: BuildOrderTemplate): BuildDraft {
    return {
        opening: { type: "allocate-workers", goldWorkers: 3 },
        items: template.itemIds.map(id => {
            const item = factions[faction].items.find(candidate => candidate.id === id)
            if (!item) throw new Error(`Unknown build order template item: ${id}`)
            return { ...item }
        }),
    }
}
