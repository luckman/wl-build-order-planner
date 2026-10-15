# Build-order files, links, and browser storage

Export JSON uses the browser's native Save As picker for directory and filename selection, with the faction's default filename suggested and JSON as the file type. The browser can remember the last export directory. Cancelling does not save or download a file. This API requires a supporting browser and a secure context (HTTPS or localhost). Unsupported browsers use their normal download behavior and browser save-location preferences. No custom filename dialog is shown. Save failures produce a visible error.

The top Import / Export menu offers Export JSON, Copy link, Import JSON, the Include calculated timings option, and faction-specific starting templates when available. The menu is also available on narrow screens and closes with Escape or a click outside it. Files include the selected faction, the opening allocation and exact subsequent commands (including duplicates and blocked actions), and the complete game profile. Orders containing only the required opening allocation can share a profile alone. Import selects the imported faction and replaces its order and profile after validating the entire document, preserving the other faction's draft and settings.

Start from template replaces the selected faction's build and opening allocation while retaining its active Resource collection settings. It asks before replacing a build with subsequent actions, recalculates timings, and saves the resulting working draft without replacing the personal saved profile. Templates are declared in `src/game/buildOrderTemplates.ts`.

Personal profiles and working drafts are stored separately per faction in browser local storage (`wl-resource-profile-v2-*` and `wl-build-draft-v2-*`). Save profile and Load saved profile appear above the reset buttons, with hover tips explaining that they affect only the current faction. Only Save profile replaces the personal settings, including advanced and hidden settings; legacy-format migration preserves those settings. Load saved profile is disabled when no valid personal profile exists; loading preserves the build order and opening allocation and recalculates timings. Save failures show an error instead of a success notice. Personal profiles use an envelope `{ "format": "wl-personal-profile", "version": 2, "faction": "light", "gameProfile": { ... } }`. Its version reuses `FILE_VERSION` because the payload shares the public profile schema; future schema migrations must explicitly handle both public documents and personal profiles. No rules revision is needed: settings are evaluated with current rules. Reads validate the envelope identity, version, faction, and profile settings. Unsupported or malformed envelopes are rejected without overwriting them or interpreting them as raw profiles. Existing valid raw profiles in the v2 storage keys are validated and migrated to the envelope for that faction; if migration writes fail, the profile remains usable.

Direct visits restore the faction's draft profile and build first, then its saved personal profile if no valid draft exists, then defaults. JSON imports and `build=` links always apply their own profile and build after full validation, replacing only that faction's working draft without changing either personal profile. Drafts contain a complete build-order document: the active profile, opening allocation, and exact action commands. They are saved together after an import or working change, including profile edits, Load, Reset, template selection, and build-order changes; merely opening the planner does not create a draft. The selected faction is retained under `wl-active-faction`, so refresh restores the same faction, build, and active profile. Array-only drafts are unsupported. They follow the invalid-draft fallback: an empty build with default opening allocation and the saved personal profile or defaults. A stored draft that fails validation (including malformed JSON, an unsupported format, or a faction mismatch) shows a brief notice: "Your previous draft could not be restored. Starting a new build." The invalid entry is removed so the notice does not repeat on reload when storage works. Missing drafts do not show this notice. Cleanup failures still leave the fallback build usable in memory; a later working change can replace the entry. Neither personal saved profile nor a valid draft for the other faction is changed.

Reset basic to defaults restores only the main resource and level fields, preserving advanced and hidden settings. Reset all restores the full active profile. Both preserve the opening allocation and subsequent actions and update only the working draft. Clear restores the default opening split (up to 4 gold miners) and removes subsequent actions for the active faction, preserving its active and personal profiles. Empty builds still retain their draft profile. Invalid drafts fall back to the personal profile or defaults; unavailable storage leaves editing usable in memory. Version 1 browser profiles are not read or migrated. Version 1 files and links are not supported.

