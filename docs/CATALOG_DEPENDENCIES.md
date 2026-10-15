# Catalog prerequisites and building limits

The planner enforces quantity prerequisites, minimum levels, highest-level building limits, and upgrades of individual buildings, including Castle/Citadel progression through level 4.

The current catalog is `src/game/data.json`; `src/game/gameData.ts` derives its producer and upgrade relationships, and `src/game/buildSimulation.ts` validates scheduling. Light has the expanded catalog documented below. Dark contains Citadel levels 1–4, Sawmill, Pigsty, Barracks, Tower of Mana, Slave, Goon, and the additional level 1 buildings defined in the catalog. Workshop recruits Aeronaut and Dark Gate recruits Necromancer. Goblin Lab, Totem of Orcs, Undead Obelisk, and Altar of Heroes have confirmed upgrades through level 3. Altar of Heroes recruits Grokk, Jax, and Eater. Dark defensive towers follow the same 1/2/3 capacity thresholds as Light at corresponding racial building levels 1/2/3, confirmed by the owner. The Dark action picker offers Citadel levels 2–4. Pigsty and Tower of Mana follow the same town-hall prerequisites and quantity limits as Light Farm and Tower of Mana. Other Dark artwork does not imply implemented game entries.

## Copy prices

Production and Racial buildings cost their base gold/wood price multiplied by `2^(n - 1)` for copy `n`: 1×, 2×, 4×, 8×, and so on. Earlier catalog orders for the same building ID count, including builders still travelling. Each building ID has its own count. Economic/Defensive buildings, units, heroes, and upgrades retain fixed prices. Upgrades do not add a copy. The hidden `player.massConstructionCostReduction` profile field is stored but has no price effect.

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

| Building | Gold / wood | Seconds | Type | Requirements |
| --- | --- | --- | --- | --- |
| Factory | 250 / 300 | 40 | Production | Castle lvl 2 |
| Sanctuary | 300 / 200 | 35 | Production | Castle lvl 2 |
| Shipyard | 150 / 300 | 35 | Production | Castle lvl 2 |
| Dwarven Forge | 250 / 150 | 50 | Racial | Barracks lvl 1 and Castle lvl 1 |
| Human Monument | 300 / 200 | 50 | Racial | Castle lvl 2 |
| Tower of Light Magic | 250 / 350 | 30 | Defensive | Elven Tree lvl 1 |
| Crossbow Tower | 150 / 300 | 25 | Defensive | Human Monument lvl 1 |
| Artillery Tower | 200 / 400 | 35 | Defensive | Dwarven Forge lvl 1 |

The five Production/Racial buildings above use their existing Light artwork and the per-copy price multiplier. Requirements accept higher building levels. Factory recruits Copter and Sanctuary recruits Healer. No quantity limits have been supplied for these five buildings.

The three Defensive towers use their existing Light artwork and fixed gold/wood prices across copies. Worker construction timing and automatic prerequisite insertion apply. Each has a `limit.byHighestLevel` of 1/2/3 copies at the highest level 1/2/3 of its racial prerequisite: Elven Tree for Tower of Light Magic, Human Monument for Crossbow Tower, and Dwarven Forge for Artillery Tower. Without that racial building, capacity is zero. Multiple racial buildings do not add their capacities together. Completed and reserved towers count toward the cap; racial upgrades unlock capacity only after completion and the configured order delay. Selecting a second or third tower inserts missing racial upgrades and their Castle prerequisites; a fourth is rejected.

Elven Tree is a Racial building with a base cost of 200 gold / 300 wood and a construction time of 50 seconds. It requires a level 2 Castle and has no quantity limit. Its Racial type applies the existing per-copy gold/wood price multiplier.

Archer is trained by Barracks for 150 gold / 150 wood / 4 food in 24 seconds. Its prerequisites are one Barracks at level 1 or higher and one Elven Tree at level 1 or higher. Elven Tree unlocks recruitment; Barracks remains the producer and shares its training queue with Swordsman.

These additions use the existing Light artwork and do not add Dark equivalents.

