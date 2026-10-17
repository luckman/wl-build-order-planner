# War Legends game model

This guide describes the implemented simulator. Detailed catalog rules are in [CATALOG_DEPENDENCIES.md](CATALOG_DEPENDENCIES.md), builder behavior in [CONSTRUCTION.md](CONSTRUCTION.md), and persisted commands and profiles in [BUILD_ORDER_FILES.md](BUILD_ORDER_FILES.md).

## Implementation and data ownership

The planner combines a faction catalog, a game profile, and an ordered build:

```text
Catalog + Game profile + Opening allocation + Action commands
    -> Build scheduler and worker economy
    -> Scheduled actions, resource deliveries, and validation
    -> Build-order rows, timeline, and resource graphs
```

| Source | Responsibility |
| --- | --- |
| `src/game/data.json` | Faction items, base costs and durations, prerequisites, production/upgrade links, and limits. |
| `src/game/gameData.ts` and `buildingRules.ts` | Derived producers and building families, dependency insertion, copy prices, and physical building/upgrade rules. |
| `src/game/gameProfile.ts` | Starting resources, progression, gathering modifiers, travel, delays, and profile defaults. |
| `src/game/playerLevels.ts` | Resource yields, food/mana capacity additions, and duration bonuses from player progression. |
| `src/game/buildSimulation.ts` | Catalog scheduling, producer queues, construction reservations, fixed-time commands, and blocked-action reasons. |
| `src/game/resourceSimulation.ts` | Individual worker cycles, resource deliveries, builder selection, resource balances, and mana integration. |
| `src/game/plannerLimits.ts` | Action/time limits and simulation-work safeguards. |

Game values are entered manually. Player settings affect simulation without modifying catalog definitions. There is no external game-data API or data-entry editor.

## Factions and initial state

Exactly two factions are supported: Light and Dark. Light has the expanded building, unit, upgrade, and hero catalog. Dark currently has Citadel levels 1–4, Sawmill, Pigsty, Barracks, Tower of Mana, Slave, and Goon. Its action picker exposes only Citadel level 2; levels 3–4 remain available to catalog validation and simulation, including imports. Dark Whip is implemented as a timed scroll; its other illustrated buildings, units, heroes and Legion’s Call remain pending.

Each game starts with one completed Castle/Citadel and five Workers/Slaves. The initial town hall costs nothing and can produce workers after the configured order delay. Worker count is a game-rule constant, not a profile field.

The required opening allocation defaults to four gold miners and one wood gatherer. The UI slider permits 1–4 gold miners; JSON/API allocation accepts integers 0–5. All remaining starting workers gather wood. Initial food usage is 10, regardless of the split. There is no manual reassignment action after the opening.

Default resources are 150 gold, 50 wood, 20 base food capacity, and 35 mana with 50 base mana capacity. Initial mana-well ownership is zero. Profile fields are editable or, for hidden settings, configurable through JSON. Personal profiles and working drafts are independent per faction.

## Resource cycles

Gold and wood arrive as discrete worker deliveries, rather than a fixed income rate. Spendable resources equal starting resources plus deliveries and Resources collected events, minus accepted catalog commands' costs.

Gold uses one shared mine slot. A worker travels outbound, waits for the slot, gathers, and returns to deposit. Default gathering time is 3.1 seconds, with 4.25 seconds of travel each way. Initial gold miners' first outbound trip is shortened by `basic.initialGoldTravelReduction` (default 1 second), clamped at zero. Queue waits emerge from arrivals and mine availability.

Wood workers gather independently, with no shared node capacity. Default gathering time is 12.1 seconds and normal travel is 4 seconds each way. Initial gold miners and the first wood gatherer start at time zero; additional initial wood gatherers start at `delays.orderDelay` (default 1 second).

`map.goldTravelTime` and `map.woodTravelTime` each apply to both travel directions. Equipment modifiers `player.goldMiningTimeReduction` (0–1 seconds) and `player.woodMiningTimeReduction` (0–5 seconds) subtract from gathering durations. Effective gathering time is at least 0.001 seconds. Neither modifier changes travel or base cargo yield.

The `growingWoodTravelTime` function models forest logging: as nearby trees are cut down, workers must travel farther to reach the remaining trees. Increasing travel time gradually represents this effect without tracking individual trees or forest positions.

Wood travel increases in steps both before and after a Sawmill. Before the first completion, the initial value is `map.woodTravelTime` (default 4 seconds each way), and growth is measured from game start. Each completed Sawmill resets the value to `map.sawmillWoodTravelTime` (default 0.5 seconds each way) and restarts its growth timer. Growth is global, not tied to individual workers or time spent gathering.

`map.woodTravelTimeIncreaseBase` is the amount added at each increase (default 0.3 seconds). `map.maxWoodTravelTime` caps both initial and subsequent values (default 5 seconds). Each current travel value lasts 30 seconds times its rounded-up value before increasing: values up to 1 second last 30 seconds, values above 1 and up to 2 seconds last 60 seconds, values above 2 and up to 3 seconds last 90 seconds, and so on. Zero travel also lasts 30 seconds before its first increase. Zero increase disables growth; zero maximum makes new wood travel instantaneous.