`format` is `wl-build-order`; `version` is the JSON schema version, currently 2. `gameRulesVersion` identifies the catalog/simulation revision. Bump `GAME_RULES_VERSION` in `src/game/buildOrderFile.ts` whenever catalog values or simulation rules change. Import accepts any non-empty rules revision, warns on a mismatch, and always uses current catalog entries and simulation rules. Historical rules are not retained. Unsupported JSON schema versions are rejected with a clear error.

## Compatibility policy (effective 2026-10-14)

This policy applies from now, including before the first deployment. The current JSON schema version 2 and link encoding version 2 are the compatibility baseline. It does not require support for development formats or identifiers removed before this policy took effect. Future changes must preserve the ability of the updated app to read builds produced by this baseline and subsequent supported releases.

| Change | Version and compatibility requirements |
| --- | --- |
| Add a unit, building, upgrade, or scroll with a new ID using an existing command structure | Bump `GAME_RULES_VERSION`; keep JSON schema and link encoding versions unchanged. Update faction catalogs and scroll-ID validation as applicable. |
| Change costs, durations, prerequisites, effects, or simulation behavior | Bump `GAME_RULES_VERSION`; keep the schema version when the stored structure and field meanings remain compatible. Recalculate with current rules. |
| Add an optional profile field | Keep the schema version if older documents remain readable. Define and test its fallback for missing values; bump `GAME_RULES_VERSION` if calculations change. |
| Rename or remove a stored ID, rename a command type, require a previously optional field, or change a field's type, units, or meaning incompatibly | Treat as a schema compatibility change. Preserve the old representation through an explicit alias/migration, or bump `FILE_VERSION` and define how existing supported documents are migrated/read. A rules-revision bump alone is insufficient. |
| Change link compression, encoding, or payload framing incompatibly | Bump the link encoding version and retain decoding for supported older links. A JSON schema change alone does not require a link encoding change if the transport can carry the new document unchanged. |
| Change labels, artwork, layout, or other presentation only | No schema, link, or game-rules version change is required. |

Stored `itemId`, `scrollId`, and command `type` values are stable identifiers. Display names may change independently. Do not reuse an existing identifier for a different entity or command meaning. Adding Dark units and scrolls under existing structures is a catalog/rules update, not a schema change.

Compatibility is directional: the updated app must read supported older builds, but an older app is not required to recognize IDs or commands introduced later. A recipient with a cached older app may need to reload/update before opening a new build. Unknown IDs must produce a clear rejection rather than silently dropping actions. Rules revisions do not select historical engines; supported builds continue to use current rules and may acquire different timings or blocked actions.

Missing-field defaults are part of import semantics. When changing a default, assess its effect on supported documents that omit that field. Preserve their established interpretation through migration/default handling, or treat the change as an intentional rules change and bump `GAME_RULES_VERSION`; do not silently change interpretation under the same revision. Renamed or removed supported profile settings must follow the compatibility policy above rather than relying on unknown-field removal to discard their values.

For compatibility-affecting changes, keep fixed JSON and encoded-link fixtures from the baseline and each affected release. Keep storage fixtures where personal-profile formats are affected; test draft reset behavior when draft formats become incompatible. These must contain historical values and versions, not documents regenerated by the current serializer. Verify loading, profile normalization, exact command IDs/order/timestamps, and re-export; test recalculation under current rules separately from historical timing caches. Add migration or missing-field tests when those paths change. Capture the first public release's fixtures before deployment and retain them in later releases.

Public JSON files and shared links retain the compatibility policy above. Personal saved profiles also require explicit handling of supported older entries; their envelope shares the public profile schema version. Working drafts are temporary browser state and may be reset by incompatible updates. No draft preservation, backup, or recovery guarantee is required. An unreadable draft starts an empty build with the default opening allocation and the saved personal profile, otherwise defaults, and shows the brief reset notice described above.

## Profile schema and validation

`gameProfile` contains four blocks. Missing fields, missing blocks, or an omitted profile use the corresponding values from the default profile. Unrecognized fields and blocks are discarded using this general rule, without migration or special handling for obsolete settings. Supplied known values must still pass validation; null or malformed values are not treated as missing. The normalized profile is used for JSON exports, shareable links, saved profiles, and drafts:

