# War Legends planner bootstrap — 2026-10-07

## Completed

- Copied the usable React/TypeScript application shell and static assets from `sc2-planner` into `wl-build-order-planner`.
- Renamed the package to `wl-build-order-planner`.
- Replaced the application entry UI with a War Legends-only build-order catalogue and planner.
- Added exactly two factions: Light and Dark.
- Added the supplied starter definitions for Castle/Citadel, level-two town-hall upgrades, Sawmill, Farm/Pigsty, Barracks, Worker/Slave, and Swordsman/Goon.
- Reused Terran artwork for Light and Protoss artwork for Dark as requested.
- Removed SC2 mechanics from the active app: upgrades other than the supplied level-two town hall, MULEs, larva, gas/vespene, and the third faction are not reachable or modeled.
- The build-order panel tracks selected items and total gold, wood, food consumption, and listed build time.

## Intentional omissions

- Food capacity is not simulated because no Farm/Pigsty food amount or initial food capacity was supplied.
- Resource-income rates, starting resources/workers, construction-worker occupancy, production queues, and parallel timing are not simulated because their War Legends values were not supplied.
- The copied upstream source remains in the repository as a migration reference but is excluded from TypeScript compilation. Its bulk removal needs a separately approved, targeted cleanup because it includes shared planner UI files as well as SC2-specific code.

## Next data needed

- Starting gold, wood, worker count, and food capacity.
- Food supplied by Farm and Pigsty.
- Gold/wood gathering rates, maximum gatherers, and Sawmill behavior.
- Prerequisites and production queues for further units/buildings.

## Verification

- `npm run build` completed successfully.
- `npm run typecheck` completed successfully against the active application entry point.

## Follow-up

- Bundled the 12 temporary Terran/Protoss icon assets used by the active catalogue so their generated build URLs resolve correctly.
- Removed the copied legacy planner source, tests, and CI workflow from `wl-build-order-planner`.
- Removed legacy game terminology from the active application source and browser title. Temporary icon asset filenames are retained until War Legends artwork is available.
- Added `AGENTS.md` with shared project workflow rules, the confirmed two-faction starter data, and the policy for unknown values.
