# Catalog prerequisites and building limits

The planner enforces quantity prerequisites, minimum levels, highest-level building limits, and upgrades of individual buildings, including Castle/Citadel progression through level 4.

## Structured prerequisites

`requires` is an array of objects with `item` (base building ID), `count` (minimum completed quantity), and optional `minLevel` (minimum acceptable building level). No `minLevel` means any level qualifies. All entries must be satisfied, and prerequisite buildings are not consumed.

The existing `upgrades` links describe the exact source-to-target progression. Castle/Citadel lvl 2 retains the previously confirmed Barracks and Farm/Pigsty prerequisites.

| Town-hall upgrade | Gold / wood | Seconds | Requirements |
| --- | --- | --- | --- |
| Level 3 | 400 / 400 | 50 | One level 2 town hall, two Farms/Pigsties, one Tower of Mana, one Barracks |
| Level 4 | 600 / 600 | 55 | One level 3 town hall, three Farms/Pigsties, two Towers of Mana, one Barracks |

## Building limits

`limit.basedOn` references the base building ID. `limit.byHighestLevel` contains `minLevel`/`max` entries. The engine uses the highest completed level and the highest applicable threshold; no applicable entry means zero permitted buildings. Omitting `limit` means unlimited. Completed buildings and reserved construction orders count toward the limit, including workers travelling. Additional town halls do not add their limits together.

| Building | Level 1 | Level 2 | Level 3 | Level 4 |
| --- | --- | --- | --- | --- |
| Farm / Pigsty | 1 | 2 | 3 | 4 |
| Sawmill | 1 | 2 | 3 | 4 |
| Tower of Mana | 0 | 1 | 2 | 3 |
| Barracks | Unlimited | Unlimited | Unlimited | Unlimited |

Barracks requires a town hall at level 1 or higher. Its Production price multiplier continues to apply independently of the absence of a quantity limit.

Tower of Mana is Economic, costs 200 gold and 150 wood, takes 40 seconds, and requires a level 2 town hall. Light and Dark use their respective existing Tower of Mana artwork. All listed values and rules apply equally to both factions, with Castle/Farm mapped to Citadel/Pigsty.

The loader derives building families, levels, and exact upgrade sources from the `upgrades` graph rather than item names. It preserves structured `requirements` and `limit` metadata for the scheduler. The name-based `prerequisites` view remains for compatibility; quantities and minimum levels are checked against physical buildings.

## Upgrade ownership and scheduling

Each completed or ordered building has a stable instance identity. An upgrade reserves an exact preceding-level instance when its command is issued, before the worker travels. It cannot reserve a building already upgrading or training a unit. At completion it replaces that instance's level, without creating another building or increasing its copy-price count. Its unit-production capability is inherited, and its queue becomes available at upgrade completion. Worker return travel still reserves the builder separately.

While an upgrade is in progress, the preceding completed level remains the prerequisite/limit level. The higher level unlocks rules only at completion. Higher levels satisfy lower minimum-level requirements.

The dependency helper projects earlier planned construction and upgrades when adding an action. It inserts missing quantities and upgrades needed to unlock limits. Selecting an already-reserved upgrade without another lower-level source produces an explanation and leaves the order unchanged; another base building must be added explicitly. Requests exceeding the catalog's highest limit and cyclic prerequisites are also rejected without changing the order.

The scheduler independently validates every command against completed prerequisites and reserved slots. Removing a prerequisite or upgrade recalculates the schedule and leaves affected orders blocked with an explanation. A blocked order does not create a building, reserve an upgrade source, or spend resources.

## Light-only additions

Elven Tree is a Racial building with a base cost of 200 gold / 300 wood and a construction time of 50 seconds. It requires a level 2 Castle and has no quantity limit. Its Racial type applies the existing per-copy gold/wood price multiplier.

Archer is trained by Barracks for 150 gold / 150 wood / 4 food in 24 seconds. Its prerequisites are one Barracks at level 1 or higher and one Elven Tree at level 1 or higher. Elven Tree unlocks recruitment; Barracks remains the producer and shares its training queue with Swordsman.

These additions use the existing Light artwork and do not add Dark equivalents.

## Altar of Heroes and Miriel (Light only)

Altar of Heroes is a Production building with a base cost of 150 gold / 100 wood and a construction time of 50 seconds. It requires Castle level 2, has no quantity limit, and uses the existing Production price multiplier for additional copies.

Miriel has `kind: "hero"`, costs 650 gold / 250 wood / 10 food, takes 45 seconds to recruit, and requires one completed Altar of Heroes. The Altar's `produces` list registers her producer. Heroes appear in their own action group and use the same production-queue, food reservation, affordability, and resource timeline rules as units, without occupying a construction worker.

An optional positive integer `maxCount` on an item declares a global cap for that item within its faction. Miriel has `maxCount: 1`. The dependency helper rejects another planned copy; the scheduler independently counts successful recruitment commands, including recruitment still in progress, across all producers. A blocked recruitment does not reserve the cap or food. Removing a recruitment order recalculates reservations. The planner currently has no casualty events, so a completed hero remains counted for the remainder of the plan.