| Unit | Gold / wood / food | Base recruitment seconds | Producer | Requirements |
| --- | --- | --- | --- | --- |
| Warsmith | 175 / 175 / 4 | 33 | Barracks | Barracks lvl 1 and Dwarven Forge lvl 1 |
| Knight | 275 / 100 / 6 | 42 | Barracks | Barracks lvl 1 and Human Monument lvl 1 |
| Copter | 225 / 225 / 5 | 27 | Factory | Factory lvl 1 |
| Healer | 175 / 100 / 3 | 27 | Sanctuary | Sanctuary lvl 1 |
| Guardsman | 225 / 150 / 5 | 24 | Barracks | Barracks lvl 2 and Human Monument lvl 1 |
| Ballista | 250 / 175 / 6 | 36 | Factory | Factory lvl 2 and Human Monument lvl 2 |
| Fox Rider | 350 / 225 / 6 | 39 | Sanctuary | Sanctuary lvl 2 and Elven Tree lvl 1 |
| Wind Mage | 450 / 150 / 7 | 42 | Sanctuary | Sanctuary lvl 2 and Elven Tree lvl 2 |
| Biker | 325 / 275 / 7 | 39 | Factory | Factory lvl 2 and Dwarven Forge lvl 1 |
| Sniper | 275 / 350 / 7 | 42 | Barracks | Barracks lvl 2 and Dwarven Forge lvl 2 |
| Sloop | 200 / 400 / 4 | 42 | Shipyard | Shipyard lvl 1 |
| Caravel | 400 / 650 / 8 | 51 | Shipyard | Shipyard lvl 2 and Elven Tree lvl 1 |

All listed units use existing Light icons, food reservations, and automatic prerequisite insertion, including prerequisite building upgrades. Units share queues with other recruits at their producer. Player-level recruitment bonuses apply to all production buildings, including Shipyard and Altar of Heroes, reducing catalog base durations.

## Light building upgrades

| Upgrade | Gold / wood | Base seconds | Castle requirement |
| --- | --- | --- | --- |
| Barracks lvl 2 | 50 / 100 | 35 | Level 3 |
| Factory lvl 2 | 100 / 100 | 45 | Level 3 |
| Sanctuary lvl 2 | 150 / 100 | 40 | Level 3 |
| Shipyard lvl 2 | 50 / 150 | 40 | Level 3 |
| Dwarven Forge lvl 2 | 300 / 200 | 65 | Level 3 |
| Dwarven Forge lvl 3 | 350 / 250 | 80 | Level 4 |
| Human Monument lvl 2 | 350 / 250 | 65 | Level 3 |
| Human Monument lvl 3 | 400 / 300 | 80 | Level 4 |
| Elven Tree lvl 2 | 250 / 350 | 65 | Level 3 |
| Elven Tree lvl 3 | 300 / 400 | 80 | Level 4 |
| Altar of Heroes lvl 2 | 200 / 150 | 65 | Level 3 |
| Altar of Heroes lvl 3 | 250 / 200 | 80 | Level 4 |

Each upgrade requires one building of its own family at the preceding level, reserves that exact source instance, and uses its existing icon and building type. Costs stay fixed across copies. Worker-level duration bonuses and builder travel apply as for existing upgrades. Upgraded buildings retain recruitment capability, and higher levels satisfy lower-level prerequisites. Add the base building before selecting its upgrade; the planner inserts missing Castle prerequisites and preceding upgrades automatically.

## Altar of Heroes and Light heroes

Hero recruitment tiers are enforced in code: counting living and queued heroes across all Altars, the first needs at least one Altar at level 1, the second level 2, and the third level 3. Any hero type can be first. Once at least one Altar meets the required level, any available Altar can recruit that hero, including a level 1 Altar. A completed upgrade unlocks the next tier after the configured order delay. Failed recruitment does not reserve a tier; removing a recruitment order or successfully losing a hero recalculates tiers. The dependency helper inserts the needed Altar upgrades and Castle prerequisites when selecting subsequent heroes; the scheduler revalidates timed losses and actual recruitment eligibility.

Altar of Heroes is a Production building with a base cost of 150 gold / 100 wood and a construction time of 50 seconds. It requires Castle level 2, has no quantity limit, and uses the existing Production price multiplier for additional copies.

Miriel has `kind: "hero"`, costs 650 gold / 250 wood / 10 food, takes 45 seconds to recruit, and requires one completed Altar of Heroes and Elven Tree, both at level 1 or higher. The Altar's `produces` list registers her producer. Heroes appear in their own action group and use the same production-queue, food reservation, affordability, and resource timeline rules as units, without occupying a construction worker.

An optional positive integer `maxCount` on an item declares a global cap for that item within its faction. All three Light heroes have `maxCount: 1`, allowing at most one living or queued Miriel, one Gilbert, and one Berin (three total) across all Altars. The dependency helper accounts for planned unit-is-killed entries when adding another copy; the scheduler independently validates actual living and queued recruitment across all producers. A blocked recruitment does not reserve the cap or food. Removing a recruitment order recalculates reservations. A successful Unit is killed event releases the lost hero's cap and food, permitting later recruitment of that type; invalid losses release neither.

