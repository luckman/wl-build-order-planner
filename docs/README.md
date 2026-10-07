# War Legends Build Planner

## Project Overview

This project is a fork/adaptation of
[BurnySc2/sc2-planner](https://github.com/BurnySc2/sc2-planner),
repurposed from StarCraft II build-order planning into a build-order and
economy simulator for **War Legends**, a mobile RTS.

The neighbor project is a React + TypeScript web application that
simulates build orders and calculates when actions can be executed. Its
game data is separated from the application code, currently through
`src/constants/data.json`. The repository also contains a `tests`
directory and a static web build workflow.

The goal of this project is **not** to reproduce the StarCraft II rules.
The goal is to retain useful planner infrastructure---timeline UI,
action sequencing, simulation concepts, and build-order editing---while
replacing the game-specific data and simulation rules with a War Legends
model.

## Primary Goals

1.  Represent War Legends units, buildings, upgrades, costs,
    prerequisites, and base timings.
2.  Model player/account progression as simulation inputs.
3.  Simulate gold and wood income over time.
4.  Model workers as real resources: a worker assigned to construction
    is not gathering.
5.  Model parallel construction and unit production.
6.  Model production-building level bonuses to unit training time.
7.  Model worker-level bonuses to building construction/upgrade time.
8.  Model Castle and Sawmill levels affecting resource yield.
9.  Model worker equipment that changes gathering time.
10. Model realistic construction-start delays caused by worker
    travel/positioning.
11. Display resource levels and parallel activity on a timeline.
12. Allow the user to distinguish theoretical execution from realistic
    execution.
13. Keep game data editable without changing simulation code.

## Non-Goals

-   Do not depend on an external War Legends API.
-   Do not require automated measurement of unit/building timings.
-   Do not assume that War Legends data must be scraped or reverse
    engineered.
-   Do not preserve StarCraft-specific concepts unless they are
    genuinely useful to the generic planner.
-   Do not hard-code player progression into individual unit/building
    definitions.

## Key Design Principle

Separate the project into three layers:

``` text
Game Data
    +
Player Profile
    +
Build Order
    ↓
War Legends Simulator
    ↓
Timeline / Resource State / Validation
    ↓
Planner UI
```

The simulator should know the rules of War Legends, while the UI should
primarily display and edit the resulting timeline.

## Suggested Documentation

-   `GAME_MODEL.md` --- War Legends-specific rules and data model.
-   `IMPLEMENTATION_PLAN.md` --- migration plan from the upstream SC2
    Planner.
