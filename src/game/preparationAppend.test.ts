import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseShareableLink } from "./shareableLink"

const lightBuild = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43K_je8813bOlwVw4NmWV5otS6ZQbTAFZxLaAVpmCTZOIZSKHx1KD_X4EWRInF3w45PGnwZC8l0K62qBVtnKsjvmKZqk0sOmeLYRV0n9kRqc3wq0An1ROptFgGLHKmA44TDyqCuWU0DcU8YRiC_oR0rKpQ2ZHrpfgKoDim0SjtSU4PkQsF5tjpTquTjoeJJO6VBsdDQi0osqV1s89Wzx4E3BXSARh4ZL-vMPIl3vpB06IxUaLHXWSiFgn0Kki8xchipM4eoV8ILkTQg2CazrNVa5oIEnL6V4UgohOaid_apx8XOi3z_xY2tUciEJoToDnZb4ArBtLeU7WVOD6eaU2XWQOGfXWzoTWJ0NO5b5IWealFk3r4xq9RpN7Ms8QWn_hGYc5zAzRMVXRGlcIsXZG6R3W4MxY1_XwA7unoReZ72LX5qfwkc1RrdsO6WaeJ2ApMD-dFgJRyLU9IapIS2JGarv0W9BplkApCniLVwbXgN1OPZmqDVnq8U5g2kqmaagPy1tAA6_1SS0pkFysV4ts9eibV8CVN9H8IxZ2szkODxQVVvYhbOz0x5653YbERzW0kcIBrxlaVrf2uTlNx4doz5SD_C71mx9g9s-wY3O7qB_Ah7EN79ICrxXEjlIKnp48R5I3wdLk1Oe0XrPPw05GSylTS-ZuISms08D1VvOE_UnABzDoLRTcIUDgcZqSn9oGYSMwbMhVic2mJP79MKWrSAInlFSA4EpsOY4jf_m7VEM9JDZdCm3h0KkfpMPNkq-CeP4Pibdz_Lsm5goVab57MZSrvopa2Bl16PDI8ez4yvVFkoyTLrH6beiWc35vfW_9Ep9lQr9LXFm-pjSQUj0P9C7dJzGJz165pdNRuxyCNSVKsFzSnUG6ULOTfhQ3z2fzWYWfFfrs3byQrhS4a2f3F-YVPeH-RlJsSBPv5L-IfyfFd3frWOw946qk3Dw3RZlD4c69FOsi_E_RwTKlaer9UPPCUfnX8PDz8Au7AA6V"

test("adding and removing the second Tower of Mana preserves the Light build", () => {
    const { buildOrder, gameProfile, opening } = parseShareableLink(lightBuild)
    const faction = factions.light
    const tower = faction.items.find(item => item.id === "tower-of-mana")!
    const economy = economyFromProfile(gameProfile, opening)
    const args = [economy, (economy.goldWorkers + economy.woodWorkers) * 2,
        gameProfile.player.baseFoodLimit, economy.foodPerFarm, faction.startingTownHall] as const
    const previous = simulateBuildOrder(buildOrder, ...args)
    const extended = buildOrderWithDependencies(faction, buildOrder, tower)
    const result = simulateBuildOrder(extended, ...args, { previous })
    const added = result.plan[37]

    expect(previous.plan).toHaveLength(37)
    expect(result.plan).toHaveLength(38)
    expect(result.plan.slice(0, 37)).toEqual(previous.plan)
    expect(added).toMatchObject({ item: tower, blocked: false })
    expect(added.commandTime).toBeCloseTo(411.5, 3)
    expect(added.finishTime).toBeCloseTo(454.5, 3)
    expect(previous.plan[36].finishTime).toBeGreaterThan(added.commandTime!)
    const beforeCommand = ({ time }: { time: number }) => time < added.commandTime!
    const beforeTower = previous.deliveries.filter(beforeCommand)
    expect(beforeTower).toHaveLength(221)
    expect(result.deliveries.filter(beforeCommand)).toEqual(beforeTower)
    const withTower = simulateBuildOrder(extended, ...args)
    expect(result).toEqual(withTower)
    for (const source of [withTower, result]) {
        const removed = simulateBuildOrder(buildOrder, ...args, { previous: source })
        expect(removed).toEqual(previous)
        expect(removed.deliveries[removed.deliveries.length - 1].time)
            .toBeLessThan(source.deliveries[source.deliveries.length - 1].time)
    }
}, 30000)

const faction = factions.light
const farm = faction.items.find(item => item.id === "farm")!
const barracks = faction.items.find(item => item.id === "barracks")!
const richEconomy = { ...economyFromProfile(initialGameProfile), startingGold: 10000, startingWood: 10000 }
const richArgs = [richEconomy, 10, 20, richEconomy.foodPerFarm, faction.startingTownHall] as const

