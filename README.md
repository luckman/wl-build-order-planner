# War Legends Build Order Planner

A React starter for planning War Legends mobile RTS build orders. It was bootstrapped from the SC2 Planner UI shell, but the active application uses only War Legends data.

## Current scope

- Light faction: Castle, Castle lvl 2, Sawmill, Farm, Barracs, Worker, and Swordsman.
- Dark faction: Citadel, Citadel lvl 2, Sawmill, Pigsty, Barracs, Slave, and Goon.
- A trip-based gold and wood simulator: gold workers queue for one mine slot, while wood workers gather independently.
- Editable starting gold/wood, worker allocation, and per-trip yield inputs, with a resource timeline that delays orders until deliveries cover their costs.
- Resource hover in 0.1-second increments, with a shared time marker and a tooltip showing gold, wood, and food used/limit together.
- Initial assignments default to 4 gold miners and 1 wood gatherer; total starting workers and food usage are calculated from these assignments (2 food per worker).
- Newly trained Workers/Slaves automatically join gold up to calculated mine saturation, then gather wood.
- One completed Castle/Citadel is present initially. Each producer trains one unit at a time; additional Castles/Citadels and Barracs have independent queues available after construction completes.
- Temporary source artwork: Terran icons for Light, Protoss icons for Dark.

Worker construction occupancy and additional game content will be added when their War Legends values are known. Starting state and yields remain user-editable rather than fixed game data. The food defaults described in the game-model document are editable in the UI. SC2-specific active logic (MULEs, larva, gas, and a third faction) is not used.

## Run

```sh
npm install
npm start
```

Build the production app with `npm run build`.

See `docs/README.md` for migration context and `ai-changelog/2026-10-08-resource-collection-and-sc2-ui.md` for the latest change record.
