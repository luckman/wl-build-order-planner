# Build-order JSON files

Export JSON uses the browser's native Save As picker for directory and filename selection, with the faction's default filename suggested and JSON as the file type. The browser can remember the last export directory. Cancelling does not save or download a file. This API requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers use their normal download behavior and browser save-location preferences. No custom filename dialog is shown. Save failures produce a visible error.

The top Import / Export menu offers Export JSON, Import JSON, and the Include calculated timings option. The menu is also available on narrow screens and can be closed with Escape. Files include the selected faction, ordered action IDs (including duplicates and blocked actions), and the complete economy and food profile. Empty orders can be used to share a profile alone. Import selects the imported faction and replaces its order and profile after validating the entire document, preserving the other faction's draft and settings.

Resource profiles and build-order drafts are saved independently per faction in browser local storage (`wl-resource-profile-v2-*` and `wl-build-draft-v2-*`). Drafts contain the opening allocation and catalog action IDs and survive reloads. Import replaces and saves both for its faction after full validation. Reset to defaults resets only the resource profile; the opening allocation remains. Clear restores the default opening split (up to 4 gold miners) and removes subsequent actions for the active faction. Invalid profiles or drafts fall back independently; unavailable storage leaves editing usable in memory. Existing version 1 browser profiles migrate their gold assignment into the opening action, preserving other settings. Version 1 files and links are not migrated.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 2. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

`gameProfile` contains four blocks:

- `basic`: `goldGatherTime`, `woodGatherTime`, `initialGoldTravelReduction`.
- `map`: `goldTravelTime`, `woodTravelTime`, `sawmillWoodTravelTime`.
- `player`: `startingGold`, `startingWood`, `baseFoodLimit`, `townHallLevel`, `sawmillLevel`, `farmLevel`, `barracksLevel`, `industrialBuildingLevel`, `arcaneBuildingLevel`, `workerLevel`.
- `delays`: `constructionStartDelay`, `orderDelay`.

`goldTravelTime` and `woodTravelTime` each apply to both outbound and return trips (default 4 seconds each way). They replace the separate outbound/return fields. Initial gold travel reduction and Sawmill overrides still apply. These travel fields retain their existing behavior.

All durations are in seconds. `orderDelay` defaults to 1 and controls the first build-order command and the gathering commands for the second and later initial wood workers. It also delays commands until that many seconds after their recruitment building, prerequisites, and required building capacity become available. These completion delays overlap, can elapse while other work continues, and do not repeat between recruits. Initial gold workers and the first initial wood gatherer start immediately. `initialGoldTravelReduction` defaults to 1; it shortens only the initial gold workers' opening outbound trip, clamped at zero travel. `sawmillWoodTravelTime` defaults to 0.5 and resets wood travel in both directions when a Sawmill completes. Travel grows by a fixed 0.5 seconds per full minute afterward, capped at 4 seconds; travel underway is unchanged. These growth/cap mechanics remain current game rules rather than profile fields.

Every game starts with five workers, defined by a game-rule constant rather than a profile field. The opening action stores goldWorkers (0–5); wood gatherers are 5 minus goldWorkers and initial food usage is always 10. Obsolete startingWorkers fields in imported or stored profiles are ignored and removed when parsed. Game-profile durations remain simulation inputs. The current JSON format version is 2; unsupported schema versions are rejected.

Example profile using the current defaults:

```json
{
  "basic": {
    "goldGatherTime": 3.1,
    "woodGatherTime": 12.1,
    "initialGoldTravelReduction": 1
  },
  "map": {
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

Resource collection appears below the timeline, with starting resources, food limit, and player levels in the main grid. Advanced reveals travel and delay inputs; hidden Basic fields are preserved by imports and exports. The allocation slider lives in a fixed opening action at the top of Build order, ranges from 0 to 5 in whole workers, and cannot be removed or dragged. Moving it changes the build without changing the resource profile.

`buildOrder` begins with exactly one `{ "type": "allocate-workers", "goldWorkers": 4 }` entry, followed by `{ "itemId": "worker" }` catalog entries. The opening is required even when there are no subsequent actions. Missing, repeated, misplaced, fractional, negative, or oversized allocations reject the whole import. Item IDs are resolved within the selected faction's current catalog. Unknown IDs reject the entire import; valid but unexecutable actions import unchanged and appear blocked. Import does not insert missing prerequisites or deduplicate actions.

The unchecked-by-default Include calculated timings option adds `timings` to each catalog action (the opening allocation has no cached timings), with `commandTime`, `startTime`, `finishTime`, and `workerReturnTime` in seconds. Blocked actions have null times; unit recruitment has no worker-return time. Import never reads or validates `timings`, even when malformed, and always recalculates the schedule.

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 1,000 catalog actions plus the opening allocation, and five initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

## Shareable links

Save shareable link in the Import / Export menu copies a URL containing the current faction, exact action sequence, and complete profile. Timings are always omitted, regardless of the JSON export checkbox. Successful copying closes the menu and shows a notice. If clipboard access fails, the menu stays open with the link selected for manual copying.

Open the copied URL in a browser to restore the build order and profile automatically. Changes to the URL fragment in an already-open planner also load the new shared order. Imports reuse JSON validation and current catalog/simulation rules; saved timings are ignored. Different game-rules revisions warn without blocking. Invalid or unsupported links display an error and leave the current plan intact. Unrelated URL fragments are ignored.

Links use the current page's origin, path, and query, with `#build=2.<payload>` as the fragment. The payload is the compact JSON document compressed with zlib (the existing pako dependency), then encoded as URL-safe base64 without padding. The prefix versions the link encoding alongside JSON format version 2; game-rules revisions are unchanged. No hosting service or server storage is involved. Recipients need access to the same planner address; localhost links require their own reachable planner at that address.

Generated URLs are limited to 16,000 characters; larger orders should use JSON files. Decoding also bounds the compressed payload and decompressed JSON size before running the existing validator. `serializeBuildOrder` and `parseBuildOrder` remain shared by both file and link transports.
