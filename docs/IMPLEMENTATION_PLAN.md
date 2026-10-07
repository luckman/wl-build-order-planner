# Implementation Plan

## 1. Starting Point

Use the current `BurnySc2/sc2-planner` repository as the starting point.

The upstream project is a React + TypeScript web application designed to
simulate StarCraft II build orders. Its repository contains:

``` text
src/
tests/
public/
package.json
tsconfig.json
playwright.config.ts
```

StarCraft II game data is currently represented through
`src/constants/data.json`, and the upstream README describes that data
file as something that is replaced when updating the SC2 tech tree.

The adaptation should preserve the useful generic planner/UI
infrastructure while removing assumptions that are specific to StarCraft
II.

------------------------------------------------------------------------

# 2. Migration Strategy

Do not immediately rewrite the entire project.

First identify the existing code in these categories:

``` text
A. Generic planner state
B. Build-order action model
C. Timeline rendering
D. Resource simulation
E. Production/worker simulation
F. SC2-specific data
G. SC2-specific rules
H. SC2-specific UI assumptions
```

The desired end state is:

``` text
Generic Planner
      +
War Legends Game Model
      +
War Legends Data
      ↓
War Legends Planner
```

------------------------------------------------------------------------

# 3. Phase 1 --- Repository Audit

Before modifying code, map the repository.

Identify:

-   application entry point;
-   main React components;
-   build-order state;
-   simulation engine;
-   resource calculation;
-   production calculation;
-   action definitions;
-   game-data loading;
-   timeline components;
-   resource display;
-   tests;
-   SC2-specific constants and utilities.

Create an internal dependency map.

The most important goal of this phase is to determine which parts can be
retained unchanged.

------------------------------------------------------------------------

# 4. Phase 2 --- Extract Game Abstractions

Introduce a game-neutral domain model.

Suggested concepts:

``` text
Resource
UnitDefinition
BuildingDefinition
UpgradeDefinition
ProductionDefinition
Prerequisite
Worker
WorkerState
PlayerProfile
GameRules
BuildOrderAction
SimulationEvent
SimulationState
```

Avoid naming generic components after StarCraft concepts unless the
concept is truly generic.

For example:

``` text
Supply
```

should not be assumed to exist in the generic simulator.

If War Legends has a different population mechanic, it should be
represented by the game model.

------------------------------------------------------------------------

# 5. Phase 3 --- Replace SC2 Data

Remove the dependency on SC2 tech-tree data.

Create structured War Legends data.

Suggested directory:

``` text
src/game/
  data/
    units.json
    buildings.json
    upgrades.json
    progression.json
    modifiers.json
```

### `units.json`

Contains:

``` text
id
name
cost
baseTrainingTime
populationCost
producer
prerequisites
```

### `buildings.json`

Contains:

``` text
id
name
cost
baseConstructionTime
builderRequired
produces
upgrades
prerequisites
```

### `progression.json`

Contains:

``` text
Castle level → gold per trip
Sawmill level → wood per trip
Worker level → construction bonus
Production building level → training bonus
```

### `modifiers.json`

Contains:

``` text
worker equipment
gathering modifiers
other global/profile modifiers
```

Keep all manually entered game values outside the simulation code.

------------------------------------------------------------------------

# 6. Phase 4 --- Implement Player Profile

Create a profile object such as:

``` ts
interface PlayerProfile {
  castleLevel: number;
  sawmillLevel: number;
  workerLevel: number;

  productionBuildingLevels: Record<string, number>;

  workerEquipment: WorkerEquipment;

  initialResources: Resources;
  initialWorkers: number;
}
```

The profile controls account progression.

It must not modify the base definitions of units or buildings.

------------------------------------------------------------------------

# 7. Phase 5 --- Rework Resource Simulation

The simulator must calculate resource income through gathering cycles.

Do not reduce the economy to a simple constant income rate.

A worker should have a resource-gathering cycle:

``` text
start gathering
    ↓
gathering time
    ↓
resources collected
    ↓
return/deposit
    ↓
new cycle
```

The actual game behavior should be encoded according to War Legends
data.

The Castle and Sawmill levels determine the quantity gained per cycle.

Worker equipment may alter the cycle duration.

------------------------------------------------------------------------

# 8. Phase 6 --- Rework Worker Simulation

Workers must be individually trackable.

At minimum:

``` text
worker.id
worker.state
worker.assignment
worker.availableAt
```

States:

