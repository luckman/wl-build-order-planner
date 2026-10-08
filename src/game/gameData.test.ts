import { buildOrderWithDependencies, factions } from "./gameData"

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