test("changing the simulation inputs recalculates prior preparation on append", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const prefix = [prepared]
    const previous = simulateBuildOrder(prefix, ...richArgs)
    const extended = buildOrderWithDependencies(faction, prefix, farm)
    const changedArgs = [{ ...richEconomy, orderDelay: 20 }, 10, 20, richEconomy.foodPerFarm, faction.startingTownHall] as const
    const result = simulateBuildOrder(extended, ...changedArgs, { previous })

    expect(previous.plan[0].commandTime).toBe(10)
    expect(result.plan[0].commandTime).toBe(20)
    expect(result).toEqual(simulateBuildOrder(extended, ...changedArgs))
})

test("editing prior preparation recalculates the build even when the edit also appends one building", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const prefix = [prepared]
    const previous = simulateBuildOrder(prefix, ...richArgs)
    prepared.construction.preparationDuration = 15
    const extended = buildOrderWithDependencies(faction, prefix, farm)
    const result = simulateBuildOrder(extended, ...richArgs, { previous })

    expect(previous.plan[0].commandTime).toBe(10)
    expect(result.plan[0]).toMatchObject({ commandTime: 15, departureTime: 0 })
    expect(result).toEqual(simulateBuildOrder(extended, ...richArgs))
})

test("an append that interrupts a previous builder's return agrees with a fresh solve", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10, returnDuration: 15 } }
    const economy = { ...richEconomy, workerCount: 1, woodWorkers: 1, goldWorkers: 0 }
    const args = [economy, 2, 20, economy.foodPerFarm, faction.startingTownHall] as const
    const prefix = [prepared]
    const previous = simulateBuildOrder(prefix, ...args)
    const extended = buildOrderWithDependencies(faction, prefix, farm)
    const result = simulateBuildOrder(extended, ...args, { previous })

    expect(previous.plan[0].workerReturnEndTime).toBe(previous.plan[0].finishTime! + 15)
    expect(result.plan[1]).toMatchObject({ blocked: false, commandTime: previous.plan[0].finishTime, workerId: previous.plan[0].workerId })
    expect(result.plan[0].workerReturnEndTime).toBe(result.plan[1].commandTime)
    expect(result).toEqual(simulateBuildOrder(extended, ...args))
})

test("the full solver can move preparation to fund an append within the search horizon", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 17 } }
    const sawmill = faction.items.find(item => item.id === "sawmill")!
    const economy = { ...economyFromProfile(initialGameProfile), startingGold: 245, startingWood: 75,
        goldWorkers: 3, woodWorkers: 2, goldPerTrip: 36, woodPerTrip: 18, goldGatherTime: 8, woodGatherTime: 2,
        constructionStartDelay: 4, orderDelay: 2 }
    const args = [economy, 10, 20, economy.foodPerFarm, faction.startingTownHall] as const
    const until = 74
    const prefix = [prepared]
    const previous = simulateBuildOrder(prefix, ...args, until)
    const extended = buildOrderWithDependencies(faction, prefix, sawmill)
    const result = simulateBuildOrder(extended, ...args, { previous, until })

    expect(previous.plan[0]).toMatchObject({ blocked: false, departureTime: 18, commandTime: 35 })
    expect(result.plan[0]).toMatchObject({ blocked: false, departureTime: 23, commandTime: 40 })
    expect(result.plan[1]).toMatchObject({ blocked: false, commandTime: 74 })
    expect(result).toEqual(simulateBuildOrder(extended, ...args, until))

    const removed = simulateBuildOrder(prefix, ...args, { previous: result, until })
    expect(removed).toEqual(previous)
})

const gilbertLink = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6tdX6MO3BOBewcGJ0bZMhxH_ftRNKQtuxSZP2UCk-99Pnnmu6Y3ODhXBszCrNZ17pnBvMAVnCNoBWmZKNs4QtRAGPXoP9dgBZlmYXvN_n6aden7znQrraoNVi6Vgd8xXNXGlg4x2bCatk-FgYnd8ItwR8VgWZBr1-wipjOmA_C6gqlVNC31DEM4oN6EfIfVOHzI5cL8FVAOWTRKO1JTjdJ6wQ60OlOq5OOuxlo7pUGx30CLSiKpTWLye2tPcm4K6UCMLCJf0Fh0Eo9_M0cERdrLXYEpPUiHUCnSoX4SLU4ihNXqEQSO6EEEFwTaepKhQNJGs53YtSUKOj2imcGqcQF_kOmR-9XU6BWojkRHjqixlgTSzlOVpzgauXpVp3kSksiFs7EVofDQWV-yKlL7wWDfVpjV6jKUIzLxCpvwgdxzlMDLVjqrI1rhhi7YTSO6zBibGu6xEGdk9DLxeBxa4tTOEjm6Nat52mm3kegbnA4niaCUQhV_aIqDL31Bmp7TJsQYcsgVKU8BavDK4Au0w9m6oNWeJ4KzBvJdM01If5LaCB1_qklhxILjaoRbY4egoKuAommn_C4m42x_6eouLKPsSNHX_fMbddk_iohjZSOOB1h5bV1L40p_Fwn-yYclDc5WHzI8z-GXYgt4uGAXwY2_TtLfBaQewgpegZmudI8iZYmoJ4zus1-9zvZLSUMrdk7haSwjoNXG80z9ifBHwAg95AyR0CxD6OUwpTWyOsBcYNufLYbEoW3g_jXUUSOKKkAgTnseU4TMLl73IN9ZDYeC60hX2nfpQON3O-jOL5P028nePfkVgoVKT57sVQLk9V1MLOqEPHR44vDq_cqUiyYdZtrH4buuVc2NvAbVjis53Q7xJXlq8oDeRULwAnlz5tYpSevXJLp4N2OQRrPEqwXNKdQbpYs5N-kDbPZ_NZxZ8V-jy5eSmdF7htZw8X5hU94eFGUqxJE-_kv0h_J8V3d-tQ7D3j0lNuXpjSF1C6cy_Fqoz_U3SwhdI0dQJ_7H8ByIoGww"

