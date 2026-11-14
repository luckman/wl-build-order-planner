const assert = require("node:assert/strict")
const { performance } = require("node:perf_hooks")
const { parseShareableLink } = require("../src/game/shareableLink.ts")
const { simulateBuildOrder } = require("../src/game/buildSimulation.ts")
const { economyFromProfile } = require("../src/game/gameProfile.ts")
const { factions } = require("../src/game/gameData.ts")
const links = [
    "#build=2.eJyFU01v4kAM_S9zThCkpStx21K1RaLqqq2Ww6oHkzhhhJOJPJNmEeK_ryfDV4pWHJDw8_NH3vNsVW64BKcmqqV42WjKYsMZsorUF7LVplKTJFIFlPjWENrfB1Alw-QuHo3i4Y_BSNg5pC4kMuC1CiW_2OSaUE22aglWp_5PYSh7ArdC_tClpG4Go0i1xvTAUeJRXWmngZ6k4oPhC-kNs2Y_RtJOqPfoWsTqPWVDZAUe7iJVQn2YFOpC09tBMg6jemikLLSlJlp8ywwHF_RZlTKCxXv5ecKNH_b3e-FYdqgJNiKjrGEdsNNV4T9DFhwPoyPkC4UuiMiDjxLNdanFjeSM9AIViEzjQPLRnuTrSBcr5zu_NXY1R1mhk6aD5025RA6ySp9T1ju0WOm6j8yxEGXtFIhOiVLG_UzTpmwI9sIPA_rIpvTLLLAT_s5v3LkwNbKOaaszs7oSa6fS3nEAp8a6PsPb9SKWV4VXsZ_zLvwv52TWc2_pvZ8nIAcuT9ESmCFd2xOiq6yRzeTW7v0T6IkFnEKFl3hreI3cV-rDtOeQFY03wNlZMxJTX_NnZIPH-XItGcq5WH8t6ZlG7_4CHnxK_I9U9zD34WgnVd17fe2e6-TPVrlNLccnM8ik4DAOG1oVpF3so8ntLtoq7bCcye0pS3K36ioUFL3Ou4RqXVi3uUo7mHKVmGoHIldMXxQn8m3ngnkBa8YauDvWh4bheCaNxVlGGGRQkxzI4q7XuTBL0lVMsOxPdN7V2OSxt1jtPnf_AJKszR4",
    "#build=2.eJy1U9tq20AQ_Zd9loytxCn4rXbIBRxSElM_lD6MpZG8ZKQVs6uoxvjfO6v1TQml0CYPBu-ZyxmdObNVueESnJqoluJVoymLDWfIKlKvyFabSk2SSBVQ4lNDaL8fQJUMk6t4NIqHXwYjyc4hdSGQAb-oUPKNTa4J1WSrVmB16v8UhrJbcGvkhS4ldDEYRao1pgeOEo_qSjsNdCsVC4ZXpCfMmj2NhJ2kTtG1iNVzyobICjzcRaqE-sAU6kLTy0EyDlQ9NFIW2lITLd9EhoN36fdVyggWp_LzCRee7NfbwrHMUBNsREYZwzpgp6vCf4YMOB5GR8gXSrogIg_eyGuuSy3bSM6SHqACkWkckvxrn-TrSBdr5zs_NXY9Rxmhk6aD5025Qg6ySp9T1G9oudZ1H5ljIcraGRCdAqXQfU3TpmwI9sIPA3rDpvTDLLET_spP3G1hZmQc01Zny-pKrJ1Je8cBnBnr-hl-XQ-y8qrwKvZjfgt_ijnhuusNvd_nCciBy9NrBcyQvtgToquskcnEa1N_Aj2xgFOo8D3eGn5B7iu1MO05ZEXjDXB21oxkqY_5HbLBI7-4JUOxi_VuSc80evYOuPYh2X-kusPcP0c7qeru9bE718mPrXKbWswnHGRScBiHCa0K0i73r8nlLtoq7bC8F-8pS-Jb9VcoKCqtzufz89aMNXDnjeuG4XicjcX7jDCwqkkOZHH3D8y1LqzbfDbxwRKfzZNqB7LrmF4pTj6UrDAr0lVMsPrQts47OjZ57O39351_7n4DrRJCEw",
]

const builds = links.map(link => {
    const { faction, buildOrder, opening, gameProfile } = parseShareableLink(link)
    assert.equal(buildOrder.length, 12)
    const economy = economyFromProfile(gameProfile, opening)
    const initialFoodUsed = (economy.goldWorkers + economy.woodWorkers) * 2
    return {
        buildOrder,
        simulationArgs: [
            economy, initialFoodUsed, gameProfile.player.baseFoodLimit,
            economy.foodPerFarm, factions[faction].startingTownHall,
        ],
    }
})

function run({ buildOrder, simulationArgs }) {
    const actions = []
    const timings = []
    for (const action of buildOrder) {
        actions.push(action)
        const start = performance.now()
        const { plan } = simulateBuildOrder(actions, ...simulationArgs)
        const elapsed = performance.now() - start
        timings.push(elapsed)
        assert.equal(plan.length, actions.length)
        assert.equal(plan.filter(entry => entry.blocked).length, 0)
    }
    return { timings, total: timings.reduce((sum, elapsed) => sum + elapsed, 0) }
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return (sorted[middle] + sorted[Math.ceil(sorted.length / 2) - 1]) / 2
}

module.exports = { fixtures: links, runSuite(warmups, rounds) {
    const samples = builds.map(() => [])
    for (let round = 0; round < warmups + rounds; round++) {
        for (const index of round % 2 === 0 ? [0, 1] : [1, 0]) {
            const result = run(builds[index])
            if (round >= warmups) samples[index].push(result)
        }
    }
    return samples.map((runs, index) => ({ name: 'Build ' + (index + 1), samples: runs,
        summary: { actionMediansMs: builds[index].buildOrder.map((action, step) => ({ action: action.name, median: median(runs.map(run => run.timings[step])) })),
            totalMedianMs: median(runs.map(run => run.total)), totalMinMs: Math.min(...runs.map(run => run.total)), totalMaxMs: Math.max(...runs.map(run => run.total)) } }))
} }
