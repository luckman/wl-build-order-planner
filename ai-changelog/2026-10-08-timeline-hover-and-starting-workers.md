# Timeline hover and starting workers — 2026-10-08

- Resource hover time now follows the mouse in 0.1-second increments, independently of chart rendering samples. Amounts are calculated from actual deliveries, spending, food reservations, and completed food buildings at the hovered timestamp.
- One tooltip shows the timestamp in seconds with one decimal, Gold, Wood, and Food used/limit. All three resource rows share the time marker and update their displayed amounts together.
- Removed Workers available and Initial food used controls. Starting worker count is the sum of initial gold miners and wood gatherers; each starting worker uses 2 food.
- Default initial assignments are 4 gold miners and 1 wood gatherer (5 workers, 10 food). Both assignment controls can be changed independently and accept whole worker counts.
- Tooltip placement stays inside the chart horizontally and below the hovered row.

## Verification

- Type checking and production build passed.
- All 3 tests passed, including a hover regression test for 10.9s versus the gold delivery at 11.0s, shared markers, default assignments, and recalculated starting food.
