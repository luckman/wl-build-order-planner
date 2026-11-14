const assert = require('node:assert/strict')

function resetWorkCounts() {
    return globalThis.benchmarkWorkCounts = { publicCalls: 0, internalPasses: 0, resumedPasses: 0, catalogRows: 0 }
}

function instrumentSimulation(source) {
    source = source.replaceAll('\r\n', '\n')
    const probes = [
        ['    const until = typeof options === "number"', 'globalThis.benchmarkWorkCounts.publicCalls++'],
        ['    const simulation = restored?.simulation', 'globalThis.benchmarkWorkCounts.internalPasses++; if (restored) globalThis.benchmarkWorkCounts.resumedPasses++'],
        ['        if (isTimedEvent(item)) continue\n        if (canCapture', 'globalThis.benchmarkWorkCounts.catalogRows++'],
    ]
    for (const [anchor, increment] of probes) {
        assert.equal(source.split(anchor).length, 2, `Expected one instrumentation point for ${increment}`)
        const rowBoundary = anchor.indexOf('\n')
        const index = source.indexOf(anchor) + (rowBoundary < 0 ? 0 : rowBoundary + 1)
        source = `${source.slice(0, index)}    ${increment}\n${source.slice(index)}`
    }
    return source
}

module.exports = { instrumentSimulation, resetWorkCounts }
