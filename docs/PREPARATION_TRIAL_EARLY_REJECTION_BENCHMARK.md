# Construction preparation trial rejection benchmark

Early rejection reduced median Warg Rider fresh setup from **4,354.298 ms to 893.045 ms (79.49%)**. The prepared Dark build’s twelve-prefix total fell from **1,003.919 ms to 251.382 ms (74.96%)**.

## Measurement

Both full suite runs used five warm-ups and 21 measured samples per scenario on Windows x64 with an Intel Core Ultra 9 275HX, Node 24.21.0, and TypeScript 4.9.5. The results record the exact revisions, working tree, timestamps, fixture hashes, and machine details. The fixture hashes and measurement settings match across runs.

```sh
npm run benchmark
npm run benchmark -- --work-counts
```

Each Dark total sums twelve fresh prefix simulations in a round. Edit timing uses the original result as input. The Warg Rider setup times a fresh 36-row solve. Setup plus append sums the two timed calls per round. The work-count diagnostic ran separately. [Benchmark protocol](PERFORMANCE_BENCHMARKS.md)

[Before samples](../benchmarks/evidence/preparation-trial-early-rejection/before-timings.json) · [After samples](../benchmarks/evidence/preparation-trial-early-rejection/after-timings.json) · [Before work counts](../benchmarks/evidence/preparation-trial-early-rejection/before-work-counts.json) · [After work counts](../benchmarks/evidence/preparation-trial-early-rejection/after-work-counts.json)

## Correctness

The baseline solver was `e5d18be` and the measured early-rejection solver was `221f35b`. The baseline source and timing harness had no changes. The independent verifier was untracked when the runner recorded baseline status. The optimized solver matched 331 complete public simulator results across 122 groups, including fixed events, worker losses, forecast changes, and repeated or branching reuse. Production build, typecheck, 744 Jest tests, four snapshots, and five benchmark command tests passed. [Independent reference hashes](../benchmarks/evidence/preparation-trial-early-rejection/reference-outputs.json) · [Output verifier](../benchmarks/evidence/verify-simulation-outputs.cjs)

## Results

The measured ranges for Warg Rider setup, setup plus append, and Dark build 2’s prefix total did not overlap with their baselines. Warg Rider setup still ran 816 internal passes and processed 2,682 catalog rows, down from 9,256. The incremental append still processed 78 rows. All benchmark medians ended below one second. The largest absolute median increase was 0.959 ms for the Elven Tree edit and the largest relative increase was 12.39% for Dark build 1 prefix 11. Both sample ranges overlapped their own baselines.