``` text
GATHERING_GOLD
GATHERING_WOOD
MOVING_TO_BUILD
BUILDING
UPGRADING
IDLE
```

A worker assigned to a building cannot simultaneously gather resources.

When construction finishes:

``` text
BUILDING → IDLE/GATHERING
```

The simulator should automatically account for the lost gathering
opportunity.

------------------------------------------------------------------------

# 9. Phase 7 --- Add Construction Travel / Positioning Delay

Introduce a separate property for construction start delay.

Example:

``` ts
interface ConstructionOptions {
  startDelay: number;
  mode: "normal" | "prepositioned" | "custom";
}
```

The action lifecycle becomes:

``` text
Order issued
    ↓
Worker selected
    ↓
Worker moves to location
    ↓
Construction starts
    ↓
Construction completes
```

The delay must not be included in the building's nominal construction
time.

This allows the UI to display:

``` text
Command: 01:20
Start:   01:23
Finish:  01:53
```

------------------------------------------------------------------------

# 10. Phase 8 --- Add Building-Level Training Modifiers

When a unit is queued:

``` text
effectiveTime =
  unit.baseTrainingTime *
  (1 - productionBuildingLevelBonus)
```

The exact modifier comes from the progression data.

Each production building instance must retain its own level.

Example:

``` text
Barracks #1 Lv.3
Barracks #2 Lv.5
```

These two buildings may therefore produce the same unit at different
speeds.

------------------------------------------------------------------------

# 11. Phase 9 --- Add Worker-Level Construction Modifiers

For buildings and upgrades:

``` text
effectiveTime =
  baseConstructionTime *
  (1 - workerConstructionBonus)
```

The worker performing the action determines the modifier.

If the game instead applies the bonus globally, encode that rule in
`GameRules` rather than duplicating the value on every worker.

------------------------------------------------------------------------

# 12. Phase 10 --- Parallel Simulation

The simulator must support parallel activity:

``` text
Worker #1 → Gold
Worker #2 → Wood
Worker #3 → Building
Worker #4 → Gold

Barracks #1 → Soldier
Barracks #2 → Soldier

Stable #1 → Knight

Building #1 → construction
Building #2 → upgrade
```

These activities must advance independently.

The simulation should resolve events chronologically.

------------------------------------------------------------------------

# 13. Phase 11 --- Build-Order Action Model

A build-order entry should contain enough information to reproduce the
intended action.

Example:

``` ts
interface BuildOrderAction {
  time?: number;
  type: ActionType;
  target: string;

  constructionMode?: "normal" | "prepositioned" | "custom";
  constructionDelay?: number;

  workerId?: string;
  producerId?: string;
}
```

The exact shape should follow the existing planner architecture where
practical.

The important distinction is:

``` text
Player intent
vs.
Simulation result
```

The user should be able to specify an action without manually
calculating its resulting timestamp.

------------------------------------------------------------------------

# 14. Phase 12 --- Timeline UI

Retain the useful timeline concepts from the SC2 Planner but adapt them
to War Legends.

The timeline should contain separate lanes for:

``` text
Resources
Workers
Buildings
Production
Upgrades
Events
```

Example:

``` text
TIME      0:00       0:30       1:00       1:30

WORKERS
W1        GOLD ───────────────── BUILD ───── GOLD
W2        WOOD ────────────────────────────────
W3        GOLD ───────── BUILD ────────────────

BUILDINGS
Barracks             ███████████
Stable                         ███████████

PRODUCTION
Barracks             Soldier ███ Soldier ███
Stable                           Knight █████

RESOURCES
Gold       100 → 160 → 210 → 170 → 240
Wood        50 →  90 → 140 → 110 → 180
```

------------------------------------------------------------------------

# 15. Phase 13 --- Resource Inspection

At any timeline position, the user should be able to inspect:

``` text
Gold
Wood
Workers on gold
Workers on wood
Workers constructing
Idle workers
Available buildings
Active production
Queued production
```

The UI should also explain why an action cannot be performed.

Example:

``` text
Knight
✗ Not enough gold
  Required: 180
  Available: 143
  Expected: +42 in 2.1s
```

------------------------------------------------------------------------

# 16. Phase 14 --- Practical Execution Mode

Add a toggle:

``` text
Execution Mode

( ) Theoretical
(●) Practical
```

### Theoretical

Construction starts immediately after command.

### Practical

Construction uses the configured positioning delay.

For important buildings the action can override the default:

``` text
Stable:
  Pre-position worker = true
```

This produces a more realistic build order.

