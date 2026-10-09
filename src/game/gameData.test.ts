import { buildOrderWithDependencies, factions, itemCost, type BuildingType } from "./gameData"

test.each(["Production", "Racial", "Economic", "Defensive"] as BuildingType[])(
    "%s pricing counts only earlier copies of the same initial building",
    (type) => {
        const building = { ...factions.light.items[0], id: "test-building", name: "Test building", type }
        const upgrade = { ...building, kind: "upgrade" as const }
        const other = { ...building, id: "other-building" }
        const previous = [building, upgrade, other, building]
        const multiplier = type === "Production" || type === "Racial" ? 3 : 1
        expect(itemCost(building, previous, "Castle")).toEqual({ gold: 500 * multiplier, wood: 500 * multiplier })
        expect(itemCost(upgrade, previous, "Castle")).toEqual({ gold: 500, wood: 500 })
    },
)

test("derives producers and prerequisites from the Light game-data catalog", () => {
    const light = factions.light
    const swordsman = light.items.find((item) => item.id === "swordsman")
    const castle = light.items.find((item) => item.id === "castle")
    const castleUpgrade = light.items.find((item) => item.id === "castle-lvl-2")

    expect(swordsman).toMatchObject({ producer: "Barracks", prerequisites: ["Barracks"] })
    expect(castle).toMatchObject({ producer: "Worker" })
    expect(castleUpgrade).toMatchObject({ producer: "Castle", prerequisites: ["Castle", "Barracks", "Farm"] })
})

test("derives the Dark catalog independently", () => {
    const dark = factions.dark
    const goon = dark.items.find((item) => item.id === "goon")

    expect(goon).toMatchObject({ producer: "Barracks", prerequisites: ["Barracks"] })
    expect(dark.items.find((item) => item.id === "citadel-lvl-2")).toMatchObject({
        prerequisites: ["Citadel", "Barracks", "Pigsty"],
    })
    expect(dark.startingTownHall).toBe("Citadel")
})

test("adds unmet prerequisites in dependency order and omits the starting town hall", () => {
    const light = factions.light
    const castleUpgrade = light.items.find((item) => item.id === "castle-lvl-2")!

    expect(buildOrderWithDependencies(light, [], castleUpgrade).map((item) => item.name)).toEqual([
        "Barracks",
        "Farm",
        "Castle lvl 2",
    ])
})

test.each(["light", "dark"] as const)("%s catalog contains the confirmed higher levels and building limits", (factionId) => {
    const faction = factions[factionId]
    const base = factionId === "light" ? "castle" : "citadel"
    const food = factionId === "light" ? "farm" : "pigsty"
    const find = (id: string) => faction.items.find(item => item.id === id)!

    expect(find(`${base}-lvl-3`)).toMatchObject({
        kind: "upgrade", type: "Economic", gold: 400, wood: 400, seconds: 50,
        producer: `${faction.startingTownHall} lvl 2`,
        requirements: [
            { item: base, count: 1, minLevel: 2 },
            { item: food, count: 2 },
            { item: "tower-of-mana", count: 1 },
            { item: "barracks", count: 1 },
        ],
    })
    expect(find(`${base}-lvl-4`)).toMatchObject({
        kind: "upgrade", type: "Economic", gold: 600, wood: 600, seconds: 55,
        producer: `${faction.startingTownHall} lvl 3`,
        requirements: [
            { item: base, count: 1, minLevel: 3 },
            { item: food, count: 3 },
            { item: "tower-of-mana", count: 2 },
            { item: "barracks", count: 1 },
        ],
    })
    expect(find("tower-of-mana")).toMatchObject({
        kind: "building", type: "Economic", gold: 200, wood: 150, seconds: 40,
        icon: factionId === "light" ? "lightTowerOfMana" : "darkTowerOfMana",
        requirements: [{ item: base, count: 1, minLevel: 2 }],
        limit: { basedOn: base, byHighestLevel: [
            { minLevel: 2, max: 1 }, { minLevel: 3, max: 2 }, { minLevel: 4, max: 3 },
        ] },
    })
    for (const id of [food, "sawmill"]) {
        expect(find(id).limit).toEqual({ basedOn: base, byHighestLevel: [
            { minLevel: 1, max: 1 }, { minLevel: 2, max: 2 },
            { minLevel: 3, max: 3 }, { minLevel: 4, max: 4 },
        ] })
    }
    expect(find("barracks").requirements).toEqual([{ item: base, count: 1, minLevel: 1 }])
    expect(find("barracks").limit).toBeUndefined()
})

