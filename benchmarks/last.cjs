const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { parseShareableLink } = require('../src/game/shareableLink.ts')
const { simulateBuildOrder } = require('../src/game/buildSimulation.ts')
const { economyFromProfile } = require('../src/game/gameProfile.ts')
const { buildOrderWithDependencies, factions } = require('../src/game/gameData.ts')
const wargRider = require('./warg-rider.cjs')
const link = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43K_je8813bOlwVw4NmWV5otS6ZQbTAFZxLaAVpmCTZOIZSKHx1KD_X4EWRInF3w45PGnwZC8l0K62qBVtnKsjvmKZqk0sOmeLYRV0n9kRqc3wq0An1ROptFgGLHKmA44TDyqCuWU0DcU8YRiC_oR0rKpQ2ZHrpfgKoDim0SjtSU4PkQsF5tjpTquTjoeJJO6VBsdDQi0osqV1s89Wzx4E3BXSARh4ZL-vMPIl3vpB06IxUaLHXWSiFgn0Kki8xchipM4eoV8ILkTQg2CazrNVa5oIEnL6V4UgohOaid_apx8XOi3z_xY2tUciEJoToDnZb4ArBtLeU7WVOD6eaU2XWQOGfXWzoTWJ0NO5b5IWealFk3r4xq9RpN7Ms8QWn_hGYc5zAzRMVXRGlcIsXZG6R3W4MxY1_XwA7unoReZ72LX5qfwkc1RrdsO6WaeJ2ApMD-dFgJRyLU9IapIS2JGarv0W9BplkApCniLVwbXgN1OPZmqDVnq8U5g2kqmaagPy1tAA6_1SS0pkFysV4ts9eibV8CVN9H8IxZ2szkODxQVVvYhbOz0x5653YbERzW0kcIBrxlaVrf2uTlNx4doz5SD_C71mx9g9s-wY3O7qB_Ah7EN79ICrxXEjlIKnp48R5I3wdLk1Oe0XrPPw05GSylTS-ZuISms08D1VvOE_UnABzDoLRTcIUDgcZqSn9oGYSMwbMhVic2mJP79MKWrSAInlFSA4EpsOY4jf_m7VEM9JDZdCm3h0KkfpMPNkq-CeP4Pibdz_Lsm5goVab57MZSrvopa2Bl16PDI8ez4yvVFkoyTLrH6beiWc35vfW_9Ep9lQr9LXFm-pjSQUj0P9C7dJzGJz165pdNRuxyCNSVKsFzSnUG6ULOTfhQ3z2fzWYWfFfrs3byQrhS4a2f3F-YVPeH-RlJsSBPv5L-IfyfFd3frWOw946qk3Dw3RZlD4c69FOsi_E_RwTKlaer9UPPCUfnX8PDz8Au7AA6V"
const gilbertLink = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6tdX6MO3BOBewcGJ0bZMhxH_ftRNKQtuxSZP2UCk-99Pnnmu6Y3ODhXBszCrNZ17pnBvMAVnCNoBWmZKNs4QtRAGPXoP9dgBZlmYXvN_n6aden7znQrraoNVi6Vgd8xXNXGlg4x2bCatk-FgYnd8ItwR8VgWZBr1-wipjOmA_C6gqlVNC31DEM4oN6EfIfVOHzI5cL8FVAOWTRKO1JTjdJ6wQ60OlOq5OOuxlo7pUGx30CLSiKpTWLye2tPcm4K6UCMLCJf0Fh0Eo9_M0cERdrLXYEpPUiHUCnSoX4SLU4ihNXqEQSO6EEEFwTaepKhQNJGs53YtSUKOj2imcGqcQF_kOmR-9XU6BWojkRHjqixlgTSzlOVpzgauXpVp3kSksiFs7EVofDQWV-yKlL7wWDfVpjV6jKUIzLxCpvwgdxzlMDLVjqrI1rhhi7YTSO6zBibGu6xEGdk9DLxeBxa4tTOEjm6Nat52mm3kegbnA4niaCUQhV_aIqDL31Bmp7TJsQYcsgVKU8BavDK4Au0w9m6oNWeJ4KzBvJdM01If5LaCB1_qklhxILjaoRbY4egoKuAommn_C4m42x_6eouLKPsSNHX_fMbddk_iohjZSOOB1h5bV1L40p_Fwn-yYclDc5WHzI8z-GXYgt4uGAXwY2_TtLfBaQewgpegZmudI8iZYmoJ4zus1-9zvZLSUMrdk7haSwjoNXG80z9ifBHwAg95AyR0CxD6OUwpTWyOsBcYNufLYbEoW3g_jXUUSOKKkAgTnseU4TMLl73IN9ZDYeC60hX2nfpQON3O-jOL5P028nePfkVgoVKT57sVQLk9V1MLOqEPHR44vDq_cqUiyYdZtrH4buuVc2NvAbVjis53Q7xJXlq8oDeRULwAnlz5tYpSevXJLp4N2OQRrPEqwXNKdQbpYs5N-kDbPZ_NZxZ8V-jy5eSmdF7htZw8X5hU94eFGUqxJE-_kv0h_J8V3d-tQ7D3j0lNuXpjSF1C6cy_Fqoz_U3SwhdI0dQJ_7H8ByIoGww"
const towerLastLink = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43E-fe67pni0N5sKxKas0X5RKp9xgCsgitgW0yhRsmkQsEzk8lhrs9yPIkji54MMhjz8NhuS9FNLVBq2ylWN1zFc0S6WBTfdsIayS_iMzOr0RbgX4pHIyjQbDiFXGdMBh4lFVKKeEvqGIJxRb0I-Qlk0dMjtyvQRXARTfJBqtLcHxIWK52Bwr1XF10vEgmdSl2uhoQKAVVa60fu7Z4sGbgLtCIggLl_TnHUa-3Es_cEJdbLTYEZPUiHUCnSoyfxFqcRJHr5APJHdCiCC4ptNc5YoGkrSc7kUhqNFJ7eRPjZOPC3z7zI-lXc2BWgjkBHhe5gvAmljKc7KmAtfPK7XpInPIiFs7E1qfDDmV-yJlmZdaNNTHNXqNJvfNPEOg_sJ3HOYwM9SOqYrWuEKItTNK77AGZ8a6rocf2D0Nvcg8i12bn8JHNke1bjtNN_M8AUuB-em0EIhCru0JUUVaUmektku_BR2yBEpRwFu8MrgG7DL1ZKo2ZInjncC0lUzTUB-Wt4AGXuuTWlIguVivFtni6JtXwJU30fwjFnazOQ4PFBVW9iFs7PTHnrndhsRHNbSRwgGvO7Sspva5OU3Hh2jPlIP8LvWbH2D2z7AjuV3UD-DD2Kbv0gKvFcSOUgqevnmOJG-CpcmJ57Res8_DTkZLKVNL5m4hKazTwPVW84T9ScAHMOgtFNwhQOjjNCU_tQ3CRmDYkKsSm01J_PthSleRBE4oqQDBldhyHEf-8nephnpIbLoU2sKhUz9Ih5slXwXx_J8m3s7x70jMFSrSfPdiKFd9FbWwM-rQ4ZHj2fGV64skGSfdxuq3oVvO-b313PolPtsJ_S5xZfma0kBK9TzQu3S_iUl89sotnY7a5RCsKVGC5ZLuDNKFmp30o7h5PpvPKvys0Gfv5oV0pcBdO7u_MK_oCfc3kmJDmngn_0X8Oym-u1vHYu8ZVyXl5rkpyhwKd-6lWBfhf4oOlilNU--HmheOKu0T2xvuz8MvvtgX1A"

