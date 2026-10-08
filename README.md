# War Legends Build Order Planner

A React starter for planning War Legends mobile RTS build orders. It was bootstrapped from the SC2 Planner UI shell, but the active application uses only War Legends data.

## Current scope

- Light faction: Castle, Castle lvl 2, Sawmill, Farm, Barracks, Worker, and Swordsman.
- Dark faction: Citadel, Citadel lvl 2, Sawmill, Pigsty, Barracks, Slave, and Goon.
- A trip-based gold and wood simulator: gold workers queue for one mine slot, while wood workers gather independently.
- Editable starting gold/wood, worker allocation, and per-trip yield inputs, with a resource timeline that delays orders until deliveries cover their costs.
- Starting gold defaults to 150 and remains editable in the Resource collection panel.
- A shared, horizontally scrollable 90-second timeline viewport with resource graphs, one timestamp ruler, and non-overlapping parallel production/construction rows.
- The timeline always shows at least 90 seconds and extends 30 seconds past the latest completed command.
- Timeline labels, queue names, and resource amounts stay fixed while the time-based graph and queue content scroll together.
- Narrow action and build-order sidebars reserve more horizontal space for the timeline; action cards use a compact icon-and-cost layout.
- The Build order panel includes a latest-command state snapshot: timestamp, resources, food, total workers, and the gold/wood/busy-or-idle worker allocation.
- Resource hover in 0.1-second increments, with a shared time marker and a tooltip showing gold, wood, and food used/limit together.
- Initial assignments default to 4 gold miners and 1 wood gatherer; total starting workers and food usage are calculated from these assignments (2 food per worker).
- Newly trained Workers/Slaves automatically join gold up to calculated mine saturation, then gather wood.
- Construction start delay is editable in the game profile (default 4 seconds), and is also used for the builder's return trip. Builders gather nothing during either trip or construction.
- Builders are selected automatically: idle workers, then wood gatherers carrying the least wood, then eligible gold workers carrying the least gold. Workers inside the mine cannot be selected. Interrupted cargo is discarded; returning workers restart gathering at their previous resource.
- One completed Castle/Citadel is present initially. Each producer trains one unit at a time; additional Castles/Citadels and Barracks have independent queues available after construction completes.
- Temporary source artwork: Terran icons for Light, Protoss icons for Dark.
- Game content is declared in `src/game/data.json`. The app derives each item's producer and explicit prerequisite set in `src/game/gameData.ts`, so expanding the catalog does not require editing the planner UI.
- Choosing an action automatically inserts any unmet prerequisites, in dependency order, before the selected action.

Additional game content will be added when its War Legends values are known. Starting state and yields remain user-editable rather than fixed game data. The food defaults described in the game-model document are editable in the UI. SC2-specific active logic (MULEs, larva, gas, and a third faction) is not used. Construction timing and worker selection are detailed in `docs/CONSTRUCTION.md`.

## Run

```sh
npm install
npm start
```

Build the production app with `npm run build`.

See `docs/README.md` for migration context and `ai-changelog/2026-10-08-resource-collection-and-sc2-ui.md` for the latest change record.
