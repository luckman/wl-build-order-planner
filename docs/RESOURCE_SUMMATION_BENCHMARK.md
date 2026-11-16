# Resource summation benchmark

Resource summation reduced median Warg Rider fresh setup from **904.651 ms to 673.000 ms (25.61%)** and its append from **35.853 ms to 26.245 ms (26.80%)**. The prepared Dark build’s twelve-prefix total fell from **271.040 ms to 228.948 ms (15.53%)**.

## Measurement

Both full suite runs used five warm-ups and 21 measured samples per scenario on Windows x64 with an Intel Core Ultra 9 275HX, Node 24.21.0, and TypeScript 4.9.5. The results record the exact revisions, working tree, timestamps, fixture hashes, and machine details. The fixture hashes and measurement settings match across runs.

```sh
npm run benchmark
npm run benchmark -- --work-counts
```

Each Dark total sums twelve fresh prefix simulations in a round. Edit timing uses the original result as input. The Warg Rider setup times a fresh 36-row solve. Setup plus append sums the two timed calls per round. The work-count diagnostic ran separately. [Benchmark protocol](PERFORMANCE_BENCHMARKS.md)

[Before samples](../benchmarks/evidence/resource-summation-performance/before-timings.json) · [After samples](../benchmarks/evidence/resource-summation-performance/after-timings.json) · [Before work counts](../benchmarks/evidence/resource-summation-performance/before-work-counts.json) · [After work counts](../benchmarks/evidence/resource-summation-performance/after-work-counts.json)

## Correctness

The fresh baseline used `f1bf104`, which includes the completed early-rejection change. Its independent reference also records the new test for same-time fractional deliveries. The optimized solver at `d3a7b71` matched all 332 complete outputs across 123 groups. Every shared group also matched the original pre-optimization reference. Production build, typecheck, 745 Jest tests, and four snapshots passed. [Independent reference hashes](../benchmarks/evidence/resource-summation-performance/reference-outputs.json) · [Output verifier](../benchmarks/evidence/verify-simulation-outputs.cjs)

To reproduce the complete-output check from the optimized revision, run the verifier separately from the timing suite.

```sh
node benchmarks/evidence/verify-simulation-outputs.cjs verify benchmarks/evidence/resource-summation-performance/reference-outputs.json
```

## Results

All baseline medians were under one second, so the comparison focuses on the slowest remaining workloads. The Warg Rider setup, append, and combined sample ranges were entirely below their respective baselines. The Warg Rider work counts were identical. Three already-fast Light edits had higher medians by 0.086–0.204 ms, with overlapping sample ranges. Every Dark prefix median and middle-action median improved.

