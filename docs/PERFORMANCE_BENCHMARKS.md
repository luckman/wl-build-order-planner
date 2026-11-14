# Performance benchmarks

Run `npm run benchmark` to measure all suites. Select suites with `--suite=dark`, `--suite=last`, or `--suite=middle` (repeat the option to select more than one). `--case=PREFIX` selects middle-action scenarios by name and requires the middle suite to be selected. For example:

```
npm run benchmark -- --suite=middle --quick --case=Insert
```

Full mode uses five warm-ups and 21 measured runs per scenario. `--quick` uses two warm-ups and seven runs for middle-action scenarios; other suites still use full mode. The command reports each suite's actual mode and sample counts. `--smoke` runs each selected suite once without warm-ups, retaining its correctness checks. Modes cannot be combined.

The Dark suite simulates every growing prefix from scratch. Its total is the sum of twelve simulation calls. The Light suites time only the incremental simulation after an edit, using a previous result; the original and fresh reference simulations and complete-result comparison are outside the timer. These timings measure different operations.

Successful runs are written to the gitignored `benchmark-results/` directory. JSON format version 1 includes SHA-256 hashes of the shared-link fixtures, raw timings and summaries, sample counts, timestamp, Git revision and working-tree status (or null if unavailable), Node version and machine details. Timings are machine-specific. Failed runs do not produce a result file; older results are retained.

Run `node --test benchmarks/runner.test.cjs` to verify the benchmark command and its result files.