const scenarios = [
    { name: "Append second Tower of Mana after Fox Rider", link, count: 37, last: "fox-rider", towerCount: 1, append: "tower-of-mana" },
    { name: "Append second Tower of Mana after Gilbert", link: gilbertLink, count: 36, last: "gilbert", towerCount: 1, append: "tower-of-mana" },
    { name: "Append Fox Rider after Gilbert", link: gilbertLink, count: 36, last: "gilbert", towerCount: 1, append: "fox-rider" },
    { name: "Delete final Tower of Mana", link: towerLastLink, count: 38, last: "tower-of-mana", towerCount: 2 },
]

function prepareScenario(scenario) {
    const { faction, buildOrder, opening, gameProfile } = parseShareableLink(scenario.link)
    assert.equal(faction, "light")
    assert.equal(buildOrder.length, scenario.count)
    assert.equal(buildOrder.at(-1).id, scenario.last)
    assert.equal(buildOrder.filter(item => item.id === "tower-of-mana").length, scenario.towerCount)

    const factionData = factions[faction]
    let changedBuild = buildOrder.slice(0, -1)
    if (scenario.append) {
        const item = factionData.items.find(item => item.id === scenario.append)
        assert(item)
        if (item.id === "tower-of-mana") assert.equal(item.construction?.preparationDuration ?? 0, 0)
        changedBuild = buildOrderWithDependencies(factionData, buildOrder, item)
        assert.equal(changedBuild.length, buildOrder.length + 1)
        assert.equal(changedBuild.at(-1), item)
    }

    const economy = economyFromProfile(gameProfile, opening)
    const initialFoodUsed = (economy.goldWorkers + economy.woodWorkers) * 2
    const args = [economy, initialFoodUsed, gameProfile.player.baseFoodLimit, economy.foodPerFarm, factionData.startingTownHall]
    return { buildOrder, changedBuild, args }
}

