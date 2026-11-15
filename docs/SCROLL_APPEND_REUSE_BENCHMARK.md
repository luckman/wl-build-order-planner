# Scroll append reuse benchmark

The median Warg Rider append fell from **5,723.694 ms to 37.696 ms**, a reduction of **5,685.998 ms (99.34%)**. Including the 36-row setup, the median fell from **10,414.470 ms to 4,770.745 ms (54.19%)**.

## Reproduce

Run these commands sequentially on the same machine and Node version for each solver revision.

```sh
npm run benchmark
npm run benchmark -- --work-counts
```

Full timing mode uses five warm-ups and 21 measured rounds per scenario. In the Warg Rider scenario, each round measures a fresh 36-row setup and an append using the same original result throughout the run. Setup plus append is the sum of the two timed calls in each round. The runner parses the fixture, expands dependencies, and compares complete outputs outside the timers. These Node simulation measurements exclude worker messaging and browser rendering.

The fixture has 36 Dark rows, including a five-second Napalm Tower preparation, Whip, and Legion's Call. The SHA-256 of its trimmed share-link payload is `ad72da1bbb2ac9db835c11cab06df5b8f6a38775b0ad96354257760c9012b0c4`. Dependency expansion adds only Warg Rider. All fixture hashes match between runs. [Shared build fixture](../benchmarks/warg-rider.txt)

- The baseline solver was `f55b43ff974205dfaf16dbaff2b0fd6e210b3db4`. The working tree carried the harness changes committed as `0637ab34f1456fde11b09aacd28c94d48693737b` and benchmark documentation. That commit can reproduce the baseline with the same harness.
- The optimized solver was `2cc1a51aade7cf81484226a46d07e0e29de1efac`, measured with a clean working tree.
- Both runs used Node 24.21.0 and TypeScript 4.9.5 on Windows x64 10.0.26300 with an Intel Core Ultra 9 275HX, 24 logical CPUs, and 33,752,997,888 bytes of RAM. The harness transpiles in memory to CommonJS targeting ES2017 with `esModuleInterop`.

To inspect the harness and solver changes, run these commands.

```sh
git diff f55b43ff 0637ab3 -- benchmarks/last.cjs benchmarks/run.cjs benchmarks/runner.test.cjs
git diff 0637ab3 2cc1a51 -- src/game/buildSimulation.ts
```

## Warg Rider timings and work counts

| Operation | Solver | Median (ms) | Minimum (ms) | Maximum (ms) | Median change |
| --- | --- | ---: | ---: | ---: | ---: |
| 36-row setup | Baseline | 4,624.055 | 4,400.812 | 5,055.094 | |
| 36-row setup | Verified reuse | 4,733.130 | 4,544.509 | 5,236.303 | +109.075 ms (+2.36%) |
| Append | Baseline | 5,723.694 | 5,472.940 | 6,377.496 | |
| Append | Verified reuse | 37.696 | 36.611 | 52.818 | −5,685.998 ms (−99.34%) |
| Setup plus append | Baseline | 10,414.470 | 9,925.667 | 11,398.329 | |
| Setup plus append | Verified reuse | 4,770.745 | 4,581.624 | 5,275.668 | −5,643.725 ms (−54.19%) |

The setup timer includes recording the new metadata. Its sample ranges overlap and its work counts are identical. The solver retains private evidence for up to eight forecast iterations, with a size limit per iteration. The diagnostic instrumented Node's in-memory transpilation in a separate process and was excluded from the timing samples.

| Operation | Solver | Public calls | Internal passes | Resumed passes | Catalog rows processed |
| --- | --- | ---: | ---: | ---: | ---: |
| 36-row setup | Baseline | 1 | 816 | 802 | 9,256 |
| 36-row setup | Verified reuse | 1 | 816 | 802 | 9,256 |
| Append | Baseline | 1 | 816 | 800 | 10,112 |
| Append | Verified reuse | 1 | 6 | 4 | 78 |

