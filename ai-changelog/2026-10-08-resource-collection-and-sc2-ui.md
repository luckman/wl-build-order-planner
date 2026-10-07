# Resource collection and SC2-style planner UI — 2026-10-08

## Added

- Added a War Legends resource simulator with explicit, discrete worker trips.
  - Gold workers travel to a shared one-slot mine, wait when it is occupied, mine, and deliver gold.
  - Wood workers travel, gather, and deliver independently with no shared node limit.
- Added order resource gating: each action waits until recorded gold and wood deliveries can pay its stated cost.
- Added unit tests covering the queued gold-mine schedule and concurrent wood deliveries.
- Added resource-profile controls for starting stocks, worker allocation, and gold/wood yield per trip. Starting resources and worker counts intentionally begin at zero because no confirmed game values have been supplied.
- Replaced the starter catalogue layout with an SC2-planner-inspired dark command interface: top navigation, action palette, build-order panel, resource bars, time scale, and color-coded timeline events.

## Follow-up

- Added hover crosshairs and exact time/value readouts to gold, wood, and food timeline rows.
- Added food-used and food-limit timeline rows, with configurable initial used food, base limit, and Farm/Pigsty contribution. The documented defaults are 20 base food and 20 food per Farm/Pigsty.
- Unit actions now wait when their food cost would exceed the available food limit; food is reserved when unit production is commanded.
- Renamed allocation inputs to **Initial gold miners** and **Initial wood gatherers**.
- Newly completed Worker/Slave actions now assign workers to gold until the calculated mine saturation is reached, then to wood. With the documented 4s/3s/4s gold trip this is four gold miners.

## Game-data policy

- The documented 4s/3s/4s gold trip and 4s/12s/4s wood trip are modeled.
- The 50-resource default yield is the documented lower bound and is exposed as an editable profile input; it is not stored as a confirmed Castle/Sawmill level table.
- Food capacity, worker construction occupancy, production queues, and parallel execution are still not simulated because the confirmed starter data does not provide their rules.

## Verification

- `npm run typecheck`
- `npm run build`
