import { simulateBuildOrder } from "./buildSimulation"
import { buildOrderWithDependencies, factions } from "./gameData"
import { economyFromProfile, initialGameProfile } from "./gameProfile"
import { parseShareableLink } from "./shareableLink"

const lightBuild = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43K_je8813bOlwVw4NmWV5otS6ZQbTAFZxLaAVpmCTZOIZSKHx1KD_X4EWRInF3w45PGnwZC8l0K62qBVtnKsjvmKZqk0sOmeLYRV0n9kRqc3wq0An1ROptFgGLHKmA44TDyqCuWU0DcU8YRiC_oR0rKpQ2ZHrpfgKoDim0SjtSU4PkQsF5tjpTquTjoeJJO6VBsdDQi0osqV1s89Wzx4E3BXSARh4ZL-vMPIl3vpB06IxUaLHXWSiFgn0Kki8xchipM4eoV8ILkTQg2CazrNVa5oIEnL6V4UgohOaid_apx8XOi3z_xY2tUciEJoToDnZb4ArBtLeU7WVOD6eaU2XWQOGfXWzoTWJ0NO5b5IWealFk3r4xq9RpN7Ms8QWn_hGYc5zAzRMVXRGlcIsXZG6R3W4MxY1_XwA7unoReZ72LX5qfwkc1RrdsO6WaeJ2ApMD-dFgJRyLU9IapIS2JGarv0W9BplkApCniLVwbXgN1OPZmqDVnq8U5g2kqmaagPy1tAA6_1SS0pkFysV4ts9eibV8CVN9H8IxZ2szkODxQVVvYhbOz0x5653YbERzW0kcIBrxlaVrf2uTlNx4doz5SD_C71mx9g9s-wY3O7qB_Ah7EN79ICrxXEjlIKnp48R5I3wdLk1Oe0XrPPw05GSylTS-ZuISms08D1VvOE_UnABzDoLRTcIUDgcZqSn9oGYSMwbMhVic2mJP79MKWrSAInlFSA4EpsOY4jf_m7VEM9JDZdCm3h0KkfpMPNkq-CeP4Pibdz_Lsm5goVab57MZSrvopa2Bl16PDI8ez4yvVFkoyTLrH6beiWc35vfW_9Ep9lQr9LXFm-pjSQUj0P9C7dJzGJz165pdNRuxyCNSVKsFzSnUG6ULOTfhQ3z2fzWYWfFfrs3byQrhS4a2f3F-YVPeH-RlJsSBPv5L-IfyfFd3frWOw946qk3Dw3RZlD4c69FOsi_E_RwTKlaer9UPPCUfnX8PDz8Au7AA6V"

test("appending a second Tower of Mana preserves the Light build and matches a fresh solve", () => {
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
    expect(result).toEqual(simulateBuildOrder(extended, ...args))
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