test.each(["light", "dark"] as const)("%s dependency insertion builds the quantities needed through level 4", (id) => {
    const faction = factions[id]
    const base = id === "light" ? "castle" : "citadel"
    const food = id === "light" ? "farm" : "pigsty"
    const target = faction.items.find(item => item.id === `${base}-lvl-4`)!
    const order = buildOrderWithDependencies(faction, [], target)
    expect(order.map(item => item.id)).toEqual([
        "barracks", food, `${base}-lvl-2`, food, "tower-of-mana", `${base}-lvl-3`,
        food, "tower-of-mana", `${base}-lvl-4`,
    ])
    expect(() => buildOrderWithDependencies(faction, order, target)).toThrow(`Requires another ${faction.startingTownHall} lvl 3`)
})

test("a second Farm inserts the level 2 upgrade; adding a fifth Farm fails atomically", () => {
    const faction = factions.light
    const farm = faction.items.find(item => item.id === "farm")!
    let order = buildOrderWithDependencies(faction, [], farm)
    order = buildOrderWithDependencies(faction, order, farm)
    expect(order.map(item => item.id)).toEqual(["farm", "barracks", "castle-lvl-2", "farm"])
    order = buildOrderWithDependencies(faction, order, farm)
    order = buildOrderWithDependencies(faction, order, farm)
    const original = [...order]
    expect(() => buildOrderWithDependencies(faction, order, farm)).toThrow("Farm limit reached")
    expect(order).toEqual(original)
})

test("Archer prerequisites are inserted once, and Elven Trees have no quantity cap", () => {
    const faction = factions.light
    const archer = faction.items.find(item => item.id === "archer")!
    const tree = faction.items.find(item => item.id === "elven-tree")!
    let order = buildOrderWithDependencies(faction, [], archer)
    expect(order.map(item => item.id)).toEqual(["barracks", "farm", "castle-lvl-2", "elven-tree", "archer"])
    order = buildOrderWithDependencies(faction, order, archer)
    expect(order.filter(item => item.id === "elven-tree")).toHaveLength(1)
    for (let index = 0; index < 5; index++) order = buildOrderWithDependencies(faction, order, tree)
    expect(order.filter(item => item.id === "elven-tree")).toHaveLength(6)
})

test("a second upgrade is allowed after explicitly adding a second source building", () => {
    const faction = factions.light
    const castle = faction.items.find(item => item.id === "castle")!
    const upgrade = faction.items.find(item => item.id === "castle-lvl-2")!
    const first = buildOrderWithDependencies(faction, [], upgrade)
    expect(() => buildOrderWithDependencies(faction, first, upgrade)).toThrow("Requires another Castle")
    const second = buildOrderWithDependencies(faction, [...first, castle], upgrade)
    expect(second.filter(item => item.id === upgrade.id)).toHaveLength(2)
    expect(second.filter(item => item.id === "farm")).toHaveLength(1)
})

test("dependency cycles fail with a useful error", () => {
    const faction = factions.light
    const items = faction.items.map(item => item.id === "barracks"
        ? { ...item, requirements: [{ item: "elven-tree", count: 1 }] } : item)
    expect(() => buildOrderWithDependencies({ ...faction, items }, [], items.find(item => item.id === "elven-tree")!))
        .toThrow("Circular prerequisite or building limit")
})

test("Miriel inserts Altar prerequisites and cannot be queued twice across multiple Altars", () => {
    const faction = factions.light
    const miriel = faction.items.find(item => item.id === "miriel")!
    const altar = faction.items.find(item => item.id === "altar-of-heroes")!
    const order = buildOrderWithDependencies(faction, [], miriel)
    expect(order.map(item => item.id)).toEqual(["barracks", "farm", "castle-lvl-2", "altar-of-heroes", "elven-tree", "miriel"])
    const twoAltars = buildOrderWithDependencies(faction, order, altar)
    expect(() => buildOrderWithDependencies(faction, twoAltars, miriel)).toThrow("Miriel limit reached")
    expect(itemCost(altar, twoAltars, "Castle")).toEqual({ gold: 450, wood: 300 })
    const removed = twoAltars.filter(item => item.id !== "miriel")
    expect(buildOrderWithDependencies(faction, removed, miriel).filter(item => item.id === "miriel")).toHaveLength(1)
    expect(factions.dark.items.some(item => item.id === "miriel" || item.id === "altar-of-heroes")).toBe(false)
})
