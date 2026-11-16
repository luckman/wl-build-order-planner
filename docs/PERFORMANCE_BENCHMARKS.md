# Performance benchmarks

Run `npm run benchmark` to measure all suites. Select suites with `--suite=dark`, `--suite=last`, or `--suite=middle` (repeat the option to select more than one). `--case=PREFIX` selects middle-action scenarios by name and requires the middle suite to be selected. For example:

```
npm run benchmark -- --suite=middle --quick --case=Insert
```

Full mode uses five warm-ups and 21 measured runs per scenario. `--quick` uses two warm-ups and seven runs for middle-action scenarios; other suites still use full mode. The command reports each suite's actual mode and sample counts. `--smoke` runs each selected suite once without warm-ups, retaining its correctness checks. Modes cannot be combined.

The Dark suite simulates every growing prefix from scratch. Its total is the sum of twelve simulation calls. The last- and middle-action suites time the incremental simulation after an edit, supplying the same original result on every run. Fixture parsing, dependency expansion, reference calculations, and complete-result assertions happen outside the timers.

The last-action suite includes four Light edits and the [Dark Warg Rider addition](../benchmarks/warg-rider.txt). That scenario adds one Warg Rider to a 36-row build with a prepared Napalm Tower, Whip, and Legion's Call. Each round times a fresh 36-row setup, then times the append with the same original result used for all rounds. Setup includes any simulator metadata captured during the call. Setup plus append sums the two intervals in each round. The runner compares complete results to fresh solves and checks the appended result against a checksum captured before checkpoint reuse was enabled for these scroll forecasts.

Run `npm run benchmark -- --work-counts` for a separate Warg Rider diagnostic. It reports public simulation calls, internal passes, resumed passes, and catalog rows processed for both the original-build setup and the addition. The runner adds counters during in-memory transpilation for this mode and saves the counts in a separate JSON result.

Successful runs are written to the gitignored `benchmark-results/` directory. JSON format version 1 includes the selected suites' fixture hashes (SHA-256), timestamp, Git revision and working-tree status (or null if unavailable), Node and TypeScript versions, and machine details. For Warg Rider, the top-level `samples` and `summary` in the scenario describe append latency. `setup` and `setupAndAppend` each contain their own raw samples and summary. Work-count runs include setup and addition counts. Failed runs do not produce a result file. Older results are retained.

Run `node --test benchmarks/runner.test.cjs` to verify the benchmark command and its result files. The Warg Rider scenario can take several minutes in full mode. The runner measures simulation in Node. Browser rendering and worker messaging are outside its timing boundaries.

Before-and-after timings, work counts, and raw samples are available for Warg Rider and the existing suites. [Forecast checkpoint reuse comparison](FORECAST_CHECKPOINT_BENCHMARK.md)

The scroll append reuse comparison reports setup and append timings against the completed forecast checkpoint solver, along with reduced replay work and follow-up measurements of existing workloads. [Scroll append reuse benchmark](SCROLL_APPEND_REUSE_BENCHMARK.md)

The preparation trial rejection comparison includes each Dark prefix, all edit timings, and Warg Rider setup, append, and replay work. [Preparation trial rejection benchmark](PREPARATION_TRIAL_EARLY_REJECTION_BENCHMARK.md)