function gilbertFixture() {
    const { buildOrder, gameProfile, opening } = parseShareableLink(gilbertLink)
    const economy = economyFromProfile(gameProfile, opening)
    const args = [economy, (economy.goldWorkers + economy.woodWorkers) * 2,
        gameProfile.player.baseFoodLimit, economy.foodPerFarm, faction.startingTownHall] as const
    return { buildOrder, args }
}

test("the tower after Gilbert interrupts the returning Altar builder", () => {
    const { buildOrder, args } = gilbertFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const tower = faction.items.find(item => item.id === "tower-of-mana")!
    const towerRow = { ...tower, orderId: "tower-after-gilbert" }
    const extended = buildOrderWithDependencies(faction, buildOrder, towerRow)
    const result = simulateBuildOrder(extended, ...args, { previous })

    const altar = previous.plan[30]
    const added = result.plan[36]
    expect(altar).toMatchObject({ item: { id: "altar-of-heroes-lvl-2" }, workerId: 4 })
    expect(altar.workerReturnEndTime).toBeCloseTo(403.8, 3)
    expect(added).toMatchObject({ blocked: false, workerId: 4 })
    expect(added.commandTime).toBeCloseTo(402.8, 3)
    expect(result.plan[30].workerReturnEndTime).toBe(added.commandTime)
    expect(result).toEqual(simulateBuildOrder(extended, ...args))
    expect(altar.workerReturnEndTime).toBeCloseTo(403.8, 3)
}, 30000)

test("a previous result without verified simulator state does not change the solve", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const previous = { ...simulateBuildOrder([prepared], ...richArgs) }
    expect(simulateBuildOrder([prepared, farm], ...richArgs, { previous }))
        .toEqual(simulateBuildOrder([prepared, farm], ...richArgs))
})

test("recruiting Fox Rider after Gilbert preserves all earlier actions", () => {
    const { buildOrder, args } = gilbertFixture()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const foxRider = faction.items.find(item => item.id === "fox-rider")!
    const foxRiderRow = { ...foxRider, orderId: "fox-rider-after-gilbert" }
    const extended = buildOrderWithDependencies(faction, buildOrder, foxRiderRow)
    const result = simulateBuildOrder(extended, ...args, { previous })

    expect(result.plan.slice(0, 36)).toEqual(previous.plan)
    expect(result.plan[36].commandTime).toBeCloseTo(401.8, 3)
    expect(result.plan[36].finishTime).toBeCloseTo(440.41, 3)
    expect(result).toEqual(simulateBuildOrder(extended, ...args))
}, 30000)

test("a unit append reports the fresh result when the prior preparation cannot supply it", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const worker = faction.items.find(item => item.id === "worker")!
    const args = [richEconomy, 20, 20, richEconomy.foodPerFarm, faction.startingTownHall] as const
    const previous = simulateBuildOrder([prepared], ...args)
    const extended = [prepared, worker]
    const result = simulateBuildOrder(extended, ...args, { previous })

    expect(result.plan[1]).toMatchObject({ blocked: true, blockedReason: expect.stringContaining("Insufficient supply") })
    expect(result).toEqual(simulateBuildOrder(extended, ...args))
})

test("an appended worker starts gathering after recruitment completes", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const worker = faction.items.find(item => item.id === "worker")!
    const previous = simulateBuildOrder([prepared], ...richArgs)
    const extended = [prepared, worker]
    const result = simulateBuildOrder(extended, ...richArgs, { previous })
    const delivery = result.deliveries.find(entry => entry.worker === richEconomy.workerCount)

    expect(delivery?.time).toBeGreaterThan(result.plan[1].finishTime!)
    expect(result).toEqual(simulateBuildOrder(extended, ...richArgs))
})

test("removing a prepared final action restores gathering from before its departure", () => {
    const prepared = { ...barracks, construction: { preparationDuration: 10 } }
    const preparedFarm = { ...farm, construction: { preparationDuration: 60 } }
    const previous = simulateBuildOrder([prepared, preparedFarm], ...richArgs)
    const result = simulateBuildOrder([prepared], ...richArgs, { previous })

    expect(previous.plan[1].departureTime).toBeLessThan(previous.plan[1].commandTime!)
    expect(result.deliveries).not.toEqual(previous.deliveries)
    expect(result).toEqual(simulateBuildOrder([prepared], ...richArgs))
})
