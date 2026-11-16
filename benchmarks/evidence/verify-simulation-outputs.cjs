// Run separately from timing and work-count measurements.
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync, writeFileSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const ts = require('typescript')

const [mode, referencePath] = process.argv.slice(2)
assert(['capture', 'verify'].includes(mode) && referencePath,
    'Usage: node benchmarks/evidence/verify-simulation-outputs.cjs capture|verify REFERENCE.json')

require.extensions['.ts'] = (module, filename) => {
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true },
    })
    module._compile(outputText, filename)
}

function hashOutput(output) {
    const json = JSON.stringify(output, (_, value) => {
        if (value === undefined) return { $undefined: true }
        if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) {
            return { $number: Object.is(value, -0) ? '-0' : String(value) }
        }
        return value
    })
    return createHash('sha256').update(json).digest('hex')
}

const simulation = require('../../src/game/buildSimulation.ts')
const simulate = simulation.simulateBuildOrder
const outputs = {}
let group
simulation.simulateBuildOrder = (...args) => {
    const result = simulate(...args)
    outputs[group].push(hashOutput(result))
    return result
}

for (const suite of ['dark', 'last', 'middle']) {
    group = `benchmark/${suite}`
    outputs[group] = []
    require(`../${suite}.cjs`).runSuite(0, 1)
}

// Exercise the existing synchronous boundary and reuse cases through the
// public simulator. The separate full Jest run verifies the actual test suite.
const matcher = require('expect')
globalThis.expect = matcher.default ?? matcher
const { SnapshotState, toMatchSnapshot } = require('jest-snapshot')
expect.extend({ toMatchSnapshot })
const runTest = (name, test, args = []) => {
    group = `test/${name}`
    assert(!Object.hasOwn(outputs, group), group)
    outputs[group] = []
    expect.setState({ currentTestName: name })
    test(...args)
    if (!outputs[group].length) delete outputs[group]
}
globalThis.test = (name, test) => runTest(name, test)
globalThis.test.each = rows => (name, test) => rows.forEach((row, index) =>
    runTest(`${name} [${index}]`, test, Array.isArray(row) ? row : [row]))

for (const file of ['preparation', 'preparationAppend', 'buildSimulationEdits', 'buildSimulationForecasts',
    'constructionOrderDelay', 'resourceOrderDelay', 'resourceProjection', 'resourcesCollected', 'workerEvents', 'unitsKilled']) {
    const snapshotPath = path.join(__dirname, '../../src/game/__snapshots__', `${file}.test.ts.snap`)
    expect.setState({ snapshotState: new SnapshotState(snapshotPath, { updateSnapshot: 'none' }) })
    require(`../../src/game/${file}.test.ts`)
}

if (mode === 'capture') {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
    writeFileSync(referencePath, JSON.stringify({
        revision: git('rev-parse', 'HEAD'),
        sourceDiff: git('diff', 'HEAD', '--', 'src'),
        node: process.version, typescript: ts.version, outputs,
    }, null, 2) + '\n', { flag: 'wx' })
} else {
    const reference = JSON.parse(readFileSync(referencePath, 'utf8'))
    assert.deepEqual(Object.keys(outputs), Object.keys(reference.outputs))
    for (const [name, hashes] of Object.entries(outputs)) assert.deepEqual(hashes, reference.outputs[name], name)
}
console.log(`${mode}: ${Object.values(outputs).flat().length} complete simulator outputs across ${Object.keys(outputs).length} groups`)