UI resource inputs have a minimum of 0; level inputs have a minimum of 1. Upper resource limits remain: base food limit 40, starting mana and base mana capacity 100, mana accumulation 20, and mana from mana wells 100. These bounds do not change API/import validation; imported values are retained until edited. Capacity must still be at least starting mana: raising starting mana raises capacity when necessary, and capacity edits cannot go below starting mana. Imported starting mana above 100 raises the capacity control's upper limit to match.

Base mana capacity (`player.baseManaLimit`) must be at least starting mana (`player.startingMana`). Import rejects profiles that violate this relationship; saved profiles use the same validation. In the editor, increasing starting mana raises capacity when needed, and capacity cannot be reduced below starting mana. Equality, including zero for both values, is allowed.

- `basic`: `goldGatherTime`, `woodGatherTime`, `initialGoldTravelReduction`, `timeBetweenScrolls` (default 10 seconds, hidden from the profile UI).
- `map`: `goldTravelTime`, `woodTravelTime`, `sawmillWoodTravelTime`, `woodTravelTimeIncreaseBase`, `maxWoodTravelTime`.
- `player`: `startingGold`, `startingWood`, `baseFoodLimit`, `startingMana` (default 35), `baseManaLimit` (default 50), `townHallLevel`, `sawmillLevel`, `farmLevel`, `manaTowerLevel`, `barracksLevel`, `industrialBuildingLevel`, `arcaneBuildingLevel`, `shipyardLevel`, `altarOfHeroesLevel`, `workerLevel`; `manaAccumulation`, `manaFromManaWells`, `scrollCooldownReduction`, `goldMiningTimeReduction`, `woodMiningTimeReduction`; and `lightGoldRushLevel`, `lightLumberGatheringLevel`, plus the hidden settings `massConstructionCostReduction`, `darkWhipLevel`, `darkLegionsCallLevel` (scroll levels are integers 1–6, default 1).
- `delays`: `constructionStartDelay`, `orderDelay`.

Missing mana fields in older profiles default to the values above, with `manaTowerLevel` defaulting to 1. Supplied values are validated normally. Tower levels are integers 1–24 and add 50–55 capacity per completed tower in four-level tiers. Mana regenerates continuously into available capacity; time spent capped does not bank income. Tower completion increases capacity without adding mana. These settings persist and round-trip through JSON and shareable links.

The `player` block also includes `manaAccumulation` (default 10 mana per minute), `manaFromManaWells` (default 60), and `scrollCooldownReduction` (default 0 percent). All three appear in the mana column and reset with the main fields. Accumulation and well mana accept finite non-negative values; cooldown reduction accepts 0–100 percent through import/API validation, while UI edits are capped at 20 percent. Imported values above 20 percent are preserved until this field is edited. `player.manaAccumulation` defaults to 10 when omitted and controls simulation; no legacy mana-rate migration is performed. Each owned well adds player.manaFromManaWells mana per minute between Mana well is captured and Mana well is lost events, subject to mana capacity. Effective scroll cooldown is `basic.timeBetweenScrolls * (1 - player.scrollCooldownReduction / 100)`, used for automatic suggestions, manual insertion minimums, and simulation validation. A 5% reduction yields 9.5 seconds with the default base; order delay still applies afterward.

`player.massConstructionCostReduction` is a hidden percentage setting accepting finite values from 0 to 100, defaulting to 0 for new and older profiles. It round-trips through files, shareable links, drafts, and saved profiles. Reset basic preserves it; Reset all restores 0. It is stored for future support and does not yet change construction costs.

`goldTravelTime` and `woodTravelTime` each apply to both outbound and return trips (default 4 seconds each way). There are no separate outbound/return profile fields. Initial gold travel reduction and Sawmill overrides still apply; obsolete fields are ignored like other unrecognized fields.

