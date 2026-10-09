# Build-order JSON files

Export JSON uses the browser's native Save As picker for directory and filename selection, with the faction's default filename suggested and JSON as the file type. The browser can remember the last export directory. Cancelling does not save or download a file. This API requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers use their normal download behavior and browser save-location preferences. No custom filename dialog is shown. Save failures produce a visible error.

The top Import / Export menu offers Export JSON, Import JSON, and the Include calculated timings option. The menu is also available on narrow screens and can be closed with Escape. Files include the selected faction, ordered action IDs (including duplicates and blocked actions), and the complete economy and food profile. Empty orders can be used to share a profile alone. Import replaces the current faction, order, and profile after validating the entire document.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 1. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

`gameProfile` contains four blocks:

- `basic`: `goldGatherTime`, `woodGatherTime`, `initialGoldTravelReduction`.
- `map`: `goldWorkers`, `woodWorkers`, `goldTravelTime`, `woodTravelTime`, `sawmillWoodTravelTime`.
- `player`: `startingGold`, `startingWood`, `goldPerTrip`, `woodPerTrip`, `baseFoodLimit`, `foodPerFarm`.
- `delays`: `constructionStartDelay`, `initialOrderDelay`.

`goldTravelTime` and `woodTravelTime` each apply to both outbound and return trips (default 4 seconds each way). They replace the separate outbound/return fields. Initial gold travel reduction and Sawmill overrides still apply. Format and game-rules versions remain unchanged.

All durations are in seconds. `initialOrderDelay` defaults to 1 and controls the first build-order command and the gathering commands for the second and later initial wood workers. Initial gold workers and the first initial wood gatherer start immediately. `initialGoldTravelReduction` defaults to 1; it shortens only the initial gold workers' opening outbound trip, clamped at zero travel. `sawmillWoodTravelTime` defaults to 0.5 and resets wood travel in both directions when a Sawmill completes. Travel grows by a fixed 0.5 seconds per full minute afterward, capped at 4 seconds; travel underway is unchanged. These growth/cap mechanics remain current game rules rather than profile fields.

Total workers and initial food usage are derived from the map's assignments, rather than saved. Game-profile durations are simulation inputs and are always included. This refactor keeps format version 1 and game-rules revision `2026-10-09.1` as requested; files must use the new grouped shape. The previous flat economy shape is not migrated.

Example profile using the current defaults:

```json
{
  "basic": {
    "goldGatherTime": 3.1,
    "woodGatherTime": 12.1,
    "initialGoldTravelReduction": 1
  },
  "map": {
    "goldWorkers": 4,
    "woodWorkers": 1,
    "goldTravelTime": 4,
    "woodTravelTime": 4,
    "sawmillWoodTravelTime": 0.5
  },
  "player": {
    "startingGold": 150,
    "startingWood": 50,
    "goldPerTrip": 50,
    "woodPerTrip": 50,
    "baseFoodLimit": 20,
    "foodPerFarm": 20
  },
  "delays": {
    "constructionStartDelay": 4,
    "initialOrderDelay": 1
  }
}
```

Resource collection appears below the timeline. The UI shows only player fields initially, without a group heading. Advanced reveals map and delays fields, also without group headings; Hide advanced collapses them while retaining values. Basic fields have no UI controls, but are preserved through JSON import/export and used by simulation. Starting wood defaults to 50.

`buildOrder` is an array of `{ "itemId": "worker" }` entries. Item IDs are resolved within the selected faction's current catalog. Unknown IDs reject the entire import; valid but unexecutable actions import unchanged and appear blocked. Import does not insert missing prerequisites or deduplicate actions.

The unchecked-by-default Include calculated timings option adds `timings` to each action, with `commandTime`, `startTime`, `finishTime`, and `workerReturnTime` in seconds. Blocked actions have null times; unit recruitment has no worker-return time. Import never reads or validates `timings`, even when malformed, and always recalculates the schedule.

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 1,000 actions, and 1,000 initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

## Shareable links

Save shareable link in the Import / Export menu copies a URL containing the current faction, exact action sequence, and complete profile. Timings are always omitted, regardless of the JSON export checkbox. Successful copying closes the menu and shows a notice. If clipboard access fails, the menu stays open with the link selected for manual copying.

Open the copied URL in a browser to restore the build order and profile automatically. Changes to the URL fragment in an already-open planner also load the new shared order. Imports reuse JSON validation and current catalog/simulation rules; saved timings are ignored. Different game-rules revisions warn without blocking. Invalid or unsupported links display an error and leave the current plan intact. Unrelated URL fragments are ignored.

Links use the current page's origin, path, and query, with `#build=1.<payload>` as the fragment. The payload is the compact JSON document compressed with zlib (the existing pako dependency), then encoded as URL-safe base64 without padding. The prefix versions the link encoding independently of the unchanged JSON format and game-rules revisions. No hosting service or server storage is involved. Recipients need access to the same planner address; localhost links require their own reachable planner at that address.

Generated URLs are limited to 16,000 characters; larger orders should use JSON files. Decoding also bounds the compressed payload and decompressed JSON size before running the existing validator. `serializeBuildOrder` and `parseBuildOrder` remain shared by both file and link transports.