------------------------------------------------------------------------

# 17. Phase 15 --- Data Entry Tooling

Because the game exposes unit/building parameters in its UI, initial
data can be entered manually.

Do not build scraping or measurement tooling into the MVP.

However, make the data format convenient enough that a future data-entry
UI can be added.

Recommended:

``` text
Game Data Editor
  ├── Units
  ├── Buildings
  ├── Upgrades
  ├── Castle levels
  ├── Sawmill levels
  ├── Worker levels
  ├── Production building levels
  └── Worker equipment
```

------------------------------------------------------------------------

# 18. Phase 16 --- Testing

Build simulator tests before heavily modifying the UI.

Minimum test categories:

## Resource Tests

-   worker gathering gold;
-   worker gathering wood;
-   Castle level changes gold yield;
-   Sawmill level changes wood yield;
-   gathering-time equipment changes income.

## Worker Tests

-   worker becomes unavailable during construction;
-   worker returns to gathering after construction;
-   multiple workers gather independently.

## Construction Tests

-   construction cost is paid;
-   construction start delay is applied;
-   pre-positioned construction has zero delay;
-   worker level changes construction duration.

## Production Tests

-   production building must exist;
-   production building level changes training duration;
-   two production buildings operate independently;
-   queues operate correctly.

## Build Order Tests

-   resources are sufficient;
-   insufficient-resource actions are rejected or delayed;
-   prerequisites are enforced;
-   changing an earlier action recalculates later actions.

## Regression Tests

Keep representative examples from the upstream SC2 planner if useful
until the genericized simulator is stable. Then replace SC2-specific
assertions with War Legends tests.

------------------------------------------------------------------------

# 19. Recommended Implementation Order

Do not implement everything simultaneously.

Recommended sequence:

``` text
1. Audit existing repository
2. Identify generic vs SC2-specific code
3. Introduce game-neutral data interfaces
4. Add War Legends static data
5. Implement PlayerProfile
6. Implement Gold/Wood gathering
7. Implement individual worker states
8. Implement building construction
9. Add worker construction bonus
10. Add construction positioning delay
11. Implement production queues
12. Add production-building level bonus
13. Implement upgrades
14. Add practical/theoretical modes
15. Adapt timeline UI
16. Add resource inspection
17. Add validation/error states
18. Add complete test suite
19. Remove remaining SC2-specific dependencies
20. Polish and deploy
```

------------------------------------------------------------------------

# 20. Definition of Done for MVP

The MVP is complete when a user can:

1.  Select their Castle level.
2.  Select their Sawmill level.
3.  Select their Worker level.
4.  Configure production-building levels.
5.  Configure worker equipment.
6.  Set initial resources/workers.
7.  Add buildings to a build order.
8.  Add units to production queues.
9.  Assign workers to gold, wood, and construction.
10. See construction positioning delays.
11. See actual construction start/completion times.
12. See parallel production.
13. See resources over time.
14. See why an action is unavailable.
15. Switch between theoretical and practical execution.
16. Save/export the build order.

------------------------------------------------------------------------

# 21. Architectural Target

The final project should conceptually look like:

``` text
src/
  app/
  components/
    timeline/
    resources/
    workers/
    production/
    build-order/
  game/
    data/
      units.json
      buildings.json
      upgrades.json
      progression.json
      modifiers.json
    model/
      resources.ts
      units.ts
      buildings.ts
      workers.ts
      player-profile.ts
      rules.ts
    simulation/
      simulator.ts
      events.ts
      resource-simulation.ts
      worker-simulation.ts
      production-simulation.ts
      construction-simulation.ts
  build-order/
    actions.ts
    state.ts
  tests/
```

The exact directory structure should be adapted to the upstream
repository after the initial code audit.

------------------------------------------------------------------------

# 22. Important Design Constraint

Do not hard-code assumptions about War Legends into reusable UI
components.

Prefer:

``` text
GameRules
GameData
PlayerProfile
SimulationState
```

over:

``` text
if (isWarLegends) ...
```

The resulting architecture should make it possible to support another
RTS later without rewriting the simulator and timeline from scratch.

------------------------------------------------------------------------

# 23. Reference

Upstream project:

https://github.com/BurnySc2/sc2-planner

The upstream repository is licensed under the MIT License and describes
itself as a React/TypeScript StarCraft II build-order simulator. Its
current repository contains `src`, `tests`, and game data under
`src/constants/data.json`.

The adaptation should retain appropriate upstream copyright and license
information.