`player.goldMiningTimeReduction` and `player.woodMiningTimeReduction` subtract seconds from `basic.goldGatherTime` and `basic.woodGatherTime`, respectively. Both default to 0 for older profiles. Gold accepts 0–1.0 seconds; wood accepts 0–5.0 seconds. Import rejects non-numeric, non-finite, negative, or over-limit values. The editor shows one decimal digit and uses 0.1-second steps in the first resource column; food fields appear in the second column. Effective durations apply to every gathering phase, mine queues, worker saturation, builder selection, and resource readiness; travel and yield are unchanged. A 0.001-second minimum protects custom base durations smaller than a reduction. Both values round-trip through files, shareable links, and saved profiles and reset with player settings.

All durations are in seconds. `orderDelay` defaults to 1 and controls the first build-order command and the gathering commands for the second and later initial wood workers. It also delays commands until that many seconds after their recruitment building, prerequisites, and required building capacity become available. These completion delays overlap, can elapse while other work continues, and do not repeat between recruits. Initial gold workers and the first initial wood gatherer start immediately. `initialGoldTravelReduction` defaults to 1; it shortens only the initial gold workers' opening outbound trip, clamped at zero travel. `sawmillWoodTravelTime` defaults to 0.5 and resets wood travel in both directions when a Sawmill completes. `woodTravelTimeIncreaseBase` defaults to 0.3 seconds per increase, and `maxWoodTravelTime` defaults to 5 seconds each way. Travel grows from game start without a Sawmill and from the latest completion with one; each value lasts 30 seconds times its rounded-up travel value, with a 30-second minimum. Travel underway is unchanged. See [GAME_MODEL.md](GAME_MODEL.md) for the detailed rule. Missing growth/cap fields in existing files and saved profiles use these defaults; all three settings accept finite non-negative values up to 1800 seconds. Zero growth disables increases, and zero maximum makes new wood travel instantaneous.

Every game starts with five workers, defined by a game-rule constant rather than a profile field. The opening action stores goldWorkers (0–5); wood gatherers are 5 minus goldWorkers and initial food usage is always 10. Game-profile durations remain simulation inputs. The current JSON format version is 2; unsupported schema versions are rejected.

Example profile using the current defaults:

```json
{
  "basic": {
    "goldGatherTime": 3.1,
    "woodGatherTime": 12.1,
    "initialGoldTravelReduction": 1,
    "timeBetweenScrolls": 10
  },
  "map": {
    "goldTravelTime": 4,
    "woodTravelTime": 4,
    "sawmillWoodTravelTime": 0.5,
    "woodTravelTimeIncreaseBase": 0.3,
    "maxWoodTravelTime": 5
  },
  "player": {
    "startingGold": 150,
    "startingWood": 50,
    "baseFoodLimit": 20,
    "startingMana": 35,
    "baseManaLimit": 50,
    "townHallLevel": 1,
    "sawmillLevel": 1,
    "farmLevel": 1,
    "manaTowerLevel": 1,
    "barracksLevel": 1,
    "industrialBuildingLevel": 1,
    "arcaneBuildingLevel": 1,
    "shipyardLevel": 1,
    "altarOfHeroesLevel": 1,
    "workerLevel": 1,
    "lightGoldRushLevel": 1,
    "lightLumberGatheringLevel": 1,
    "darkWhipLevel": 1,
    "darkLegionsCallLevel": 1,
    "manaAccumulation": 10,
    "manaFromManaWells": 60,
    "scrollCooldownReduction": 0,
    "massConstructionCostReduction": 0,
    "goldMiningTimeReduction": 0,
    "woodMiningTimeReduction": 0
  },
  "delays": {
    "constructionStartDelay": 4,
    "orderDelay": 1
  }
}
```

All ten player building levels default to 1 and must be integers from 1 to 24. Every four-level tier (1–4, 5–8, 9–12, 13–16, 17–20, 21–24) increases town-hall gold and Sawmill wood yields through 50/51/52/53/54/55, Farm/Pigsty food through 20/21/22/23/24/25, and Tower of Mana capacity additions through 50/51/52/53/54/55. Town halls, Barracks, industrial buildings, arcane buildings, Shipyards, and Altars of Heroes reduce recruitment duration by 1%/2%/3%/4%/5%/6%. Worker level reduces construction and building-upgrade duration by 0%/1%/2%/3%/4%/5% across the same tiers, without changing builder travel; unrelated producers receive no bonus. Player progression is independent of in-match building upgrades.

