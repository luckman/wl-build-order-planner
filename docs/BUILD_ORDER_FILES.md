# Build-order JSON files

Export JSON uses the browser's native Save As picker for directory and filename selection, with the faction's default filename suggested and JSON as the file type. The browser can remember the last export directory. Cancelling does not save or download a file. This API requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers use their normal download behavior and browser save-location preferences. No custom filename dialog is shown. Save failures produce a visible error.

The top Import / Export menu offers Export JSON, Import JSON, and the Include calculated timings option. The menu is also available on narrow screens and can be closed with Escape. Files include the selected faction, ordered action IDs (including duplicates and blocked actions), and the complete economy and food profile. Empty orders can be used to share a profile alone. Import selects the imported faction and replaces its order and profile after validating the entire document, preserving the other faction's draft and settings.

Resource profiles and build-order drafts are saved independently per faction in browser local storage (`wl-resource-profile-v2-*` and `wl-build-draft-v2-*`). Drafts contain the opening allocation and catalog action IDs and survive reloads. Import replaces and saves both for its faction after full validation. Reset basic to defaults restores only the main resource and level fields, preserving advanced and hidden settings. Reset all restores the full resource profile. Both preserve the opening allocation and subsequent actions. Clear restores the default opening split (up to 4 gold miners) and removes subsequent actions for the active faction. Invalid profiles or drafts fall back independently; unavailable storage leaves editing usable in memory. Existing version 1 browser profiles migrate their gold assignment into the opening action, preserving other settings. Version 1 files and links are not migrated.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 2. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

`gameProfile` contains four blocks:

UI edits use these resource bounds: starting gold >=150, starting wood >=50, base food limit 20–40, starting mana 35–100, base mana capacity 50–100, mana accumulation 10–20, and mana from mana wells 60–100. These bounds do not change API/import validation; imported values are retained until edited. Capacity must still be at least starting mana. Editing capacity when imported starting mana exceeds 100 also lowers starting mana to the edited capacity to preserve that relationship.

Base mana capacity (`player.baseManaLimit`) must be at least starting mana (`player.startingMana`). Import rejects profiles that violate this relationship; saved profiles use the same validation. In the editor, increasing starting mana raises capacity when needed, and capacity cannot be reduced below starting mana. Equality, including zero for both values, is allowed.

- `basic`: `goldGatherTime`, `woodGatherTime`, `initialGoldTravelReduction`, `manaPerMinute` (legacy value used to migrate older profiles), `timeBetweenScrolls` (default 10 seconds, hidden from the profile UI).
- `map`: `goldTravelTime`, `woodTravelTime`, `sawmillWoodTravelTime`.
- `player`: `startingGold`, `startingWood`, `baseFoodLimit`, `startingMana` (default 35), `baseManaLimit` (default 50), `townHallLevel`, `sawmillLevel`, `farmLevel`, `manaTowerLevel`, `scrollLevel` (default 1, hidden), `barracksLevel`, `industrialBuildingLevel`, `arcaneBuildingLevel`, `workerLevel`.
- `delays`: `constructionStartDelay`, `orderDelay`.

Missing mana fields in older profiles default to the values above, with `manaTowerLevel` defaulting to 1. Supplied values are validated normally. Tower levels are integers 1–24 and add 50–55 capacity per completed tower in four-level tiers. Mana regenerates continuously into available capacity; time spent capped does not bank income. Tower completion increases capacity without adding mana. These settings persist and round-trip through JSON and shareable links.

The `player` block also includes `manaAccumulation` (default 10 mana per minute), `manaFromManaWells` (default 60), and `scrollCooldownReduction` (default 0 percent). All three appear in the mana column and reset with the main fields. Accumulation and well mana accept finite non-negative values; cooldown reduction accepts 0–100 percent through import/API validation, while UI edits are capped at 20 percent. Imported values above 20 percent are preserved until this field is edited. Older profiles without `manaAccumulation` inherit their legacy `basic.manaPerMinute` value (or 10 when absent); the player value controls simulation thereafter. Each owned well adds player.manaFromManaWells mana per minute between Capture mana well and Lose mana well events, subject to mana capacity. Effective scroll cooldown is `basic.timeBetweenScrolls * (1 - player.scrollCooldownReduction / 100)`, used for automatic suggestions, manual insertion minimums, and simulation validation. A 5% reduction yields 9.5 seconds with the default base; order delay still applies afterward.

`goldTravelTime` and `woodTravelTime` each apply to both outbound and return trips (default 4 seconds each way). They replace the separate outbound/return fields. Initial gold travel reduction and Sawmill overrides still apply. These travel fields retain their existing behavior.