For initial travel `v0`, increment `b`, maximum `M`, and elapsed seconds since game start or the latest Sawmill completion:

```text
v[n] = min(M, v0 + n * b)
T[0] = 0
T[n + 1] = T[n] + 30 * max(1, ceil(v[n]))
travel = v[n] for T[n] <= elapsed < T[n + 1]
```

Once travel reaches the maximum, it stays there until another Sawmill completes. An increase takes effect exactly at its boundary.

| Seconds since Sawmill completion (defaults) | Travel each way |
|---------------------------------------------|----------------:|
| 0–<30                                       |     0.5 seconds |
| 30–<60                                      |     0.8 seconds |
| 60–<120                                     |     1.1 seconds |
| 120–<180                                    |     1.4 seconds |
| 180–<240                                    |     1.7 seconds |
| 240–<300                                    |     2.0 seconds |
| 300–<390                                    |     2.3 seconds |
| 390–<480                                    |     2.6 seconds |
| 480–<570                                    |     2.9 seconds |
| 570–<690                                    |     3.2 seconds |
| 690–<810                                    |     3.5 seconds |
| 810–<930                                    |     3.8 seconds |
| 930–<1080                                   |     4.1 seconds |
| 1080–<1230                                  |     4.4 seconds |
| 1230–<1380                                  |     4.7 seconds |
| 1380 onward                                 |     5.0 seconds |

Without a Sawmill, defaults give 4 seconds until game second 120, 4.3 seconds until second 270, 4.6 seconds until second 420, 4.9 seconds until second 570, and 5 seconds thereafter.

Each outbound or return travel leg keeps the duration chosen when it began. Sawmill completion and growth boundaries do not change travel already underway. Chopping durations and gold travel are unchanged. The rule applies to both factions.

Newly recruited workers join gold until assigned gold workers reach `ceil((2 * goldTravelTime + effectiveGoldGatherTime) / effectiveGoldGatherTime)`, then join wood. Workers temporarily constructing count toward their previous assignment. Worker losses remove their future deliveries and assignment; recruitment uses the resulting current allocation.

## Player progression and in-match upgrades

Eight player building levels are integers 1–24, defaulting to 1. These profile levels are distinct from individual buildings' levels upgraded during a match. Player levels apply globally to the corresponding family; there are no separate account levels per building instance.

| Player levels | 1–4 | 5–8 | 9–12 | 13–16 | 17–20 | 21–24 |
| --- | --- | --- | --- | --- | --- | --- |
| Gold per trip (`townHallLevel`) | 50 | 51 | 52 | 53 | 54 | 55 |
| Wood per trip (`sawmillLevel`) | 50 | 51 | 52 | 53 | 54 | 55 |
| Food per completed Farm/Pigsty (`farmLevel`) | 20 | 21 | 22 | 23 | 24 | 25 |
| Capacity per completed Tower of Mana (`manaTowerLevel`) | 50 | 51 | 52 | 53 | 54 | 55 |
| Recruitment duration reduction | 1% | 2% | 3% | 4% | 5% | 6% |
| Construction/upgrade duration reduction (`workerLevel`) | 0% | 1% | 2% | 3% | 4% | 5% |

Recruitment bonuses use `townHallLevel` for Workers/Slaves, `barracksLevel` for Barracks, `industrialBuildingLevel` for Factory/Workshop, `arcaneBuildingLevel` for Sanctuary/Dark Gate, `shipyardLevel` for Shipyard, and `altarOfHeroesLevel` for Altar of Heroes. All mappings apply to both factions. Duration is `baseSeconds * (1 - reduction)`.

In-match upgrades unlock catalog prerequisites, producer capabilities, and building limits. They do not change the profile's resource yields or account bonuses.

## Catalog scheduling and construction

Catalog actions keep their relative order. The scheduler accepts each command when resources, completed prerequisites, building capacity, food, producer availability, and an eligible builder allow it. Later commands can overlap earlier construction or training after earlier commands have been accepted. Reordering or removing actions recalculates the entire plan.

Production and Racial buildings double their base gold/wood cost for each successive copy of the same ID: 1×, 2×, 4×, 8×, or `2^(n - 1)` for copy `n`. Earlier catalog orders count for pricing, including orders whose builders are travelling. Economic/Defensive buildings, units, heroes, and upgrades retain fixed costs. The hidden `massConstructionCostReduction` setting is persisted but currently has no cost effect.

Construction and upgrades expose separate command, start, finish, and builder-return times. At command acceptance, costs are paid and a selected worker stops gathering. The worker travels for `constructionStartDelay` (default 3 seconds), builds for the worker-level-adjusted duration, then travels back for the same delay. The completed building becomes available before the builder returns.

Builders are selected from idle workers, then wood gatherers with the least gathered/carried cargo, then gold workers carrying the least cargo outside the mine. Worker ID breaks ties. Builders are unavailable through both travel legs and construction. Wood workers preserve exact partial gathering progress or completed cargo through construction, including progress earned under Whip. On return, they finish the remaining gathering or travel to deposit a completed load. Interrupted gold cargo is discarded. Workers resume at their previous resource without another outbound trip. These rules also apply to building upgrades.