Gold/wood yields, food per Farm/Pigsty, and capacity per Tower of Mana are derived runtime values, omitted from exported profiles. Missing player levels default to 1. Factory/Workshop, Sanctuary/Dark Gate, Shipyard, and Altar of Heroes use their own player-level recruitment bonuses for both factions. Missing `shipyardLevel` and `altarOfHeroesLevel` fields in older files, saved profiles, drafts, or shareable links default to 1. Both levels are editable in Resources collection and participate in profile save/load and basic/all resets.

Resource collection appears below the timeline, with starting resources, gathering reductions, food/mana settings, and player levels in the main grid. Advanced reveals travel and delay inputs; hidden Basic fields are preserved by imports and exports. The allocation slider lives in a fixed opening action at the top of Build order, ranges from 1 to 4 gold miners in whole workers, and cannot be removed or dragged. JSON/API allocations accept 0–5 gold miners. Moving the slider changes the build without changing the resource profile.

`buildOrder` begins with exactly one `{ "type": "allocate-workers", "goldWorkers": 4 }` entry, followed by `{ "itemId": "worker" }` catalog entries. The opening is required even when there are no subsequent actions. Missing, repeated, misplaced, fractional, negative, or oversized allocations reject the whole import. Item IDs are resolved within the selected faction's current catalog. Unknown IDs reject the entire import; valid but unexecutable actions import unchanged and appear blocked. Import does not insert missing prerequisites or deduplicate actions.

The unchecked-by-default Include calculated timings option adds `timings` to each catalog action (the opening allocation has no cached timings), with `commandTime`, `startTime`, `finishTime`, and `workerReturnTime` in seconds. Blocked actions have null times; unit recruitment has no worker-return time. Import never reads or validates `timings`, even when malformed, and always recalculates the schedule.

Validation requires finite non-negative profile numbers, integer worker assignments, and strictly positive gathering durations. Files are limited to 1 MB, 100 subsequent actions plus the opening allocation, and five initial workers. Unknown additional fields are ignored. Errors leave the current planner state intact.

## Timed scroll commands

Version 2 also accepts timed scroll commands after the opening allocation:

```json
{ "type": "use-scroll", "scrollId": "gold-rush", "commandTime": 90 }
```

`commandTime` is a required finite number of seconds from 0 to 1799 (29:59) after game start, rather than cached simulation output. Scroll levels are independent `gameProfile.player` settings: `lightGoldRushLevel`, `lightLumberGatheringLevel`, `darkWhipLevel`, and `darkLegionsCallLevel`. Each is an integer from 1 to 6 and defaults to 1 when older files or profiles omit it. The four settings are saved, exported, shared, and reset with the profile. Light scroll levels appear at the bottom of the second Resources collection column as Gold Rush level and Wood Gathering level; Dark scroll levels remain hidden. Simulation uses the configured Light scroll levels for duration and cargo bonuses. Reset basic restores visible Light scroll levels to 1 for Light and preserves hidden scroll settings; Reset all restores all scroll levels to 1. Gold Rush and Lumber Gathering are Light-only. Invalid fields, unknown scroll IDs, and scrolls in a Dark build reject the whole import. Existing version 2 catalog-only files remain supported; earlier app releases cannot read the new scroll entries. The rules revision is `2026-10-15.1`.

Scroll commands run at their timestamps independently of their positions among catalog rows. Equal-time scrolls run in source order; resource deliveries, worker recruitment completions, and mana-tower capacity completions at that timestamp are available before validation. Catalog actions retain their existing sequence and scheduling rules. Validation is recalculated on every simulation, including imports. Insufficient mana retains a blocked command and its requested timestamp, with a warning, no mana expenditure, and no effect; it does not wait for regeneration.