| Scenario | Before median [min–max], ms | After median [min–max], ms | Median change, ms | Change |
| --- | ---: | ---: | ---: | ---: |
| Dark build 1 prefix 1 (Slave) | 0.363 [0.254–0.786] | 0.378 [0.240–0.724] | +0.015 | +4.05% |
| Dark build 1 prefix 2 (Slave) | 0.496 [0.326–0.775] | 0.499 [0.332–0.544] | +0.004 | +0.73% |
| Dark build 1 prefix 3 (Sawmill) | 0.667 [0.458–0.956] | 0.658 [0.450–0.862] | −0.009 | −1.30% |
| Dark build 1 prefix 4 (Slave) | 0.863 [0.578–1.164] | 0.831 [0.579–5.213] | −0.031 | −3.62% |
| Dark build 1 prefix 5 (Slave) | 1.156 [0.784–1.636] | 1.129 [0.744–1.388] | −0.027 | −2.32% |
| Dark build 1 prefix 6 (Pigsty) | 1.261 [0.869–1.649] | 1.249 [0.853–1.627] | −0.012 | −0.94% |
| Dark build 1 prefix 7 (Slave) | 1.480 [1.055–2.072] | 1.494 [1.024–1.899] | +0.014 | +0.95% |
| Dark build 1 prefix 8 (Barracks) | 1.589 [1.108–2.931] | 1.581 [1.086–1.978] | −0.008 | −0.53% |
| Dark build 1 prefix 9 (Slave) | 1.878 [1.313–2.458] | 1.912 [1.285–2.337] | +0.034 | +1.82% |
| Dark build 1 prefix 10 (Citadel lvl 2) | 2.367 [1.784–3.370] | 2.555 [1.732–3.058] | +0.188 | +7.95% |
| Dark build 1 prefix 11 (Goblin Lab) | 3.560 [2.779–4.943] | 4.001 [2.771–5.225] | +0.441 | +12.39% |
| Dark build 1 prefix 12 (Tower of Mana) | 3.665 [2.842–4.739] | 3.635 [2.818–5.480] | −0.030 | −0.81% |
| Dark build 1 total | 19.210 [15.913–23.309] | 18.561 [15.692–23.249] | −0.649 | −3.38% |
| Dark build 2 prefix 1 (Slave) | 0.374 [0.256–0.574] | 0.374 [0.248–0.751] | +0.001 | +0.16% |
| Dark build 2 prefix 2 (Slave) | 0.474 [0.333–0.592] | 0.481 [0.325–0.608] | +0.007 | +1.44% |
| Dark build 2 prefix 3 (Sawmill) | 6.155 [4.527–7.741] | 4.294 [3.181–5.294] | −1.860 | −30.23% |
| Dark build 2 prefix 4 (Slave) | 8.441 [5.586–10.208] | 4.336 [3.415–6.967] | −4.105 | −48.63% |
| Dark build 2 prefix 5 (Slave) | 12.718 [11.022–15.283] | 4.857 [3.779–8.137] | −7.860 | −61.81% |
| Dark build 2 prefix 6 (Pigsty) | 39.476 [34.614–55.614] | 19.162 [16.167–24.654] | −20.314 | −51.46% |
| Dark build 2 prefix 7 (Slave) | 46.807 [41.598–60.935] | 20.053 [17.271–25.951] | −26.754 | −57.16% |
| Dark build 2 prefix 8 (Barracks) | 70.297 [63.467–82.239] | 31.009 [28.307–39.126] | −39.288 | −55.89% |
| Dark build 2 prefix 9 (Slave) | 95.647 [89.191–115.460] | 34.041 [30.697–47.076] | −61.606 | −64.41% |
| Dark build 2 prefix 10 (Citadel lvl 2) | 141.435 [133.845–171.154] | 37.570 [33.090–47.504] | −103.865 | −73.44% |
| Dark build 2 prefix 11 (Goblin Lab) | 275.435 [257.567–316.804] | 47.463 [44.608–61.239] | −227.972 | −82.77% |
| Dark build 2 prefix 12 (Tower of Mana) | 287.514 [264.667–353.261] | 51.260 [46.430–63.777] | −236.254 | −82.17% |
| Dark build 2 total | 1,003.919 [932.342–1,162.645] | 251.382 [241.335–302.294] | −752.538 | −74.96% |
| Append second Tower of Mana after Fox Rider | 1.606 [1.259–2.276] | 1.593 [1.257–3.455] | −0.013 | −0.80% |
| Append second Tower of Mana after Gilbert | 0.963 [0.724–1.547] | 0.969 [0.735–1.444] | +0.006 | +0.68% |
| Append Fox Rider after Gilbert | 1.019 [0.911–5.458] | 0.977 [0.922–2.138] | −0.041 | −4.05% |
| Delete final Tower of Mana | 0.903 [0.868–1.472] | 0.942 [0.889–1.477] | +0.039 | +4.27% |
| Warg Rider fresh setup | 4,354.298 [4,265.612–4,514.034] | 893.045 [872.638–906.046] | −3,461.253 | −79.49% |
| Warg Rider append | 35.937 [32.972–42.235] | 35.127 [34.195–39.758] | −0.810 | −2.25% |
| Warg Rider setup plus append | 4,389.900 [4,302.339–4,552.868] | 928.396 [906.933–940.750] | −3,461.504 | −78.85% |
| Insert Worker before Knight (35) | 10.579 [9.245–14.327] | 11.295 [9.144–14.800] | +0.717 | +6.78% |
| Delete Knight (35) | 8.721 [7.278–11.822] | 8.274 [7.160–9.666] | −0.447 | −5.12% |
| Swap Altar and Sanctuary upgrades (31–32) | 11.821 [10.975–13.508] | 11.824 [10.950–14.580] | +0.003 | +0.02% |
| Edit Elven Tree preparation (13): 2.5 s → 4 s | 42.324 [40.278–47.580] | 43.284 [41.353–49.735] | +0.959 | +2.27% |
| Move Resources collected (28): 05:00 → 04:50 | 25.096 [22.372–29.698] | 24.643 [21.710–28.687] | −0.453 | −1.80% |

| Warg Rider operation | Public calls | Internal passes | Resumed passes | Catalog rows processed |
| --- | ---: | ---: | ---: | ---: |
| Fresh setup | 1 → 1 | 816 → 816 | 802 → 812 | 9,256 → 2,682 |
| Append | 1 → 1 | 6 → 6 | 4 → 4 | 78 → 78 |
