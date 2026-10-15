import { type Faction } from "./game/gameData"

// Shared by building cards and upgrade groups; upgrade levels stay in ascending order.
const buildingDisplayOrder = {
    light: [
        "castle", "sawmill", "farm",
        "barracks", "factory", "sanctuary", "altar-of-heroes",
        "dwarven-forge", "human-monument", "elven-tree",
        "tower-of-mana", "shipyard",
        "tower-of-light-magic", "crossbow-tower", "artillery-tower",
    ],
    dark: [
        "citadel", "sawmill", "pigsty",
        "barracks", "workshop", "dark-gate", "altar-of-heroes",
        "undead-obelisk", "goblin-lab", "totem-of-orcs",
        "tower-of-mana",
        // TODO: Dark Shipyard placeholder: add its catalog data using this ID (or update
        // this ID to match). Keep it after Tower of Mana and before defensive buildings.
        "shipyard",
        "tower-of-dark-magic", "slingshot-tower", "napalm-tower",
    ],
}

export function orderedBuildings(faction: Faction) {
    const order = buildingDisplayOrder[faction.id]
    const rank = (id: string) => {
        const index = order.indexOf(id)
        return index < 0 ? order.length : index
    }
    return faction.items.filter(item => item.kind === "building")
        .sort((a, b) => rank(a.id) - rank(b.id))
}