`player.goldMiningTimeReduction` and `player.woodMiningTimeReduction` subtract seconds from `basic.goldGatherTime` and `basic.woodGatherTime`, respectively. Both default to 0 for older profiles. Gold accepts 0–1.0 seconds; wood accepts 0–5.0 seconds. Import rejects non-numeric, non-finite, negative, or over-limit values. The editor shows one decimal digit and uses 0.1-second steps in the first resource column; food fields appear in the second column. Effective durations apply to every gathering phase, mine queues, worker saturation, builder selection, and resource readiness; travel and yield are unchanged. A 0.001-second minimum protects custom base durations smaller than a reduction. Both values round-trip through files, shareable links, and saved profiles and reset with player settings.

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

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 100 subsequent actions plus the opening allocation, and five initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

## Timed scroll commands

Version 2 also accepts timed scroll commands after the opening allocation:

```json
{ "type": "use-scroll", "scrollId": "gold-rush", "commandTime": 90 }
```

`commandTime` is a required finite non-negative number of seconds after game start, rather than cached simulation output. Scroll level is a global `gameProfile.player.scrollLevel` setting: an integer from 1 to 6, defaulting to 1 when older files or profiles omit it. It is saved, exported, shared, and reset with the profile, but has no UI control. Obsolete per-command `level` fields are ignored and omitted on subsequent export. Gold Rush and Lumber Gathering are Light-only. Invalid fields, unknown scroll IDs, and scrolls in a Dark build reject the whole import. Existing version 2 catalog-only files remain supported; earlier app releases cannot read the new scroll entries. The rules revision is `2026-10-14.3`.

Scroll commands run at their timestamps independently of their positions among catalog rows. Equal-time scrolls run in source order; resource deliveries, worker recruitment completions, and mana-tower capacity completions at that timestamp are available before validation. Catalog actions retain their existing sequence and scheduling rules. Validation is recalculated on every simulation, including imports. Insufficient mana retains a blocked command and its requested timestamp, with a warning, no mana expenditure, and no effect; it does not wait for regeneration.

Gold Rush spends 50 mana at command time. Its start is command time plus 1 second and its finish is start plus 30 seconds. All six profile levels currently use the level 1 effect, giving the same +10 gold bonus. Workers exiting the mine at or after start and strictly before finish carry the bonus, including a worker already gathering when the effect starts. A worker still inside at finish receives no bonus. Cargo is fixed at mine exit, so a bonus load deposited after expiry keeps the bonus, and a load already outside before activation receives none. Overlapping Gold Rush effects give a single +10 bonus while either is active. Construction interruption discards the load normally.

The command fields are preserved in plain and timed JSON, local drafts, and shareable links. Optional `timings` may accompany a scroll, but are ignored on import, just like catalog-action caches. Derived start/finish times are recalculated from the command timestamp. `createScrollAction` validates direct API input; `simulateBuildOrder` returns `plan` aligned to input rows plus `orderedPlan` sorted by command timestamp (blocked catalog rows without timestamps follow timed rows). Scrolls are shown between actions by command time and in scroll/event timeline lanes after construction/recruitment. Their build-order rows have no drag handle and cannot be dragged.

The Gold Rush and Lumber Gathering cards share the Light heroes row after a small divider. Each dialog offers a command time in mm:ss in one compact keyboard-editable field (fractional seconds are preserved) and notes that all six scroll levels currently share the same effects. Automatic timing is selected initially and disables the time field. It selects the first affordable timestamp at or after the latest existing scroll command plus the effective reduced cooldown plus `delays.orderDelay`; with no scrolls, the minimum is zero. Manual timing also enforces that minimum. The chosen timestamp is fixed when added; changing the plan or profile later produces warnings rather than moving it. If enough mana cannot be reached, automatic insertion is disabled; a manual timestamp can still add a blocked command. Typing 215 or 0215 is interpreted as 02:15; direct mm:ss entry and fractional seconds are supported. The dialog caps keyboard and pasted values at 29:59; automatic suggestions above that limit cannot be submitted. A live mask keeps the colon visible while typing: 215 and 0215 display 02:15 immediately, while 1234 displays 12:34. The dialog supports Cancel, Escape, keyboard focus trapping, and focus restoration.

`basic.timeBetweenScrolls` is a finite non-negative duration and defaults to 10 for older files and saved profiles that omit it. It is exported, shared, saved, and reset with the profile, but has no profile-editor control. The player percentage reduction applies to this base duration. Simulation validates cooldown chronologically between successful command times, with an additional `delays.orderDelay` after cooldown expires. With defaults, a cast at 190 has cooldown expiry at 200 and the next command can be sent at 201. A cast inside cooldown remains blocked with no mana spending or bonus. Blocked commands do not start a cooldown. The insertion dialog uses the latest requested scroll timestamp, including blocked commands, as its lower bound.

