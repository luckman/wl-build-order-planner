import { deflate } from "pako"
import { createShareableLink, MAX_SHARE_LINK_LENGTH, parseShareableLink } from "./shareableLink"
import { GAME_RULES_VERSION, MAX_FILE_BYTES } from "./buildOrderFile"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { factions, type FactionId } from "./gameData"
import { simulateBuildOrder } from "./buildSimulation"

function encodeDocument(value: unknown) {
    let binary = ""
    for (const byte of deflate(JSON.stringify(value))) binary += String.fromCharCode(byte)
    return `#build=2.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`
}

test.each<FactionId>(["light", "dark"])("%s links preserve duplicate actions and the complete customized profile", faction => {
    const profile = {
        ...initialGameProfile,
        basic: { ...initialGameProfile.basic, initialGoldTravelReduction: 2.5 },
        map: { ...initialGameProfile.map, sawmillWoodTravelTime: 1.25, woodTravelTimeIncreaseBase: 0.75, maxWoodTravelTime: 6.5 },
        player: { ...initialGameProfile.player, startingGold: 2000, startingWood: 2000 },
        delays: { ...initialGameProfile.delays, orderDelay: 2.5 },
    }
    const worker = factions[faction].items.find(item => item.id === (faction === "light" ? "worker" : "slave"))!
    const plan = simulateBuildOrder([worker, worker], economyFromProfile(profile), 10, 20, 20, factions[faction].startingTownHall).plan
    const link = createShareableLink("https://example.com/planner/?mode=test#old", faction, profile, plan)
    const url = new URL(link)
    expect(url.pathname).toBe("/planner/")
    expect(url.search).toBe("?mode=test")
    expect(url.hash).toMatch(/^#build=2\.[A-Za-z0-9_-]+$/)
    const result = parseShareableLink(url.hash)!
    expect(result.faction).toBe(faction)
    expect(result.gameProfile).toEqual(profile)
    expect(result.buildOrder).toEqual([worker, worker])
    expect(result.warning).toBeNull()
    expect(simulateBuildOrder(result.buildOrder, economyFromProfile(result.gameProfile), 10, 20, 20, factions[faction].startingTownHall).plan).toEqual(plan)
})

test("empty order links support profile sharing", () => {
    const url = new URL(createShareableLink("https://example.com", "light", initialGameProfile, []))
    expect(parseShareableLink(url.hash)!.buildOrder).toEqual([])
})


test("unrelated fragments do not import", () => {
    expect(parseShareableLink("")).toBeNull()
    expect(parseShareableLink("#section")).toBeNull()
})

test.each(["#build=1.test", "#build=2.", "#build=2.invalid!", "#build=2.abcd", "#build=2.eJyrVkr"]) ("rejects corrupt or unsupported link %s", hash => {
    expect(() => parseShareableLink(hash)).toThrow()
})

test("link documents reuse JSON validation, ignore timings, and warn on different rules", () => {
    const doc = {
        format: "wl-build-order", version: 2, gameRulesVersion: "old-rules", faction: "light",
        gameProfile: initialGameProfile, buildOrder: [{ type: "allocate-workers", goldWorkers: 4 }, { itemId: "worker", timings: "ignored" }],
    }
    expect(parseShareableLink(encodeDocument(doc))!.warning).toContain("current rules")
    doc.buildOrder[1].itemId = "unknown"
    expect(() => parseShareableLink(encodeDocument(doc))).toThrow("unknown item ID")
    doc.gameRulesVersion = GAME_RULES_VERSION
})

test("oversized links and compressed documents are rejected", () => {
    expect(() => parseShareableLink(`#build=2.${"A".repeat(MAX_SHARE_LINK_LENGTH)}`)).toThrow("too large")
    expect(() => parseShareableLink(encodeDocument({ padding: "A".repeat(MAX_FILE_BYTES + 1) }))).toThrow("too large")
    expect(() => createShareableLink(`https://example.com/${"a".repeat(MAX_SHARE_LINK_LENGTH)}`, "light", initialGameProfile, [])).toThrow("Export JSON")
})
