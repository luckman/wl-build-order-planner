# War Legends Build Order Planner

A React starter for planning War Legends mobile RTS build orders. It was bootstrapped from the SC2 Planner UI shell, but the active application uses only War Legends data.

## Current scope

- The top Import / Export menu downloads and imports `.wl-build-order.json` files containing the faction, exact action order, and complete game profile. Export can optionally include calculated timings inside each action; import ignores those timings and recalculates using current rules. Different game-rules revisions produce a non-blocking warning. Import replaces the current order and profile only after validation succeeds. See `docs/BUILD_ORDER_FILES.md`.

- Light faction: Castle, Castle lvl 2, Sawmill, Farm, Barracks, Elven Tree, Altar of Heroes, Worker, Swordsman, Archer, and the hero Miriel.
- Dark faction: Citadel, Citadel lvl 2, Sawmill, Pigsty, Barracks, Slave, and Goon.
- Castle/Citadel levels 3–4 and Tower of Mana are available for both factions. The planner enforces quantity and minimum-level prerequisites, per-building upgrade ownership, and highest-town-hall-level limits for Farm/Pigsty, Sawmill, and Tower of Mana. See `docs/CATALOG_DEPENDENCIES.md`.
- A trip-based gold and wood simulator: gold workers queue for one mine slot, while wood workers gather independently.
- Each completed Sawmill resets wood travel to 0.5 seconds each way. Travel increases by 0.5 seconds per full minute since the latest completion, capped at 4 seconds after 7 minutes. Travel already in progress finishes at its original duration; chopping time and gold travel are unchanged.
- Editable starting gold/wood, worker allocation, and per-trip yield inputs, with a resource timeline that delays orders until deliveries cover their costs.
- Starting gold defaults to 150 and remains editable in the Resource collection panel.
- A shared, horizontally scrollable 90-second timeline viewport with resource graphs, one timestamp ruler, and non-overlapping parallel production/construction rows.
- The timeline always shows at least 90 seconds and extends 30 seconds past the latest completed command.
- Timeline labels, queue names, and resource amounts stay fixed while the time-based graph and queue content scroll together.
- Narrow action and build-order sidebars reserve more horizontal space for the timeline; action cards use a compact icon-and-cost layout.
- The Build order panel includes a latest-command state snapshot: timestamp, resources, food, total workers, and the gold/wood/busy-or-idle worker allocation.
- Resource hover in 0.1-second increments, with a shared time marker and a tooltip showing gold, wood, and food used/limit together.
- Initial assignments default to 4 gold miners and 1 wood gatherer; total starting workers and food usage are calculated from these assignments (2 food per worker).
- The first build-order command is available at 1.0 seconds. Initial gold miners and the first wood gatherer start gathering immediately; additional initial wood gatherers receive their gathering commands at 1.0 seconds.
- Newly trained Workers/Slaves automatically join gold up to calculated mine saturation, then gather wood.
- Construction start delay is editable in the game profile (default 4 seconds), and is also used for the builder's return trip. Buildings and building upgrades reserve a builder for both trips and their construction time.
- Builders are selected automatically: idle workers, then wood gatherers carrying the least wood, then eligible gold workers carrying the least gold. Workers inside the mine cannot be selected. Interrupted cargo is discarded; returning workers restart gathering at their previous resource.
- One completed Castle/Citadel is present initially. Each producer trains one unit at a time; additional Castles/Citadels and Barracks have independent queues available after construction completes.
- Temporary source artwork: Terran icons for Light, Protoss icons for Dark.
- Game content is declared in `src/game/data.json`. The app derives each item's producer and explicit prerequisite set in `src/game/gameData.ts`, so expanding the catalog does not require editing the planner UI.
- Choosing an action inserts missing prerequisite quantities and limit-unlocking upgrades in dependency order. Duplicate upgrades require another building at the preceding level; the planner explains rejected actions and blocked orders.
- Heroes use production queues and food like units. Miriel requires Altar of Heroes and is limited to one across all Altars, including queued recruitment. Removing her order releases the reservation.
- Production and Racial buildings cost their base gold/wood price multiplied by their copy number (1×, 2×, 3×, ...), counting earlier planned copies including builders in transit. Action cards show the next copy's price. Upgrades and Economic/Defensive buildings retain fixed prices.

Additional game content will be added when its War Legends values are known. Starting state and yields remain user-editable rather than fixed game data. The food defaults described in the game-model document are editable in the UI. SC2-specific active logic (MULEs, larva, gas, and a third faction) is not used. Construction timing and worker selection are detailed in `docs/CONSTRUCTION.md`.

## Run

```sh
npm install
npm start
```

Build the production app with `npm run build`.

See `docs/README.md` for migration context and `ai-changelog/2026-10-08-resource-collection-and-sc2-ui.md` for the latest change record.
