# Build-order JSON files

The top Import / Export menu offers Export JSON, Import JSON, and the Include calculated timings option. The menu is also available on narrow screens and can be closed with Escape. Files include the selected faction, ordered action IDs (including duplicates and blocked actions), and the complete economy and food profile. Empty orders can be used to share a profile alone. Import replaces the current faction, order, and profile after validating the entire document.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 1. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

`gameProfile` contains `economy`, `baseFoodLimit`, and `foodPerFarm`. Economy includes starting resources, initial gold/wood worker assignments, per-trip yields, gathering/travel durations, and construction delay. Total workers and initial food usage are derived from assignments, rather than saved. Game-profile durations are simulation inputs and are always included.

`buildOrder` is an array of `{ "itemId": "worker" }` entries. Item IDs are resolved within the selected faction's current catalog. Unknown IDs reject the entire import; valid but unexecutable actions import unchanged and appear blocked. Import does not insert missing prerequisites or deduplicate actions.

The unchecked-by-default Include calculated timings option adds `timings` to each action, with `commandTime`, `startTime`, `finishTime`, and `workerReturnTime` in seconds. Blocked actions have null times; unit recruitment has no worker-return time. Import never reads or validates `timings`, even when malformed, and always recalculates the schedule.

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 1,000 actions, and 1,000 initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

`serializeBuildOrder` and `parseBuildOrder` are independent of browser file handling. Future shareable links can compress/encode the same JSON document (without timings) and decode it into the same import pipeline. No link encoding or URL behavior is implemented.
