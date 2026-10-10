# Build-order JSON files

Export JSON uses the browser's native Save As picker for directory and filename selection, with the faction's default filename suggested and JSON as the file type. The browser can remember the last export directory. Cancelling does not save or download a file. This API requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers use their normal download behavior and browser save-location preferences. No custom filename dialog is shown. Save failures produce a visible error.

The top Import / Export menu offers Export JSON, Import JSON, and the Include calculated timings option. The menu is also available on narrow screens and can be closed with Escape. Files include the selected faction, ordered action IDs (including duplicates and blocked actions), and the complete economy and food profile. Empty orders can be used to share a profile alone. Import replaces the current faction, order, and profile after validating the entire document.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 1. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

`gameProfile` contains four blocks:

- `basic`: `goldGatherTime`, `woodGatherTime`, `initialGoldTravelReduction`.
- `map`: `goldWorkers`, `woodWorkers`, `goldTravelTime`, `woodTravelTime`, `sawmillWoodTravelTime`.
- `player`: `startingGold`, `startingWood`, `baseFoodLimit`, `townHallLevel`, `sawmillLevel`, `farmLevel`, `barracksLevel`, `industrialBuildingLevel`, `arcaneBuildingLevel`, `workerLevel`.
- `delays`: `constructionStartDelay`, `orderDelay`.

`goldTravelTime` and `woodTravelTime` each apply to both outbound and return trips (default 4 seconds each way). They replace the separate outbound/return fields. Initial gold travel reduction and Sawmill overrides still apply. These travel fields retain their existing behavior.

All durations are in seconds. `orderDelay` defaults to 1 and controls the first build-order command and the gathering commands for the second and later initial wood workers. It also delays commands until that many seconds after their recruitment building, prerequisites, and required building capacity become available. These completion delays overlap, can elapse while other work continues, and do not repeat between recruits. Initial gold workers and the first initial wood gatherer start immediately. `initialGoldTravelReduction` defaults to 1; it shortens only the initial gold workers' opening outbound trip, clamped at zero travel. `sawmillWoodTravelTime` defaults to 0.5 and resets wood travel in both directions when a Sawmill completes. Travel grows by a fixed 0.5 seconds per full minute afterward, capped at 4 seconds; travel underway is unchanged. These growth/cap mechanics remain current game rules rather than profile fields.

Total workers and initial food usage are derived from the map's assignments, rather than saved. Game-profile durations are simulation inputs and are always included. The current profile uses format version 1 and game-rules revision `2026-10-10.6`; files must use the new grouped shape. The previous flat economy shape is not migrated.

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
    "baseFoodLimit": 20,
    "townHallLevel": 1,
    "sawmillLevel": 1,
    "farmLevel": 1,
    "barracksLevel": 1,
    "industrialBuildingLevel": 1,
    "arcaneBuildingLevel": 1,
    "workerLevel": 1
  },
  "delays": {
    "constructionStartDelay": 4,
    "orderDelay": 1
  }
}
```

All seven player levels default to 1 and must be integers from 1 to 24. Every four-level tier (1–4, 5–8, 9–12, 13–16, 17–20, 21–24) increases town-hall gold and Sawmill wood yields through 50/51/52/53/54/55, and Farm/Pigsty food through 20/21/22/23/24/25. Town halls, Barracks, industrial buildings, and arcane buildings reduce recruitment duration by 1%/2%/3%/4%/5%/6%. Worker level reduces construction and building-upgrade duration by 0%/1%/2%/3%/4%/5% across the same tiers, without changing builder travel; unrelated producers receive no bonus. Player progression is independent of in-match building upgrades.

Gold/wood yields and food per Farm/Pigsty are derived runtime values, omitted from exported profiles. Imports require all seven levels; older profiles missing workerLevel or containing only direct yields must be updated. Obsolete yield fields are ignored when valid level fields are present. Factory/Workshop and Sanctuary/Dark Gate production mappings are ready for future catalog entries; their game stats remain unimplemented.

Resource collection appears below the timeline. The main four-column UI shows player fields and an initial worker-allocation slider, without a group heading, plus a read-only summary of derived gold/wood yields and Farm/Pigsty food. Action-card hover details display effective recruitment, construction, and upgrade durations after applying the corresponding player bonus. Level labels and the derived food summary use the selected faction’s building names; persisted level field names stay faction-neutral. The slider sets goldWorkers from 0 to 5 and woodWorkers to 5 minus goldWorkers. Imported assignments are preserved until the slider is moved, with a visible note for totals other than five. Advanced reveals map travel and delays fields, also without group headings; Hide advanced collapses them while retaining values. Basic fields have no UI controls, but are preserved through JSON import/export and used by simulation. Starting wood defaults to 50.

`buildOrder` is an array of `{ "itemId": "worker" }` entries. Item IDs are resolved within the selected faction's current catalog. Unknown IDs reject the entire import; valid but unexecutable actions import unchanged and appear blocked. Import does not insert missing prerequisites or deduplicate actions.

The unchecked-by-default Include calculated timings option adds `timings` to each action, with `commandTime`, `startTime`, `finishTime`, and `workerReturnTime` in seconds. Blocked actions have null times; unit recruitment has no worker-return time. Import never reads or validates `timings`, even when malformed, and always recalculates the schedule.

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 1,000 actions, and 1,000 initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

## Shareable links

Save shareable link in the Import / Export menu copies a URL containing the current faction, exact action sequence, and complete profile. Timings are always omitted, regardless of the JSON export checkbox. Successful copying closes the menu and shows a notice. If clipboard access fails, the menu stays open with the link selected for manual copying.

Open the copied URL in a browser to restore the build order and profile automatically. Changes to the URL fragment in an already-open planner also load the new shared order. Imports reuse JSON validation and current catalog/simulation rules; saved timings are ignored. Different game-rules revisions warn without blocking. Invalid or unsupported links display an error and leave the current plan intact. Unrelated URL fragments are ignored.

Links use the current page's origin, path, and query, with `#build=1.<payload>` as the fragment. The payload is the compact JSON document compressed with zlib (the existing pako dependency), then encoded as URL-safe base64 without padding. The prefix versions the link encoding independently of the unchanged JSON format and game-rules revisions. No hosting service or server storage is involved. Recipients need access to the same planner address; localhost links require their own reachable planner at that address.

Generated URLs are limited to 16,000 characters; larger orders should use JSON files. Decoding also bounds the compressed payload and decompressed JSON size before running the existing validator. `serializeBuildOrder` and `parseBuildOrder` remain shared by both file and link transports.
