# Forecast checkpoint reuse benchmark

## Warg Rider addition

Reusing preparation checkpoints within each Whip and Legion's Call forecast reduced the median Node simulation time by **2,967.377 ms (36.71%)**. The highest optimized sample was below the lowest original sample.

| Solver | Median (ms) | Minimum (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: |
| Original | 8,082.407 | 7,633.825 | 8,673.443 |
| Forecast checkpoint reuse | 5,115.030 | 5,014.142 | 5,322.938 |

The fixture has 36 Dark rows, including a Napalm Tower with five seconds of preparation, Whip, and Legion's Call. Its SHA-256 is `ad72da1bbb2ac9db835c11cab06df5b8f6a38775b0ad96354257760c9012b0c4`. Dependency expansion adds only Warg Rider. The timer covers one changed-build `simulateBuildOrder` call with the same 36-row result supplied as `previous` each time. Fixture parsing, dependency expansion, the original-build simulation, output assertions, worker messaging, and browser rendering happen outside the measured interval. [Share-link fragment](../benchmarks/warg-rider.txt)

The timed runs and the separate diagnostic matched the complete original output, including the plan, chronological plan, and deliveries. The added rider remained unblocked, with command time **429.1082608695654 s** and finish time **470.6882608695654 s**. Four public simulation snapshots captured from the original solver also passed. They cover same-time events and preparation, blocked actions, changed scroll windows and producer targets, and the mine-exit boundary used during candidate collection. The tests check source row identity and the prior result after a changed call. [Complete original output](../benchmarks/evidence/forecast-checkpoint-reuse/warg-rider-original.json)

## Work counts

The diagnostic counts each public simulation call, each internal pass, each pass that restores a snapshot, and each catalog row the pass processes. Fixed events are processed separately by the simulator. The addition processed **13,552 fewer catalog rows (57.27%)** with the same number of passes.

| Operation | Solver | Public calls | Internal passes | Resumed passes | Catalog rows processed |
| --- | --- | ---: | ---: | ---: | ---: |
| Warg Rider addition | Original | 1 | 816 | 0 | 23,664 |
| Warg Rider addition | Forecast checkpoint reuse | 1 | 816 | 800 | 10,112 |
| 36-row setup | Original | 1 | 816 | 0 | 22,848 |
| 36-row setup | Forecast checkpoint reuse | 1 | 816 | 802 | 9,256 |

## Existing benchmarks

The Dark values are the median of the sums of twelve fresh-prefix calls. Each Light value is the median of one edit simulation. The complete timings and per-action breakdowns for the Dark builds are in the raw results.

| Scenario | Before (ms) | After (ms) | Median change (ms) |
| --- | ---: | ---: | ---: |
| Dark build 1 | 17.112 | 16.452 | −0.660 |
| Dark build 2 | 947.897 | 928.933 | −18.963 |
| Append second Tower of Mana after Fox Rider | 1.643 | 1.603 | −0.040 |
| Append second Tower of Mana after Gilbert | 1.007 | 0.796 | −0.211 |
| Append Fox Rider after Gilbert | 1.075 | 0.960 | −0.115 |
| Delete final Tower of Mana | 0.904 | 0.896 | −0.008 |
| Insert Worker before Knight | 9.401 | 9.452 | +0.051 |
| Delete Knight | 8.276 | 8.313 | +0.037 |
| Swap Altar and Sanctuary upgrades | 11.649 | 12.812 | +1.164 |
| Edit Elven Tree preparation | 46.996 | 40.492 | −6.504 |
| Move Resources collected | 23.316 | 24.761 | +1.444 |

The swap and resource-event move had higher medians in the full run and overlapping sample ranges. Two follow-up pairs reran the complete middle-action suite, alternating an archive of `fe2eb63` with the optimized working tree. The upgrade swap moved from 14.614 to 14.761 ms in the first pair and from 15.598 to 14.322 ms in the second. The resource-event move went from 29.535 to 29.427 ms and from 30.214 to 30.606 ms. Both differences changed direction between the pairs. The Light fixtures use the existing cross-call history path. [Follow-up raw samples](../benchmarks/evidence/forecast-checkpoint-reuse/middle-follow-up.json)

## Reproduce

Run these commands sequentially on each revision using the same Node and dependencies. Full mode uses five warm-ups and 21 measured runs per scenario. The work-count command adds probes during transpilation and runs the Warg Rider scenario separately.

```sh
npm run benchmark
npm run benchmark -- --work-counts
npm run benchmark -- --suite=middle
```

- Original solver `977948b834f6e26049d59b1bc14a4d546e69bcc4`. The raw baseline was recorded on that revision with the benchmark harness changes later committed as `fe2eb6312b0ef8fd013dbcf1526efcbd40413693`, which can reproduce the baseline with the original solver. [Raw baseline timings](../benchmarks/evidence/forecast-checkpoint-reuse/before-timings.json) · [Raw baseline work counts](../benchmarks/evidence/forecast-checkpoint-reuse/before-work-counts.json)
- Optimized solver `4d37d4d2b3425509501f2fe24779cad3195a5764`. Both runs used a clean working tree. [Raw optimized timings](../benchmarks/evidence/forecast-checkpoint-reuse/after-timings.json) · [Raw optimized work counts](../benchmarks/evidence/forecast-checkpoint-reuse/after-work-counts.json)
- Environment for both revisions was Node v24.21.0 and TypeScript 4.9.5 on Windows x64 10.0.26300 with an Intel Core Ultra 9 275HX, 24 logical CPUs, and 33,752,997,888 bytes of RAM. The runner transpiles TypeScript in memory to CommonJS targeting ES2017 with `esModuleInterop`. Raw results include the environment, Git metadata, and fixture hashes for each suite.

To inspect the benchmark harness and solver changes, respectively, run:

```sh
git diff 977948b fe2eb63 -- benchmarks/run.cjs benchmarks/last.cjs benchmarks/warg-rider.cjs benchmarks/warg-rider.txt benchmarks/work-counts.cjs
git diff fe2eb63 4d37d4d -- src/game/buildSimulation.ts
```

Verification passed for `npm run build`, `npm run typecheck`, and `npm run testAll -- --runInBand --silent` (735 tests across 45 suites, four snapshots). The benchmark runner's five command tests also passed.
