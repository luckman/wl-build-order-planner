const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { parseShareableLink } = require('../src/game/shareableLink.ts')
const { economyFromProfile } = require('../src/game/gameProfile.ts')
const { buildOrderWithDependencies, factions } = require('../src/game/gameData.ts')

const link = readFileSync(join(__dirname, 'warg-rider.txt'), 'utf8').trim()
const name = 'Append Warg Rider to Dark build with Whip and Legion’s Call'

function prepare() {
    assert.equal(createHash('sha256').update(link).digest('hex'), 'ad72da1bbb2ac9db835c11cab06df5b8f6a38775b0ad96354257760c9012b0c4')
    const { faction, buildOrder, opening, gameProfile } = parseShareableLink(link)
    assert.equal(faction, 'dark')
    assert.equal(buildOrder.length, 36)
    assert.deepEqual(buildOrder.filter(item => (item.construction?.preparationDuration ?? 0) > 0)
        .map(item => [item.id, item.construction.preparationDuration]), [['napalm-tower', 5]])
    assert.deepEqual(buildOrder.filter(item => item.kind === 'scroll').map(item => item.scrollId).sort(), ['legions-call', 'whip'])

    const factionData = factions[faction]
    const rider = factionData.items.find(item => item.id === 'warg-rider')
    assert(rider)
    const changedBuild = buildOrderWithDependencies(factionData, buildOrder, rider)
    assert.equal(changedBuild.length, 37)
    assert(buildOrder.every((item, index) => changedBuild[index] === item))
    assert.equal(changedBuild.at(-1), rider)

    const economy = economyFromProfile(gameProfile, opening)
    const initialFoodUsed = (economy.goldWorkers + economy.woodWorkers) * 2
    return { buildOrder, changedBuild, args: [economy, initialFoodUsed, gameProfile.player.baseFoodLimit, economy.foodPerFarm, factionData.startingTownHall] }
}

function assertRider(result) {
    assert.equal(result.plan.length, 37)
    const rider = result.plan.at(-1)
    assert.equal(rider.item.id, 'warg-rider')
    assert.equal(rider.blocked, false)
    assert(Math.abs(rider.commandTime - 429.1082608695654) < 1e-9)
    assert(Math.abs(rider.finishTime - 470.6882608695654) < 1e-9)
}

function assertResult(result) {
    assertRider(result)
    const serialized = JSON.stringify(result, (_, value) => value === undefined ? { $undefined: true } : value)
    // Complete output captured on 977948b before changing the solver.
    assert.equal(createHash('sha256').update(serialized).digest('hex'), '4557f6c354fad630df72b688cf6f2c16d2f94171c039f247f6aa3e4859670b0c')
}

module.exports = { name, link, prepare, assertResult }