Gold Rush spends 50 mana at command time. Its start is command time plus 1 second. At levels 1–6 its duration is 30, 30.3, 30.8, 31.5, 32.4, and 33.5 seconds, and its gold cargo bonus is +10, +11, +12, +13, +14, and +15 respectively. Workers exiting the mine at or after start and strictly before finish carry the bonus, including a worker already gathering when the effect starts. A worker still inside at finish receives no bonus. Cargo is fixed at mine exit, so a bonus load deposited after expiry keeps the bonus, and a load already outside before activation receives none. Overlapping Gold Rush effects give a single level-dependent bonus while either is active. Construction interruption discards the load normally.

The command fields are preserved in plain and timed JSON, local drafts, and shareable links. Optional `timings` may accompany a scroll, but are ignored on import, just like catalog-action caches. Derived start/finish times are recalculated from the command timestamp. `createScrollAction` validates direct API input; `simulateBuildOrder` returns `plan` aligned to input rows plus `orderedPlan` sorted by command timestamp (blocked catalog rows without timestamps follow timed rows). Scrolls are shown between actions by command time and in scroll/event timeline lanes after construction/recruitment. Their build-order rows have no drag handle and cannot be dragged.

The Gold Rush and Lumber Gathering cards share the Light heroes row after a small divider. Each dialog offers a command time in mm:ss in one compact keyboard-editable field (fractional seconds are preserved) without a scroll-level control. Automatic timing is selected initially and disables the time field. It selects the first affordable timestamp at or after the latest existing scroll command plus the effective reduced cooldown plus `delays.orderDelay`; with no scrolls, the minimum is zero. Manual timing also enforces that minimum. The chosen timestamp is fixed when added; changing the plan or profile later produces warnings rather than moving it. If enough mana cannot be reached, automatic insertion is disabled; a manual timestamp can still add a blocked command. Typing 215 or 0215 is interpreted as 02:15; direct mm:ss entry and fractional seconds are supported. The dialog caps keyboard and pasted values at 29:59; automatic suggestions above that limit cannot be submitted. A live mask keeps the colon visible while typing: 215 and 0215 display 02:15 immediately, while 1234 displays 12:34. The dialog supports Cancel, Escape, keyboard focus trapping, and focus restoration.

`basic.timeBetweenScrolls` is a finite non-negative duration and defaults to 10 for older files and saved profiles that omit it. It is exported, shared, saved, and reset with the profile, but has no profile-editor control. The player percentage reduction applies to this base duration. Simulation validates cooldown chronologically between successful command times, with an additional `delays.orderDelay` after cooldown expires. With defaults, a cast at 190 has cooldown expiry at 200 and the next command can be sent at 201. A cast inside cooldown remains blocked with no mana spending or bonus. Blocked commands do not start a cooldown. The insertion dialog uses the latest requested scroll timestamp, including blocked commands, as its lower bound.

Mana availability also requires `delays.orderDelay` before sending a scroll command. Even with sufficient starting mana, the first scroll command cannot precede `orderDelay`. If mana reaches 50 at 80 and orderDelay is 1, the earliest command is 81 and its effect starts at 82. Both readiness waits overlap: use the later of mana readiness plus orderDelay and cooldown expiry plus orderDelay. If mana was already sufficient long before the command, this does not add another wait. Starting mana is available from time zero. Manual/imported fixed timestamps are validated against both rules and retain their timestamp with no spending/effect if blocked.

## Shareable links

Copy link in the Import / Export menu copies a URL containing the current faction, exact action sequence, and complete profile. Calculated timings are always omitted, regardless of the JSON export checkbox; required scroll command timestamps remain. Successful copying closes the menu and shows a notice. If clipboard access fails, the menu stays open with the link selected for manual copying.

Open the copied URL in a browser to restore the build order and profile automatically. Changes to the URL fragment in an already-open planner also load the new shared order. Imports reuse JSON validation and current catalog/simulation rules; saved timings are ignored. Different game-rules revisions warn without blocking. Invalid or unsupported links display an error and leave the current plan intact. Unrelated URL fragments are ignored.

After a successful import, the planner removes the `build` fragment parameter from the address without adding a history entry, preserving the path, query, and other fragment parameters. Reloading then restores the latest saved draft and profile, including subsequent edits. Invalid links remain in the address. Use Copy link to share the current plan again.

