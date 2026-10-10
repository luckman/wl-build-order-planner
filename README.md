# War Legends Build Order Planner

A React starter for planning War Legends mobile RTS build orders. It was bootstrapped from the SC2 Planner UI shell, but the active application uses only War Legends data.

## Current scope

- The top Import / Export menu downloads and imports `.wl-build-order.json` files containing the faction, exact action order, and complete game profile. Export can optionally include calculated timings inside each action; import ignores those timings and recalculates using current rules. Different game-rules revisions produce a non-blocking warning. Import replaces the current order and profile only after validation succeeds. See `docs/BUILD_ORDER_FILES.md`.

- Light faction: Castle, Castle lvl 2, Sawmill, Farm, Barracks, Factory, Sanctuary, Shipyard, Dwarven Forge, Human Monument, Elven Tree, Altar of Heroes, Tower of Light Magic, Crossbow Tower, Artillery Tower, Worker, Swordsman, Archer, Warsmith, Knight, Copter, Healer, Guardsman, Ballista, Fox Rider, Wind Mage, Biker, Sniper, Sloop, Caravel, and the heroes Miriel, Gilbert, and Berin.
- Dark faction: Citadel, Citadel lvl 2, Sawmill, Pigsty, Barracks, Slave, and Goon.
- Castle/Citadel levels 3–4 and Tower of Mana are available for both factions. The planner enforces quantity and minimum-level prerequisites, per-building upgrade ownership, and highest-town-hall-level limits for Farm/Pigsty, Sawmill, and Tower of Mana. See `docs/CATALOG_DEPENDENCIES.md`.
- Each Light defensive tower is limited to 1/2/3 copies at the highest level 1/2/3 of its racial prerequisite: Elven Tree for Tower of Light Magic, Human Monument for Crossbow Tower, and Dwarven Forge for Artillery Tower. Additional racial buildings do not add capacity; selecting another tower inserts the required upgrade when possible.
- Light Barracks, Factory, Sanctuary, and Shipyard upgrade to level 2 with Castle lvl 3. Dwarven Forge, Human Monument, and Elven Tree upgrade to level 2 with Castle lvl 3 and level 3 with Castle lvl 4. Each upgrade needs its building at the preceding level and preserves its production queue.
- Light Altar of Heroes upgrades to level 2 for 200 gold / 150 wood in 65 seconds with Castle lvl 3, then level 3 for 250 gold / 200 wood in 80 seconds with Castle lvl 4. Hero recruitment remains available after upgrades.
- A trip-based gold and wood simulator: gold workers queue for one mine slot, while wood workers gather independently.
- Each completed Sawmill resets wood travel each way to the map profile's `sawmillWoodTravelTime` (default 0.5 seconds). Travel increases by 0.5 seconds per full minute since the latest completion, capped at 4 seconds. Travel already in progress finishes at its original duration; chopping time and gold travel are unchanged.
- Editable starting gold/wood, worker allocation, and player building levels, with a resource timeline that delays orders until deliveries cover their costs.
- Starting gold defaults to 150 and remains editable in the Resource collection panel.
- A shared, horizontally scrollable 120-second timeline viewport with resource graphs, one timestamp ruler, and non-overlapping parallel production/construction rows.
- The timeline always shows at least 120 seconds and extends 30 seconds past the latest completed command.
- Timeline labels, queue names, and resource amounts stay fixed while the time-based graph and queue content scroll together.
- Actions sits directly above the timeline with four separate rows for buildings, units, heroes, and upgrades, without visible panel or category headings. Each row scrolls horizontally through compact 78px cards showing an icon and gold/wood/food costs. Duration appears in hover details only. Upgrades show only their target level (lvl X); hovering any card shows its name, labeled resource costs, and time in a native browser tooltip. Accessible button names retain the full details. The build-order sidebar stays on the right on wide screens and moves below the planner on smaller screens, leaving more width for the timeline.
- Hovering a Build order action shows the same command, start, finish, and applicable worker-return times as its Timeline event. Blocked actions show their blocking reason. The Build order panel includes a latest-command state snapshot: timestamp, resources, food, total workers, and the gold/wood/busy-or-idle worker allocation.
- Resource hover in 0.1-second increments, with a shared time marker and a tooltip showing gold, wood, and food used/limit together.
- Initial assignments default to 4 gold miners and 1 wood gatherer; total starting workers and food usage are calculated from these assignments (2 food per worker).
- Resource collection sits below the timeline and shows starting resources, base food limit, and all seven player levels by default. Building-level labels follow the selected faction: Castle/Citadel, Farm/Pigsty, Factory/Workshop, and Sanctuary/Dark Gate; Sawmill and Barracks keep their common names; workerLevel appears as Worker level or Slave level. The main four-column grid includes a slider splitting five initial workers between gold and wood. Advanced reveals travel and delay inputs; Hide advanced collapses them without losing edits. Group names and Basic controls are not displayed. JSON import/export still preserves all four profile groups, including Basic.
- Starting wood defaults to 50 and remains editable.
- Export JSON opens the native Save As picker for folder and filename selection in supporting browsers (HTTPS or localhost). Unsupported browsers use their normal download flow; no custom filename dialog is shown.
- Import / Export closes after a successful operation. Import messages, including rules-version warnings, remain visible in a dismissible notice; errors keep the menu open.
- Save shareable link copies a compressed URL containing the full profile and exact action order, without calculated timings. Opening the link restores the plan and recalculates with current rules; rules mismatches warn as with JSON import. If clipboard access is unavailable, copy the displayed link manually. Oversized links suggest JSON export instead.
- The main Resource collection slider edits initial gold/wood allocation in whole workers, always totaling five (default 4 miners and 1 gatherer). Imported profiles retain their saved assignments until the slider is moved; profiles with a different total show a note that moving the slider uses five workers.
- Advanced uses one `goldTravelTime` and one `woodTravelTime` (default 4 seconds each), with each value applied to both outbound and return travel. Initial gold-trip reduction and Sawmill wood-travel rules still apply.
- The delays profile's `orderDelay` controls the first build-order command and additional initial wood gatherers' commands (default 1.0 seconds), plus commands unlocked by recruitment-building completion, completed prerequisites, or increased building capacity. The delay runs from completion and does not repeat between recruits. Initial gold miners and the first wood gatherer start immediately. The basic profile's `initialGoldTravelReduction` shortens initial miners' opening outbound trip (default 1 second), clamped at zero travel; later trips and newly trained miners use full configured travel.
- Newly trained Workers/Slaves automatically join gold up to calculated mine saturation, then gather wood.
- Construction start delay is editable in the game profile (default 4 seconds), and is also used for the builder's return trip. Buildings and building upgrades reserve a builder for both trips and their construction time.
- Builders are selected automatically: idle workers, then wood gatherers carrying the least wood, then eligible gold workers carrying the least gold. Workers inside the mine cannot be selected. Interrupted cargo is discarded; returning workers restart gathering at their previous resource.
- One completed Castle/Citadel is present initially. Each producer trains one unit at a time; additional Castles/Citadels and Barracks have independent queues available after construction completes.
- Temporary source artwork: Terran icons for Light, Protoss icons for Dark.
- Game content is declared in `src/game/data.json`. The app derives each item's producer and explicit prerequisite set in `src/game/gameData.ts`, so expanding the catalog does not require editing the planner UI.
- Choosing an action inserts missing prerequisite quantities and limit-unlocking upgrades in dependency order. Duplicate upgrades require another building at the preceding level; the planner explains rejected actions and blocked orders.
- Heroes use production queues and food like units. Miriel requires Altar of Heroes lvl 1 and Elven Tree lvl 1. Each hero type is limited to one across all Altars, including queued recruitment, allowing at most three Light heroes total (Miriel, Gilbert, and Berin). Removing a hero's order releases that type's reservation.
- The first hero requires at least one Altar level 1 or higher, the second level 2 or higher, and the third level 3. Queued heroes count across all Altars; once the required Altar level is unlocked, any available Altar can recruit that hero. Selecting a hero inserts missing Altar upgrades and their prerequisites automatically.
- Gilbert costs 500 gold / 500 wood / 8 food and requires Altar of Heroes lvl 1 and Human Monument lvl 1. Berin costs 500 gold / 700 wood / 9 food and requires Altar of Heroes lvl 1 and Dwarven Forge lvl 1. Both recruit at the Altar in 45 seconds.
- Production and Racial buildings cost their base gold/wood price multiplied by their copy number (1×, 2×, 3×, ...), counting earlier planned copies including builders in transit. Action cards show the next copy's price. Upgrades and Economic/Defensive buildings retain fixed prices.

Additional game content will be added when its War Legends values are known. Starting resources and base food limit remain editable. Player building levels (integers 1–24, default 1) determine gold/wood yields, Farm/Pigsty food, recruitment bonuses, and worker construction/upgrade bonuses. Worker level reduces construction and upgrade duration by 0–5%, leaving builder travel unchanged. These levels replace direct yield fields in profiles and imports/exports; see `docs/BUILD_ORDER_FILES.md`. SC2-specific active logic (MULEs, larva, gas, and a third faction) is not used. Construction timing and worker selection are detailed in `docs/CONSTRUCTION.md`.

## Run

```sh
npm install
npm start
```

Build the production app with `npm run build`.

See `docs/README.md` for migration context and `ai-changelog/2026-10-08-resource-collection-and-sc2-ui.md` for the latest change record.