Mana availability also requires `delays.orderDelay` before sending a scroll command. If mana reaches 50 at 80 and orderDelay is 1, the earliest command is 81 and its effect starts at 82. Both readiness waits overlap: use the later of mana readiness plus orderDelay and cooldown expiry plus orderDelay. If mana was already sufficient long before the command, this does not add another wait. Starting mana is available from time zero. Manual/imported fixed timestamps are validated against both rules and retain their timestamp with no spending/effect if blocked.

## Shareable links

Save shareable link in the Import / Export menu copies a URL containing the current faction, exact action sequence, and complete profile. Calculated timings are always omitted, regardless of the JSON export checkbox; required scroll command timestamps remain. Successful copying closes the menu and shows a notice. If clipboard access fails, the menu stays open with the link selected for manual copying.

Open the copied URL in a browser to restore the build order and profile automatically. Changes to the URL fragment in an already-open planner also load the new shared order. Imports reuse JSON validation and current catalog/simulation rules; saved timings are ignored. Different game-rules revisions warn without blocking. Invalid or unsupported links display an error and leave the current plan intact. Unrelated URL fragments are ignored.

After a successful import, the planner removes the `build` fragment parameter from the address without adding a history entry, preserving the path, query, and other fragment parameters. Reloading then restores the latest saved draft and profile, including subsequent edits. Invalid links remain in the address. Use Copy link to share the current plan again.

Links use the current page's origin, path, and query, with `#build=2.<payload>` as the fragment. The payload is the compact JSON document compressed with zlib (the existing pako dependency), then encoded as URL-safe base64 without padding. The prefix versions the link encoding alongside JSON format version 2; game-rules revisions are unchanged. No hosting service or server storage is involved. Recipients need access to the same planner address; localhost links require their own reachable planner at that address.

Generated URLs are limited to 16,000 characters; larger orders should use JSON files. Decoding also bounds the compressed payload and decompressed JSON size before running the existing validator. `serializeBuildOrder` and `parseBuildOrder` remain shared by both file and link transports.

### Lumber Gathering

```json
{ "type": "use-scroll", "scrollId": "lumber-gathering", "commandTime": 15 }
```

Lumber Gathering costs 25 mana at command time, starts exactly one second later, and lasts 30 seconds. All profile scroll levels (1–6) currently add 15 wood to the configured trip yield. It applies to the forest and all wood workers independently: cargo receives the bonus when gathering finishes at or after start and strictly before expiry. The current stage or elapsed gathering time at activation does not matter. Returning workers retain their current cargo and can receive the bonus on their next gathering cycle; new workers and returning builders follow the same completion rule. Cargo keeps the bonus when deposited after expiry. Overlapping Lumber Gathering windows do not stack. Construction interruption discards cargo. Gold Rush and Lumber Gathering share mana and scroll cooldowns; automatic timing uses the selected scroll's mana cost.


## Add resources events

Both factions can add gold and wood at an explicit timestamp with no delays, mana costs, or worker requirements. The action card follows scrolls in the heroes row. The dialog defaults to 300 gold and 300 wood and one second after the latest active command; users can choose any timestamp from 00:00 to 29:59. Click the Build order row to edit the timestamp or amounts. Events persist in drafts, JSON files and share links.

The command schema is `{ "type": "add-resources", "commandTime": 1, "gold": 300, "wood": 300 }`. Values must be finite and non-negative.

## Mana well commands

`{ "type": "capture-mana-well", "commandTime": 30 }` and `{ "type": "lose-mana-well", "commandTime": 90 }` specify exact timestamps with no delays or resource costs. Ownership starts at zero. Commands are evaluated by timestamp, with source order breaking ties. A loss without an owned well is preserved as a blocked, editable event and has no effect. Imports recalculate ownership validation.

## Unit losses

`{ "type": "lose-unit", "unitId": "worker", "commandTime": 30 }` specifies one loss at an exact timestamp with no delay or costs. unitId must identify a recruitable item in the chosen faction. Imports recalculate eligibility from completed recruitment, starting workers, earlier losses, and worker construction assignments. Successful losses release food; invalid losses remain editable and inactive.

## Supported plan limits

The shared policy permits 100 subsequent actions plus the opening worker allocation, with event/scroll command times from 00:00 to 29:59. Simulation and graphs stop at 30:00. Catalog actions that would finish or return their builder after 30:00 remain blocked; scrolls whose effects would finish after the horizon are also blocked. Profile durations must be within 0–1,800 seconds (gathering base durations must remain positive). A conservative gathering-work estimate rejects profiles that could exceed the runtime budget of 200,000 simulation steps. Graphs use at most 361 regular samples, with bounded action timestamps added for food/mana discontinuities. These checks apply to editing, import/export, links and draft restore/save.
