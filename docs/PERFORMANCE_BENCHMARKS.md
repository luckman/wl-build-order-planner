# Performance benchmarks

Run `npm run benchmark` to measure all suites. Select suites with `--suite=dark`, `--suite=last`, or `--suite=middle` (repeat the option to select more than one). `--case=PREFIX` selects middle-action scenarios by name and requires the middle suite to be selected. For example:

```
npm run benchmark -- --suite=middle --quick --case=Insert
```

Full mode uses five warm-ups and 21 measured runs per scenario. `--quick` uses two warm-ups and seven runs for middle-action scenarios; other suites still use full mode. The command reports each suite's actual mode and sample counts. `--smoke` runs each selected suite once without warm-ups, retaining its correctness checks. Modes cannot be combined.

The Dark suite simulates every growing prefix from scratch. Its total is the sum of twelve simulation calls. The last- and middle-action suites time only the incremental simulation after an edit, supplying the same original result on every run. Fixture parsing, dependency expansion, reference calculations, and complete-result assertions happen outside the timer.

The last-action suite includes four Light edits and the [Dark Warg Rider addition](../benchmarks/warg-rider.txt). That scenario adds one Warg Rider to a 36-row build with a prepared Napalm Tower, Whip, and Legion's Call. The runner checks the full result against a checksum captured before checkpoint reuse was enabled for these scroll forecasts.

Run `npm run benchmark -- --work-counts` for a separate Warg Rider diagnostic. It reports public simulation calls, internal passes, resumed passes, and catalog rows processed for both the original-build setup and the addition. The runner adds counters during in-memory transpilation for this mode and saves the counts in a separate JSON result.

Successful runs are written to the gitignored `benchmark-results/` directory. JSON format version 1 includes the selected suites' fixture hashes (SHA-256), timestamp, Git revision and working-tree status (or null if unavailable), Node version, and machine details. Timing runs include raw samples and summaries. Work-count runs include setup and addition counts. Failed runs do not produce a result file. Older results are retained.

Run `node --test benchmarks/runner.test.cjs` to verify the benchmark command and its result files. The Warg Rider scenario can take several minutes in full mode. The runner measures simulation in Node. Browser rendering and worker messaging are outside its timing boundaries.