module.exports = { fixtures: [link, gilbertLink, towerLastLink, wargRider.link], runSuite(warmups, rounds) {
    return [...scenarios, wargRider].map(scenario => {
        const isWargRider = scenario === wargRider
        const { buildOrder, changedBuild, args } = isWargRider ? wargRider.prepare() : prepareScenario(scenario)
        if (isWargRider) return measureWargRider(buildOrder, changedBuild, args, warmups, rounds)
        const previous = simulateBuildOrder(buildOrder, ...args)
        assert(previous.plan.every(action => !action.blocked), scenario.name)
        const expected = simulateBuildOrder(changedBuild, ...args)
        assert.equal(expected.plan.length, changedBuild.length, scenario.name)
        assert(expected.plan.every(action => !action.blocked), scenario.name)
        const samples = []
        for (let index = 0; index < warmups + rounds; index++) {
            const start = performance.now()
            const result = simulateBuildOrder(changedBuild, ...args, { previous })
            const elapsed = performance.now() - start
            assert.deepEqual(result, expected, scenario.name)
            if (index >= warmups) samples.push(elapsed)
        }
        return { name: scenario.name, samples, summary: summarize(samples) }
    })
}, runWargRiderDiagnostic(resetWorkCounts) {
    const { buildOrder, changedBuild, args } = wargRider.prepare()
    const baselineSetup = resetWorkCounts()
    const previous = simulateBuildOrder(buildOrder, ...args)
    const addition = resetWorkCounts()
    const result = simulateBuildOrder(changedBuild, ...args, { previous })
    wargRider.assertResult(result)
    return { name: wargRider.name, summary: { baselineSetup, addition } }
} }

function measureWargRider(buildOrder, changedBuild, args, warmups, rounds) {
    const previous = simulateBuildOrder(buildOrder, ...args)
    assert(previous.plan.every(action => !action.blocked), wargRider.name)
    const expected = simulateBuildOrder(changedBuild, ...args)
    wargRider.assertResult(expected)
    const setupSamples = []
    const samples = []
    const combinedSamples = []
    for (let index = 0; index < warmups + rounds; index++) {
        const setupStart = performance.now()
        const setup = simulateBuildOrder(buildOrder, ...args)
        const setupMs = performance.now() - setupStart
        const appendStart = performance.now()
        const result = simulateBuildOrder(changedBuild, ...args, { previous })
        const appendMs = performance.now() - appendStart

        assert.deepEqual(setup, previous)
        assert.deepEqual(result, expected)
        wargRider.assertResult(result)
        if (index >= warmups) {
            setupSamples.push(setupMs)
            samples.push(appendMs)
            combinedSamples.push(setupMs + appendMs)
        }
    }
    return {
        name: wargRider.name,
        samples,
        summary: summarize(samples),
        setup: { samples: setupSamples, summary: summarize(setupSamples) },
        setupAndAppend: { samples: combinedSamples, summary: summarize(combinedSamples) },
    }
}

function summarize(samples) { const sorted = [...samples].sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1) } }
