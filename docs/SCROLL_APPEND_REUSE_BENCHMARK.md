# Scroll append reuse benchmark

Run these commands sequentially on the same machine and Node version for each solver revision.

```sh
npm run benchmark
npm run benchmark -- --work-counts
```

Full timing mode uses five warm-ups and 21 measured rounds per scenario. In the Warg Rider scenario, each round measures a fresh 36-row setup and an append using the same original result throughout the run. Setup plus append is the sum of the two timed calls in each round. The runner parses the fixture, expands dependencies, and compares complete outputs outside the timers. These Node simulation measurements exclude worker messaging and browser rendering.

The benchmark checks the [exact Dark build](../benchmarks/warg-rider.txt) with a five-second Napalm Tower preparation, Whip, and Legion's Call. Its SHA-256 is `ad72da1bbb2ac9db835c11cab06df5b8f6a38775b0ad96354257760c9012b0c4`. Dependency expansion adds only Warg Rider. The baseline solver matches the [complete original output](../benchmarks/evidence/forecast-checkpoint-reuse/warg-rider-original.json), independently captured before forecast-local checkpoint reuse. The Warg Rider command is at 429.1082608695654 seconds and the finish is at 470.6882608695654 seconds.

The pre-change [forecast regression tests](../src/game/buildSimulationForecasts.test.ts) preserve complete outputs for same-time preparation and timed commands, unavailable actions, changed Legion's Call targets, and a preparation candidate at a mine exit. The [preparation append tests](../src/game/preparationAppend.test.ts) and [edit replay tests](../src/game/buildSimulationEdits.test.ts) cover existing non-scroll replay, including changes that invalidate earlier preparation decisions.

## Item 1 solver baseline

The baseline solver revision is `f55b43ff974205dfaf16dbaff2b0fd6e210b3db4`. The working tree carried the updated harness and benchmark documentation. From this feature's benchmark revision, inspect the harness changes with `git diff f55b43ff HEAD -- benchmarks/last.cjs benchmarks/run.cjs benchmarks/runner.test.cjs`. The baseline used Node 24.21.0 and TypeScript 4.9.5 on Windows x64 10.0.26300 with an Intel Core Ultra 9 275HX, 24 logical CPUs, and 33,752,997,888 bytes of RAM.

| Warg Rider scenario | Median (ms) | Minimum (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: |
| 36-row setup | 4,624.055 | 4,400.812 | 5,055.094 |
| Append | 5,723.694 | 5,472.940 | 6,377.496 |
| Setup plus append | 10,414.470 | 9,925.667 | 11,398.329 |

| Operation | Public calls | Internal passes | Resumed passes | Catalog rows processed |
| --- | ---: | ---: | ---: | ---: |
| 36-row setup | 1 | 816 | 802 | 9,256 |
| Append | 1 | 816 | 800 | 10,112 |

[Raw baseline timings for all suites](../benchmarks/evidence/scroll-append-reuse/before-timings.json) · [Raw baseline work counts](../benchmarks/evidence/scroll-append-reuse/before-work-counts.json) · [Complete 36-row baseline output](../benchmarks/evidence/scroll-append-reuse/warg-rider-setup.json)