[Baseline timing samples](../benchmarks/evidence/scroll-append-reuse/before-timings.json) · [Optimized timing samples](../benchmarks/evidence/scroll-append-reuse/after-timings.json) · [Baseline work counts](../benchmarks/evidence/scroll-append-reuse/before-work-counts.json) · [Optimized work counts](../benchmarks/evidence/scroll-append-reuse/after-work-counts.json)

## Correctness

Both solvers matched the independent original checksum and each timed append matched a fresh solve, including the plan, chronological plan, blocked reasons, and deliveries. The harness also compared the original result against a fresh setup after each append. The added Warg Rider remained unblocked, with command time **429.1082608695654 s** and finish time **470.6882608695654 s**. [Independent 37-row output](../benchmarks/evidence/forecast-checkpoint-reuse/warg-rider-original.json) · [Complete 36-row baseline output](../benchmarks/evidence/scroll-append-reuse/warg-rider-setup.json)

Focused tests check complete results for consecutive and branching appends, simultaneous preparation and fixed commands, Whip and Legion's Call separately and together, pending casts and target changes, blocked appends, and changed inputs. The worker test covers cloned consecutive requests and stable row IDs. [Forecast tests](../src/game/buildSimulationForecasts.test.ts) · [Worker test](../src/game/buildOrderSimulation.worker.test.ts) · [Non-scroll preparation tests](../src/game/preparationAppend.test.ts) · [Edit replay tests](../src/game/buildSimulationEdits.test.ts)

The production build, typecheck, 744 Jest tests across 46 suites, four snapshots, and five benchmark runner tests passed.

## Existing workloads

The Dark suite values sum twelve fresh-prefix simulations per build. Each Light value is one edit simulation. The timings below are medians from the full runs.

| Scenario | Baseline (ms) | Verified reuse (ms) | Change (ms) |
| --- | ---: | ---: | ---: |
| Dark build 1 | 20.410 | 17.753 | −2.657 |
| Dark build 2 | 1,052.052 | 1,025.221 | −26.831 |
| Append second Tower of Mana after Fox Rider | 1.743 | 1.680 | −0.062 |
| Append second Tower of Mana after Gilbert | 0.987 | 0.845 | −0.142 |
| Append Fox Rider after Gilbert | 0.972 | 0.842 | −0.130 |
| Delete final Tower of Mana | 0.915 | 0.759 | −0.156 |
| Insert Worker before Knight | 12.440 | 12.670 | +0.229 |
| Delete Knight | 8.665 | 9.468 | +0.803 |
| Swap Altar and Sanctuary upgrades | 14.029 | 12.677 | −1.352 |
| Edit Elven Tree preparation | 46.460 | 62.781 | +16.321 |
| Move Resources collected | 27.530 | 29.213 | +1.683 |

The Elven Tree preparation edit had the largest increase in the full run. Two follow-up pairs used the full middle suite, with execution order baseline, optimized, optimized, baseline. The Elven Tree median changed from 58.538 to 58.746 ms in the first pair and from 60.848 to 59.081 ms in the second. The sample ranges overlapped in both pairs. Each middle-action case that was slower in the full run was faster in at least one follow-up pair. These runs showed no consistent slowdown.

For the follow-up, extract `git archive --format=tar 0637ab3` into `benchmark-results/scroll-append-baseline` under the optimized checkout at `2cc1a51`. The archive can resolve the checkout's `node_modules`. Run `node benchmarks/run.cjs --suite=middle` from the archive root for baseline runs and the checkout root for optimized runs, in the order above. Set `GIT_CEILING_DIRECTORIES` to the absolute path of `benchmark-results` for baseline runs so Git stops before reaching the enclosing checkout. The raw results record the archive revision alongside the runner output. [Follow-up timing samples](../benchmarks/evidence/scroll-append-reuse/middle-follow-up.json)