Gilbert costs 500 gold / 500 wood / 8 food, takes 45 seconds to recruit, and requires Altar of Heroes level 1 and Human Monument level 1. Berin costs 500 gold / 700 wood / 9 food, takes 45 seconds, and requires Altar of Heroes level 1 and Dwarven Forge level 1. Both are registered in the Altar's `produces` list and use existing Light artwork, hero food rules, and Altar production queues. Selecting either hero inserts missing buildings and Castle upgrades automatically. Gilbert and Berin each have a maximum count of one, as does Miriel.

## Dark Barracks level 2

Confirmed by screenshots supplied on 2026-10-15: upgrading a level 1 Dark Barracks costs 50 gold / 100 wood, takes 35 seconds, and requires Citadel level 3. It uses the existing Barracks upgrade chain and artwork, preserves Goon production, and is offered in the Barracks upgrade menu. No additional recruits are inferred from this upgrade.

## Dark unit observations — 2026-10-15

Collected in BlueStacks App Player 1 from Skeleton Archer through Axe Master. Stopped on the locked Catapult without collecting or adding it. Slave and Goon retain their existing data. Only catalog fields were collected.

Displayed training times already include a 1% reduction. Base seconds are recovered as `round(displayedSeconds / 0.99)`; the existing production-duration function applies the player bonus once during simulation. Every recovered value reproduces the displayed time within 0.05 seconds of display rounding.

| Unit | Gold / wood / food | Displayed seconds | Base seconds | Producer | Additional requirement |
| --- | --- | --- | --- | --- | --- |
| Skeleton Archer | 125 / 125 / 2 | 20.8 | 21 | Barracks lvl 1 | Undead Obelisk lvl 1 |
| Bomber | 200 / 100 / 4 | 14.9 | 15 | Barracks lvl 1 | Goblin Lab lvl 1 |
| Warg Rider | 250 / 150 / 6 | 41.6 | 42 | Barracks lvl 1 | Totem of Orcs lvl 1 |
| Aeronaut | 175 / 250 / 5 | 26.7 | 27 | Workshop lvl 1 | None displayed |
| Necromancer | 225 / 50 / 3 | 23.8 | 24 | Dark Gate lvl 1 | None displayed |
| Axe Master | 275 / 250 / 6 | 35.6 | 36 | Barracks lvl 2 | Totem of Orcs lvl 1 |

Each unit uses its existing icon, food reservation, and production queue. Selecting Axe Master inserts Barracks level 2 and Citadel level 3 when missing. No gold was spent during collection; BlueStacks was left at Catapult.

## Dark hero observations — 2026-10-15

Collected from a different account in BlueStacks App Player 1. All three heroes display 44.6 seconds with the user-confirmed 1% recruitment reduction; `round(44.6 / 0.99)` recovers a 45-second base time for the catalog. Combat and equipment stats are outside catalog scope.

| Hero | Gold / wood / food | Base seconds | Producer | Additional requirement |
| --- | --- | --- | --- | --- |
| Grokk | 600 / 400 / 8 | 45 | Altar of Heroes lvl 1 | Totem of Orcs lvl 1 |
| Jax | 550 / 650 / 9 | 45 | Altar of Heroes lvl 1 | Goblin Lab lvl 1 |
| Eater | 600 / 300 / 10 | 45 | Altar of Heroes lvl 1 | Undead Obelisk lvl 1 |

The entries use existing hero icons, one-per-type limits, hero food handling, and Altar queues. Any of the three can be selected as the first hero. Altar levels 2 and 3 are now confirmed below, providing the prerequisites for subsequent heroes. The catalog stores base durations; Altar of Heroes recruitment now uses its own account progression level, with the same 1–6% reductions as other producers. No gold was spent, and the carousel was left at Grokk after confirming all three entries.

## Dark Shipyard

Confirmed by screenshots supplied on 2026-10-15:

| Entry | Gold / wood | Base seconds | Requirements |
| --- | --- | --- | --- |
| Shipyard | 150 / 300 | 35 | Citadel lvl 2 |
| Shipyard lvl 2 | 50 / 150 | 40 | Shipyard lvl 1 and Citadel lvl 3 |

Both entries use the Production type and existing Dark Shipyard icon. Displayed times of 34.3 and 39.2 seconds include the user-confirmed 2% construction reduction, so the catalog stores 35 and 40 seconds. The existing worker-level model applies construction reductions during simulation. The Shipyard appears after Tower of Mana in the building picker and has a level 2 upgrade menu. Schooner and Galleon recruitment is confirmed below.

## Dark Workshop and Dark Gate level 2

Confirmed by screenshots supplied on 2026-10-15. Each upgrade requires its own level 1 building and Citadel level 3.

| Upgrade | Gold / wood | Displayed seconds (2% reduction) | Base seconds |
| --- | --- | --- | --- |
| Workshop lvl 2 | 100 / 100 | 44.1 | 45 |
| Dark Gate lvl 2 | 150 / 100 | 39.2 | 40 |