Upgrades reserve an exact preceding-level building instance and its queue. Its completed lower level still satisfies prerequisites and limits during the upgrade; the higher level unlocks at completion. Each producer has one recruitment slot, and additional physical producers have independent queues. Upgrading and training cannot use the same building simultaneously.

`orderDelay` applies to the first catalog command and commands unlocked by completed prerequisites, recruitment buildings, and building capacity. Gold, wood, and free food must also have been sufficient for `orderDelay` before a command, accounting for earlier orders' reserved costs and food. Gathering, Resources collected events, food-building completions, and food released by unit losses follow this rule. All waits overlap. Worker availability adds no delay, and subsequent recruitment adds no repeated wait when its resources are already ready. There are no per-action construction-delay overrides or theoretical/practical mode controls.

Food is reserved at an accepted recruitment command, including for queued heroes. Completed Farms/Pigsties increase capacity. Successful Unit is killed events release the lost unit's food. Hero limits and Altar tiers count living and queued heroes across producers; a successful hero loss allows replacement and reduces the next recruitment tier. See the catalog guide for the Light hero requirements.

## Mana, scrolls, and fixed-time events

Mana regenerates continuously at `player.manaAccumulation + ownedWells * player.manaFromManaWells` per minute (defaults 10 and 60). Capacity caps income; capped income is discarded. Completed Towers of Mana add capacity without adding mana. Base capacity must be at least starting mana.

Timed events retain explicit command timestamps independently of their position among catalog rows. Moving other actions or changing the profile recalculates validation without moving event timestamps. Events are edited through their build-order rows and have no drag handles. Equal-time commands of the same event type use source order; different types follow the simulator's processing order.

| Command | Current behavior |
| --- | --- |
| Gold Rush (Light) | Spends 50 mana; starts 1 second after command; adds 10–15 gold to loads exiting the mine during its level-dependent window. |
| Lumber Gathering (Light) | Spends 25 mana; starts 1 second after command; adds 15–20 wood to loads finishing gathering during its level-dependent window. |
| Resources collected (both factions) | Instantly adds non-negative gold and wood without mana, worker, or delay requirements. |
| Mana well is captured / Mana well is lost (both factions) | Instantly adds/removes one owned well. A loss requires ownership at that timestamp. |
| Unit is killed (both factions) | Removes one completed living recruit or starting worker, releasing food. Workers assigned to construction, including travel, are ineligible; wood workers are selected before gold workers. |

For both Light scrolls, levels 1–6 last 30, 30.3, 30.8, 31.5, 32.4, and 33.5 seconds respectively. Levels are independent profile settings, editable for Light in Resources collection, and default to 1.

Scroll windows include their start and exclude expiry. Cargo is fixed at mine exit or wood-gathering completion, so a bonus load retains its bonus when delivered after expiry, including wood loads held through construction. Overlapping windows of the same scroll do not stack. Worker loss discards cargo; construction discards only gold cargo.

Dark Whip uses identical confirmed effects at levels 1–6: 50 mana, 30 seconds, wood harvesting −2 seconds, gold mining −0.5 seconds and movement speed +15%. Its per-worker duration refreshes without stacking; construction clears it. See [WHIP.md](WHIP.md) for eligibility, progress and mine-entry rules. Dark Legion’s Call remains stored for future support. Scroll cooldown is shared between a faction’s scrolls: `basic.timeBetweenScrolls * (1 - player.scrollCooldownReduction / 100)`, followed by `orderDelay`. Mana must also have been sufficient for `orderDelay` before the command. Blocked scrolls spend no mana and start no cooldown.

Automatic scroll insertion chooses an affordable timestamp once, respecting cooldown, mana, and order delay. Manual scroll insertion may retain a mana-blocked event. Invalid fixed-time events remain editable with warnings and have no effect; the mana-well and unit-is-killed dialogs also validate eligibility before saving.

## Limits, persistence, and UI boundaries

Builds permit 100 subsequent actions plus the required opening allocation. Timed command inputs range from 00:00 to 29:59; simulation has a 30:00 maximum. Actions whose completion, scroll expiry, or builder return exceeds that horizon are blocked. Profile durations are bounded to 1,800 seconds and gathering-work estimates reject configurations that could exceed the simulation budget. Graph duration follows the plan within the same maximum; regular sampling is bounded to 361 points.

Version-2 JSON files and compressed shareable links store the faction, profile, opening allocation, and exact commands. Optional exported timings are ignored on import and recalculated. Rules-revision mismatches warn without loading historical rules. Browser drafts and explicitly saved personal profiles persist per faction. Version-1 files, links, and browser profiles are unsupported and are not migrated.

The timeline shows construction, recruitment, scrolls/events, and resource graphs, with hover inspection of resources and worker allocation. Individual mine queues and full per-worker activity lanes are not displayed. There is no combat simulation, build comparison, automatic build optimization, or manual worker reassignment beyond the opening allocation.
