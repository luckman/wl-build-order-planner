# Game-data catalog and prerequisites

- Moved the Light and Dark starter catalogs from the React component into `src/game/data.json`.
- Added `src/game/gameData.ts`, which derives each item's producer and named prerequisite set from raw `produces`, `upgrades`, and `requires` relationships.
- The scheduler now waits for configured prerequisites to complete before issuing a command.
- Added focused tests for both faction catalogs.
- Made worker/slave construction a code rule for every building rather than data on each worker, and added Barracks plus Farm/Pigsty requirements to the level-2 town-hall upgrades.
- Added recursive prerequisite insertion when an action is selected, and corrected the Barracks spelling across the project.
