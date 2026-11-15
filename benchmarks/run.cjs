const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { instrumentSimulation, resetWorkCounts } = require('./work-counts.cjs')
const root = path.resolve(__dirname, '..')
try {
    const options = { suites: [], quick: false, smoke: false, case: null, workCounts: false }
    for (const arg of process.argv.slice(2)) {
        if (arg === '--quick') options.quick = true
        else if (arg === '--smoke') options.smoke = true
        else if (arg === '--work-counts') options.workCounts = true
        else if (arg.startsWith('--suite=') && ['dark', 'last', 'middle'].includes(arg.slice(8))) options.suites.push(arg.slice(8))
        else if (arg.startsWith('--case=') && arg.slice(7) && options.case === null) options.case = arg.slice(7)
        else throw Error(`Unknown benchmark argument: ${arg}`)
    }
    if (options.quick && options.smoke) throw Error('Conflicting modes: --quick and --smoke')
    if (!options.suites.length) options.suites = options.workCounts ? ['last'] : ['dark', 'last', 'middle']
    options.suites = [...new Set(options.suites)]
    if (options.workCounts && (options.quick || options.smoke || options.case || options.suites.some(name => name !== 'last'))) {
        throw Error('--work-counts runs only the Warg Rider diagnostic')
    }
    if (options.case && !options.suites.includes('middle')) throw Error('--case requires the middle suite')
    const ts = require('typescript')
    require.extensions['.ts'] = (module, filename) => {
        let source = fs.readFileSync(filename, 'utf8')
        if (options.workCounts && filename === path.join(root, 'src', 'game', 'buildSimulation.ts')) {
            source = instrumentSimulation(source)
        }
        const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, esModuleInterop: true } })
        module._compile(outputText, filename)
    }
    const suites = options.suites.map(name => ({ name, module: require(`./${name}.cjs`) }))
    if (options.case && !suites.find(s => s.name === 'middle').module.names.some(name => name.startsWith(options.case))) throw Error(`No matching benchmark case: ${options.case}`)
    const results = []
    for (const { name, module: suite } of suites) {
        const mode = options.workCounts ? 'work-counts' : options.smoke ? 'smoke' : options.quick && name === 'middle' ? 'quick' : 'full'
        const warmups = options.workCounts || mode === 'smoke' ? 0 : mode === 'quick' ? 2 : 5
        const rounds = options.workCounts || mode === 'smoke' ? 1 : mode === 'quick' ? 7 : 21
        console.log(`${name}: ${mode}, ${warmups} warmups, ${rounds} measured runs per scenario`)
        const scenarios = options.workCounts ? [suite.runWargRiderDiagnostic(resetWorkCounts)] : suite.runSuite(warmups, rounds, options.case)
        for (const scenario of scenarios) {
            console.log(scenario.name)
            if (scenario.summary.actionMediansMs) console.table(scenario.summary.actionMediansMs)
            console.log(scenario.summary)
            if (scenario.setup) {
                console.log('Original-build setup', scenario.setup.summary)
                console.log('Setup plus append', scenario.setupAndAppend.summary)
            }
        }
        results.push({ name, mode, warmups, rounds, fixtureHashes: suite.fixtures.map(value => crypto.createHash('sha256').update(value).digest('hex')), scenarios })
    }
    const git = (...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return null } }
    const status = git('status', '--porcelain')
    const result = { formatVersion: 1, timestamp: new Date().toISOString(), revision: git('rev-parse', 'HEAD'), workingTree: status === null ? null : { dirty: Boolean(status), status }, node: process.version, typescript: ts.version, machine: { platform: os.platform(), arch: os.arch(), release: os.release(), cpu: os.cpus()[0]?.model, cpus: os.cpus().length, memoryBytes: os.totalmem() }, suites: results }
    const dir = path.join(root, 'benchmark-results')
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${result.timestamp.replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}.json`)
    const temporary = `${file}.tmp`
    try {
        fs.writeFileSync(temporary, JSON.stringify(result, null, 2), { flag: 'wx' })
        fs.renameSync(temporary, file)
    } catch (error) {
        try { fs.unlinkSync(temporary) } catch {}
        throw error
    }
    console.log(`Saved ${file}`)
} catch (error) { console.error(error.stack || error); process.exitCode = 1 }