| Scenario | Before median [min–max], ms | After median [min–max], ms | Median change, ms | Change |
| --- | ---: | ---: | ---: | ---: |
| Dark build 1 prefix 1 (Slave) | 0.397 [0.252–1.128] | 0.373 [0.241–0.619] | −0.024 | −6.02% |
| Dark build 1 prefix 2 (Slave) | 0.492 [0.334–0.649] | 0.486 [0.324–0.835] | −0.006 | −1.20% |
| Dark build 1 prefix 3 (Sawmill) | 0.661 [0.443–1.361] | 0.645 [0.434–1.258] | −0.016 | −2.36% |
| Dark build 1 prefix 4 (Slave) | 0.832 [0.569–0.963] | 0.829 [0.552–1.177] | −0.003 | −0.32% |
| Dark build 1 prefix 5 (Slave) | 1.102 [0.760–1.514] | 1.051 [0.728–1.451] | −0.051 | −4.58% |
| Dark build 1 prefix 6 (Pigsty) | 1.215 [0.855–1.528] | 1.167 [0.804–1.644] | −0.049 | −4.00% |
| Dark build 1 prefix 7 (Slave) | 1.505 [1.021–2.333] | 1.364 [0.952–1.990] | −0.141 | −9.35% |
| Dark build 1 prefix 8 (Barracks) | 1.584 [1.064–2.010] | 1.341 [1.015–1.720] | −0.242 | −15.31% |
| Dark build 1 prefix 9 (Slave) | 1.876 [1.297–2.488] | 1.669 [1.200–2.215] | −0.208 | −11.06% |
| Dark build 1 prefix 10 (Citadel lvl 2) | 2.468 [1.840–4.703] | 2.251 [1.597–2.705] | −0.218 | −8.82% |
| Dark build 1 prefix 11 (Goblin Lab) | 3.827 [2.715–6.788] | 3.419 [2.446–4.197] | −0.408 | −10.66% |
| Dark build 1 prefix 12 (Tower of Mana) | 3.756 [2.785–4.694] | 3.353 [2.464–4.002] | −0.402 | −10.71% |
| Dark build 1 total | 19.219 [16.301–23.942] | 16.631 [13.572–20.713] | −2.589 | −13.47% |
| Dark build 2 prefix 1 (Slave) | 0.388 [0.247–0.439] | 0.376 [0.242–0.456] | −0.012 | −3.02% |
| Dark build 2 prefix 2 (Slave) | 0.501 [0.322–0.867] | 0.481 [0.325–0.605] | −0.019 | −3.88% |
| Dark build 2 prefix 3 (Sawmill) | 4.233 [3.136–5.043] | 4.108 [2.908–6.860] | −0.125 | −2.96% |
| Dark build 2 prefix 4 (Slave) | 4.622 [3.378–5.699] | 4.325 [3.106–5.782] | −0.297 | −6.42% |
| Dark build 2 prefix 5 (Slave) | 5.520 [4.037–7.135] | 4.717 [3.463–7.941] | −0.803 | −14.55% |
| Dark build 2 prefix 6 (Pigsty) | 20.258 [17.469–24.999] | 17.053 [14.752–20.988] | −3.206 | −15.82% |
| Dark build 2 prefix 7 (Slave) | 19.905 [17.341–26.790] | 17.761 [14.712–21.273] | −2.144 | −10.77% |
| Dark build 2 prefix 8 (Barracks) | 33.111 [28.664–40.593] | 28.140 [25.303–34.607] | −4.970 | −15.01% |
| Dark build 2 prefix 9 (Slave) | 36.091 [30.018–48.480] | 29.788 [25.146–41.135] | −6.303 | −17.47% |
| Dark build 2 prefix 10 (Citadel lvl 2) | 38.887 [35.114–45.901] | 33.645 [30.069–43.591] | −5.242 | −13.48% |
| Dark build 2 prefix 11 (Goblin Lab) | 52.329 [47.621–63.483] | 43.151 [38.824–50.559] | −9.178 | −17.54% |
| Dark build 2 prefix 12 (Tower of Mana) | 53.578 [49.280–64.553] | 46.022 [41.132–54.547] | −7.556 | −14.10% |
| Dark build 2 total | 271.040 [249.218–313.225] | 228.948 [214.945–259.315] | −42.092 | −15.53% |
| Append second Tower of Mana after Fox Rider | 1.642 [1.391–2.456] | 1.426 [1.113–2.644] | −0.216 | −13.17% |
| Append second Tower of Mana after Gilbert | 0.855 [0.813–1.628] | 1.032 [0.952–1.684] | +0.177 | +20.69% |
| Append Fox Rider after Gilbert | 0.842 [0.788–2.145] | 1.047 [0.914–4.540] | +0.204 | +24.28% |
| Delete final Tower of Mana | 0.783 [0.726–1.331] | 0.868 [0.651–1.384] | +0.086 | +10.92% |
| Warg Rider fresh setup | 904.651 [866.064–1,002.055] | 673.000 [654.236–746.194] | −231.651 | −25.61% |
| Warg Rider append | 35.853 [33.415–43.578] | 26.245 [24.740–29.830] | −9.608 | −26.80% |
| Warg Rider setup plus append | 943.562 [900.042–1,042.706] | 702.304 [679.862–774.832] | −241.258 | −25.57% |
| Insert Worker before Knight (35) | 11.629 [8.946–13.412] | 8.845 [7.527–10.201] | −2.783 | −23.93% |
| Delete Knight (35) | 9.073 [7.994–11.163] | 6.214 [5.361–7.272] | −2.860 | −31.52% |
| Swap Altar and Sanctuary upgrades (31–32) | 12.663 [10.818–14.567] | 8.854 [7.688–11.074] | −3.808 | −30.07% |
| Edit Elven Tree preparation (13): 2.5 s → 4 s | 45.885 [42.725–51.680] | 33.703 [31.465–42.520] | −12.182 | −26.55% |
| Move Resources collected (28): 05:00 → 04:50 | 24.097 [22.063–31.322] | 19.321 [16.863–27.865] | −4.777 | −19.82% |

| Warg Rider operation | Public calls | Internal passes | Resumed passes | Catalog rows processed |
| --- | ---: | ---: | ---: | ---: |
| Fresh setup | 1 → 1 | 816 → 816 | 812 → 812 | 2,682 → 2,682 |
| Append | 1 → 1 | 6 → 6 | 4 → 4 | 78 → 78 |
