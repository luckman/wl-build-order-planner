# Catalog dependencies and building limits

The planner uses [data.json](../src/game/data.json) as the source of truth for both factions' items,
costs, base durations, producers, upgrade paths, prerequisites, and limits. Look there for concrete
values and the complete Light and Dark catalogs. This guide explains how the planner interprets
those relationships; routine catalog-value changes do not require updating it.

## Prerequisites and automatic insertion

An item's `requires` entries specify a building family, a minimum completed quantity, and an
optional minimum level. All requirements must be satisfied. Higher building levels satisfy lower
minimum-level requirements, and prerequisite buildings are not consumed.

When adding an action, the planner considers earlier planned buildings and upgrades and inserts
missing dependencies. It can add the quantities and upgrade chains needed to unlock building
capacity. Cycles and requests above the catalog's maximum capacity are rejected with an explanation.
The scheduler checks completed prerequisites again when executing each command. Removing a needed
building can therefore leave later actions blocked without spending their resources.

## Building capacity and prices

A building's `limit` ties its permitted quantity to the highest completed level of another building
family. The highest applicable threshold wins; multiple supporting buildings do not add their
capacities together. Completed buildings and reserved construction orders count toward the limit,
including orders whose builders are travelling. No applicable threshold means no capacity;
omitting `limit` means no quantity limit.

Production and Racial buildings multiply their base gold and wood costs by `2^(n - 1)` for copy
`n`. Earlier orders for the same building ID count toward this price, including builder travel.
Economic and Defensive buildings, recruits, and upgrades use fixed catalog prices. Upgrading an
existing building does not add another copy.

## Individual upgrades and production queues

The catalog's `upgrades` links define building families, levels, and exact source-to-target paths.
An upgrade reserves one physical building at the preceding level. That instance cannot already be
upgrading or training a recruit. An upgrade replaces its level rather than creating another
building; the lower completed level still satisfies prerequisites and capacity rules until the
upgrade completes.

Each physical producer has its own recruitment queue. Upgrades preserve recruitment capabilities
and release the queue at completion. A builder remains reserved separately until returning to
resource gathering. See [Construction and gathering](CONSTRUCTION.md) for worker selection,
travel, and command delays.

A few examples illustrate these relationships. Exact requirements and thresholds are in
[data.json](../src/game/data.json).

| Example | Planner behavior |
| --- | --- |
| Castle / Citadel upgrade | Reserves an existing town hall and inserts missing prerequisite buildings or preceding upgrades. |
| Farm / Pigsty | Uses the highest completed town-hall level to determine how many copies are allowed. |
| Barracks upgrade | Reserves one Barracks and its queue, then unlocks its higher-level recruitment options on completion. |

Selecting an upgrade whose source instance is already reserved does not silently create another
base building. Add another base building explicitly when a separate upgrade chain is needed.

## Heroes and recruitment caps

Units and heroes reserve food when their recruitment command is accepted and use their producer's
queue. Player progression adjusts catalog base durations; see [Game model](GAME_MODEL.md).

Hero tiers count living and queued heroes across all Altars: the first requires Altar level 1,
the second level 2, and the third level 3. Once any completed Altar meets the required tier, an
available Altar can recruit the hero. The dependency helper inserts missing Altar upgrades.

An item's optional `maxCount` limits living and queued recruits of that type across all producers.
See [data.json](../src/game/data.json) for each hero's cap and prerequisites. A successful
Unit is killed event releases food and the recruit's cap; hero losses also release their tier.
Blocked recruitment and invalid losses reserve or release nothing.

## Implementation and maintenance

[gameData.ts](../src/game/gameData.ts) loads catalog relationships;
[buildingRules.ts](../src/game/buildingRules.ts) handles building dependencies and instances;
[buildSimulation.ts](../src/game/buildSimulation.ts) validates the schedule.

Update this guide when the interpretation of prerequisites, capacity, prices, queues, or hero rules
changes. Keep item lists and exact catalog values in [data.json](../src/game/data.json).
