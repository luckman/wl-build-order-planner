import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { createDeliveries, WorkerEconomy } from "./resourceSimulation"
import { parseBuildOrder, serializeBuildOrder } from "./buildOrderFile"
import { simulateBuildOrder } from "./buildSimulation"
import { factions, type FactionId } from "./gameData"

const profile = { ...initialGameProfile, player: { ...initialGameProfile.player,
    startingGold: 0, startingWood: 0, goldMiningTimeReduction: 1, woodMiningTimeReduction: 5 } }

test("reductions advance opening and queued mine deliveries, and successive wood deliveries", () => {
    const economy = economyFromProfile(profile)
    expect(economy.goldGatherTime).toBeCloseTo(2.1)
    expect(economy.woodGatherTime).toBeCloseTo(7.1)
    const deliveries = createDeliveries(economy, 31)
    const gold = deliveries.filter(delivery => delivery.gold)
    expect(gold[0].time).toBeCloseTo(9.1)
    expect(gold[1].time).toBeCloseTo(11.2)
    const wood = deliveries.filter(delivery => delivery.wood)
    expect(wood[0].time).toBeCloseTo(15.1)
    expect(wood[1].time).toBeCloseTo(30.2)
    expect(gold.every(delivery => delivery.gold === 50)).toBe(true)
    expect(wood.every(delivery => delivery.wood === 50)).toBe(true)
})

test("reduced wood duration applies to new workers gathering beside a completed Sawmill", () => {
    const economy = economyFromProfile(profile)
    const simulation = new WorkerEconomy({ ...economy, workerCount: 0, goldWorkers: 0, woodWorkers: 0 })
    simulation.scheduleSawmill(0)
    simulation.addWorker("wood")
    simulation.advanceTo(9)
    expect(simulation.deliveries[0].time).toBeCloseTo(8.1)
})

test.each<FactionId>(["light", "dark"])("%s build-order resource readiness uses the reduced durations", faction => {
    const item = factions[faction].items.find(item => item.id === "sawmill")!
    const simulate = (economy: ReturnType<typeof economyFromProfile>) =>
        simulateBuildOrder([item], economy, 10, 20, 20, factions[faction].startingTownHall).plan[0]
    const reduced = simulate(economyFromProfile(profile))
    const base = simulate(economyFromProfile({ ...profile, player: { ...profile.player,
        goldMiningTimeReduction: 0, woodMiningTimeReduction: 0 } }))
    expect(reduced.commandTime).toBeCloseTo(30.2)
    expect(base.commandTime).toBeCloseTo(40.2)
    expect(reduced.blocked).toBe(false)
})

test("reductions round-trip and missing reductions default to zero for older profiles", () => {
    expect(parseBuildOrder(serializeBuildOrder("light", profile, [])).gameProfile).toEqual(profile)
    const doc = JSON.parse(serializeBuildOrder("light", profile, []))
    delete doc.gameProfile.player.goldMiningTimeReduction
    delete doc.gameProfile.player.woodMiningTimeReduction
    const imported = parseBuildOrder(JSON.stringify(doc)).gameProfile
    expect(imported.player.goldMiningTimeReduction).toBe(0)
    expect(imported.player.woodMiningTimeReduction).toBe(0)
    expect(economyFromProfile(imported).goldGatherTime).toBe(3.1)
    expect(economyFromProfile(imported).woodGatherTime).toBe(12.1)
})

test.each(["goldMiningTimeReduction", "woodMiningTimeReduction"])("%s rejects invalid and excessive values", field => {
    const doc = JSON.parse(serializeBuildOrder("light", profile, []))
    const maximum = field === "goldMiningTimeReduction" ? 1 : 5
    for (const invalid of [-0.1, maximum + 0.1, null, "0.5"]) {
        doc.gameProfile.player[field] = invalid
        expect(() => parseBuildOrder(JSON.stringify(doc))).toThrow(field)
    }
})

test("custom base durations below the reduction remain safe to simulate", () => {
    const economy = economyFromProfile({ ...profile, basic: { ...profile.basic, goldGatherTime: 0.5, woodGatherTime: 1 } })
    expect(economy.goldGatherTime).toBe(0.001)
    expect(economy.woodGatherTime).toBe(0.001)
    expect(createDeliveries(economy, 20).length).toBeGreaterThan(0)
})