Links use the current page's origin, path, and query, with `#build=2.<payload>` as the fragment. The payload is the compact JSON document compressed with zlib (the existing pako dependency), then encoded as URL-safe base64 without padding. The prefix versions the link encoding alongside JSON format version 2; game-rules revisions are unchanged. No hosting service or server storage is involved. Recipients need access to the same planner address; localhost links require their own reachable planner at that address.

Generated URLs are limited to 16,000 characters; larger orders should use JSON files. Decoding also bounds the compressed payload and decompressed JSON size before running the existing validator. `serializeBuildOrder` and `parseBuildOrder` remain shared by both file and link transports.

### Lumber Gathering

```json
{ "type": "use-scroll", "scrollId": "lumber-gathering", "commandTime": 15 }
```

Lumber Gathering costs 25 mana at command time, starts exactly one second later, and uses the configured profile level. At levels 1–6 its duration is 30, 30.3, 30.8, 31.5, 32.4, and 33.5 seconds, and it adds 15, 16, 17, 18, 19, and 20 wood to the configured trip yield respectively. It applies to the forest and all wood workers independently: cargo receives the bonus when gathering finishes at or after start and strictly before expiry. The current stage or elapsed gathering time at activation does not matter. Returning workers retain their current cargo and can receive the bonus on their next gathering cycle; new workers and returning builders follow the same completion rule. Cargo keeps the bonus when deposited after expiry. Overlapping Lumber Gathering windows do not stack. Construction interruption discards cargo. Gold Rush and Lumber Gathering share mana and scroll cooldowns; automatic timing uses the selected scroll's mana cost.


## Resources collected events

Both factions can add gold and wood at an explicit timestamp with no delays, mana costs, or worker requirements. The action card follows scrolls in the heroes row. The dialog defaults to 300 gold and 300 wood and one second after the latest active command; users can choose any timestamp from 00:00 to 29:59. Click the Build order row to edit the timestamp or amounts. Events persist in drafts, JSON files and share links.

The command schema is `{ "type": "resources-collected", "commandTime": 1, "gold": 300, "wood": 300 }`. Resource values must be finite and non-negative; command time must be within 0–1799 seconds. The UI uses whole-second timestamps, while imports/API commands may retain fractional seconds.

## Mana well commands

`{ "type": "mana-well-is-captured", "commandTime": 30 }` and `{ "type": "mana-well-is-lost", "commandTime": 90 }` specify exact timestamps with no delays or resource costs. Ownership starts at zero. Commands are evaluated by timestamp, with source order breaking ties. The UI uses whole-second timestamps; imports/API commands may retain fractional seconds. A loss without an owned well is preserved as a blocked, editable event and has no effect. Imports recalculate ownership validation.

## Unit is killed events

`{ "type": "unit-is-killed", "unitId": "worker", "commandTime": 30 }` records one unit being killed at an exact timestamp with no delay or costs. unitId must identify a recruitable item in the chosen faction. Imports recalculate eligibility from completed recruitment, starting workers, earlier losses, and worker construction assignments. Successful losses release food and, for heroes, their recruitment cap and Altar tier reservation. Killed workers stop gathering and discard cargo. Workers assigned to construction (including travel) cannot be killed; wood workers are selected before gold workers. Invalid losses remain editable and inactive. The UI uses whole-second timestamps; imports/API commands may retain fractional seconds.

## Supported plan limits

The shared policy permits 100 subsequent actions plus the opening worker allocation, with event/scroll command times from 00:00 to 29:59. Simulation and graphs stop at 30:00. Catalog actions that would finish or return their builder after 30:00 remain blocked; scrolls whose effects would finish after the horizon are also blocked. Profile durations must be within 0–1,800 seconds (gathering base durations must remain positive). A conservative gathering-work estimate rejects profiles that could exceed the runtime budget of 200,000 simulation steps. Graphs use at most 361 regular samples, with bounded action timestamps added for food/mana discontinuities. These checks apply to editing, import/export, links and draft restore/save.
