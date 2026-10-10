# Build-order drag reordering

- Added drag handles with mouse, touch, and keyboard support, stable identities for repeated action occurrences, drag feedback, and a vertical list at all viewport sizes.
- Successful drops update the action sequence and replay the complete existing simulation, refreshing timings, costs, dependencies, production queues, resource/food charts, and warnings. Cancelled and unchanged drops preserve the plan.
- Missing earlier prerequisites and producers are detected before waiting, preventing those invalid actions from consuming the simulation horizon and blocking otherwise schedulable later rows. Invalid rows keep their position and show the existing warning presentation.
- Updated the game rules version because dependency failure handling changes calculated results; JSON and shared links retain their existing format and exact action order.
- Added simulation regressions for both factions and browser tests for mouse/keyboard moves, warning recovery, repeated actions, and cancellation on a narrow viewport.
- Validation: production build and typecheck passed; all 228 unit tests and all 9 Chromium browser tests passed.