Base durations are `round(displayedSeconds / 0.98)`. Both upgrades use their existing Production type and icon, appear in their building upgrade menus, and retain Aeronaut / Necromancer production through the existing upgrade ownership and queue rules. No additional recruits are inferred.

## Dark racial building upgrades — 2026-10-15

Confirmed from user-supplied screenshots. Displayed 63.7 / 78.4 seconds include the same 2% construction reduction; base times are 65 / 80 seconds.

| Upgrade | Gold / wood | Base seconds | Requirements |
| --- | --- | --- | --- |
| Goblin Lab lvl 2 | 300 / 200 | 65 | Goblin Lab lvl 1, Citadel lvl 3 |
| Goblin Lab lvl 3 | 350 / 250 | 80 | Goblin Lab lvl 2, Citadel lvl 4 |
| Totem of Orcs lvl 2 | 350 / 250 | 65 | Totem of Orcs lvl 1, Citadel lvl 3 |
| Totem of Orcs lvl 3 | 400 / 300 | 80 | Totem of Orcs lvl 2, Citadel lvl 4 |
| Undead Obelisk lvl 2 | 250 / 350 | 65 | Undead Obelisk lvl 1, Citadel lvl 3 |
| Undead Obelisk lvl 3 | 300 / 400 | 80 | Undead Obelisk lvl 2, Citadel lvl 4 |

All six entries use the Racial type, zero food cost, existing building icons, and sequential upgrade chains in their building upgrade menus. No tower limits or combat bonuses are inferred from these screenshots. Citadel level 4 is now selectable directly from its upgrade menu.

## Dark Altar of Heroes levels 2–3 — 2026-10-15

| Upgrade | Gold / wood | Base seconds | Requirements |
| --- | --- | --- | --- |
| Altar of Heroes lvl 2 | 200 / 150 | 65 | Altar of Heroes lvl 1, Citadel lvl 3 |
| Altar of Heroes lvl 3 | 250 / 200 | 80 | Altar of Heroes lvl 2, Citadel lvl 4 |

Supplied screenshots show 63.7 / 78.4 seconds with the same 2% construction reduction. These Production upgrades use the existing icon, sequential upgrade chain, and hero recruitment queue. Existing hero-tier rules can now insert the Altar upgrades for a second or third distinct Dark hero.

## Remaining Dark units through Galleon — 2026-10-15

Collected from BlueStacks App Player 1, starting on Catapult and stopping on Galleon's stats screen. The user confirmed recruitment reductions between 1% and 3%. For each displayed duration, the table uses an integer base time whose reduced value rounds to the observed tenth of a second.

| Unit | Gold / wood / food | Displayed seconds | Reduction | Base seconds | Producer | Additional requirement |
| --- | --- | --- | --- | --- | --- | --- |
| Catapult | 200 / 250 / 6 | 35.3 | 2% | 36 | Workshop lvl 2 | Totem of Orcs lvl 2 |
| Zombie | 275 / 50 / 5 | 26.7 | 1% | 27 | Dark Gate lvl 2 | Undead Obelisk lvl 1 |
| Venomspitter | 350 / 175 / 7 | 41.6 | 1% | 42 | Dark Gate lvl 2 | Undead Obelisk lvl 2 |
| Drill | 300 / 350 / 7 | 38.2 | 2% | 39 | Workshop lvl 2 | Goblin Lab lvl 1 |
| Rocketeer | 350 / 250 / 7 | 38.2 | 2% | 39 | Barracks lvl 2 | Goblin Lab lvl 2 |
| Schooner | 250 / 350 / 4 | 41.6 | 1% | 42 | Shipyard lvl 1 | None displayed |
| Galleon | 350 / 700 / 8 | 50.5 | 1% | 51 | Shipyard lvl 2 | Undead Obelisk lvl 1 |

All seven entries use existing Dark icons, production queues, food costs, and prerequisite insertion. The catalog stores base durations. Producer progression settings control Barracks, Workshop, Dark Gate, Shipyard, and Altar of Heroes recruitment reductions for both factions. No gold was spent and no navigation past Galleon was performed.


## Faction parity corrections — 2026-10-15

The owner confirmed Light tower limits also apply to Dark: Tower of Dark Magic, Slingshot Tower, and Napalm Tower allow 1/2/3 copies at corresponding racial building levels 1/2/3. Capacity depends on the highest completed racial building level, not the number of racial buildings. Citadel IV is available directly in the upgrade picker.

Light Sawmill and Farm now explicitly require Castle I, matching Dark Sawmill and Pigsty. Each faction starts with its level 1 town hall already present; these prerequisites do not add a town hall construction order or cost.
