const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const { parseShareableLink } = require('../src/game/shareableLink.ts')
const { simulateBuildOrder } = require('../src/game/buildSimulation.ts')
const { economyFromProfile } = require('../src/game/gameProfile.ts')
const { factions } = require('../src/game/gameData.ts')
const link = "#build=2.eJzFVl1v2jAU_S9-jlEI0Gm8rVT9kKg6ddX6MO3BOJdg4cTo2iFFiP--ayeUJG3HJk3aQ6X43E-fe67pni0N5sKxKas0X5RKp9xgCsgitgW0yhRsmkQsEzk8lhrs9yPIkji54MMhjz8NhuS9FNLVBq2ylWN1zFc0S6WBTfdsIayS_iMzOr0RbgX4pHIyjQbDiFXGdMBh4lFVKKeEvqGIJxRb0I-Qlk0dMjtyvQRXARTfJBqtLcHxIWK52Bwr1XF10vEgmdSl2uhoQKAVVa60fu7Z4sGbgLtCIggLl_TnHUa-3Es_cEJdbLTYEZPUiHUCnSoyfxFqcRJHr5APJHdCiCC4ptNc5YoGkrSc7kUhqNFJ7eRPjZOPC3z7zI-lXc2BWgjkBHhe5gvAmljKc7KmAtfPK7XpInPIiFs7E1qfDDmV-yJlmZdaNNTHNXqNJvfNPEOg_sJ3HOYwM9SOqYrWuEKItTNK77AGZ8a6rocf2D0Nvcg8i12bn8JHNke1bjtNN_M8AUuB-em0EIhCru0JUUVaUmektku_BR2yBEpRwFu8MrgG7DL1ZKo2ZInjncC0lUzTUB-Wt4AGXuuTWlIguVivFtni6JtXwJU30fwjFnazOQ4PFBVW9iFs7PTHnrndhsRHNbSRwgGvO7Sspva5OU3Hh2jPlIP8LvWbH2D2z7AjuV3UD-DD2Kbv0gKvFcSOUgqevnmOJG-CpcmJ57Res8_DTkZLKVNL5m4hKazTwPVW84T9ScAHMOgtFNwhQOjjNCU_tQ3CRmDYkKsSm01J_PthSleRBE4oqQDBldhyHEf-8nephnpIbLoU2sKhUz9Ih5slXwXx_J8m3s7x70jMFSrSfPdiKFd9FbWwM-rQ4ZHj2fGV64skGSfdxuq3oVvO-b313PolPtsJ_S5xZfma0kBK9TzQu3S_iUl89sotnY7a5RCsKVGC5ZLuDNKFmp30o7h5PpvPKvys0Gfv5oV0pcBdO7u_MK_oCfc3kmJDmngn_0X8Oym-u1vHYu8ZVyXl5rkpyhwKd-6lWBfhf4oOlilNU--HmheOKu0T2xvuz8MvvtgX1A"
const { faction, buildOrder, opening, gameProfile } = parseShareableLink(link)
assert.equal(faction, "light")
assert.equal(buildOrder.length, 38)
assert.equal(buildOrder.at(-1).id, "tower-of-mana")

const factionData = factions[faction]
const worker = factionData.items.find(item => item.id === "worker")
assert(worker)
const economy = economyFromProfile(gameProfile, opening)
const initialFoodUsed = (economy.goldWorkers + economy.woodWorkers) * 2
const args = [economy, initialFoodUsed, gameProfile.player.baseFoodLimit, economy.foodPerFarm, factionData.startingTownHall]

function row(order, number, id) {
    const item = order[number - 1]
    assert.equal(item.id, id, `Original row ${number}`)
    return item
}

const scenarios = [
    {
        name: "Insert Worker before Knight (35)",
        change(order) {
            row(order, 35, "knight")
            order.splice(34, 0, worker)
        },
    },
    {
        name: "Delete Knight (35)",
        change(order) {
            row(order, 35, "knight")
            order.splice(34, 1)
        },
    },
    {
        name: "Swap Altar and Sanctuary upgrades (31–32)",
        change(order) {
            const altar = row(order, 31, "altar-of-heroes-lvl-2")
            const sanctuary = row(order, 32, "sanctuary-lvl-2")
            order.splice(30, 2, sanctuary, altar)
        },
    },
    {
        name: "Edit Elven Tree preparation (13): 2.5 s → 4 s",
        change(order) {
            const item = row(order, 13, "elven-tree")
            assert.equal(item.construction.preparationDuration, 2.5)
            order[12] = { ...item, construction: { ...item.construction, preparationDuration: 4 } }
        },
    },
    {
        name: "Move Resources collected (28): 05:00 → 04:50",
        change(order) {
            const item = row(order, 28, "resources-collected")
            assert.equal(item.commandTime, 300)
            order[27] = { ...item, commandTime: 290 }
        },
    },
]

module.exports = { fixtures: [link], names: scenarios.map(s => s.name), runSuite(warmups, rounds, selection) {
    const selected = selection ? scenarios.filter(scenario => scenario.name.startsWith(selection)) : scenarios
    assert(selected.length, 'No matching benchmark case')
    const previous = simulateBuildOrder(buildOrder, ...args)
    assert(previous.plan.every(action => !action.blocked))
    return selected.map(scenario => {
        const changedBuild = [...buildOrder]
        scenario.change(changedBuild)
        const expected = simulateBuildOrder(changedBuild, ...args)
        assert.equal(expected.plan.length, changedBuild.length, scenario.name)
        assert.notDeepEqual(expected, previous, scenario.name)
        const samples = []
        for (let index = 0; index < warmups + rounds; index++) {
            const start = performance.now()
            const result = simulateBuildOrder(changedBuild, ...args, { previous })
            const elapsed = performance.now() - start
            assert.deepEqual(result, expected, scenario.name)
            if (index >= warmups) samples.push(elapsed)
        }
        const sorted = [...samples].sort((a, b) => a - b)
        return { name: scenario.name, samples, summary: { medianMs: sorted[Math.floor(sorted.length / 2)], minMs: sorted[0], maxMs: sorted.at(-1), blocked: expected.plan.filter(action => action.blocked).length } }
    })
} }
