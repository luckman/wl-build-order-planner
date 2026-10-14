# War Legends Game Model

## 1. Overview

The planner should model War Legends as an event-driven RTS economy and production system.

The important distinction is between:

- an **order** issued by the player;
- the **actual start** of the action;
- the **completion** of the action.

For example:

```text
01:20  Player orders Barracks
01:23  Worker reaches construction location
01:23  Construction starts
01:53  Construction completes
```

The planner must represent these as separate events.

### Initial state (confirmed)

At time 0 the Light faction has one completed Castle; the Dark faction has
one completed Citadel. This initial building is available to produce workers
immediately, without construction cost or delay.

The default starting workforce is five Workers/Slaves: four assigned to gold
and one to wood. Initial assignments remain editable; starting food usage is
2 per worker (10 food for the default five).

---

## 2. Resources

The current target resource model includes:

- Gold
- Wood
- Food capacity

The planner should track both the current amount of spendable resources and the parameters that determine future income/capacity.

Costs do not depend on account level. Production and Racial buildings multiply their base gold and wood costs by the copy number of that same building: the first costs 1×, the second 2×, the third 3×, and so on. Earlier planned copies count immediately, including orders whose workers are still travelling. Different building IDs have independent counts. Building upgrades neither receive the multiplier nor increase the initial building's count. Economic and Defensive buildings, units, and upgrades retain fixed costs.

A resource state at time `t` should be derivable from:

```text
initial resources
+ completed gathering deliveries
- completed expenditures
```

Food is different from Gold/Wood: it represents a population/capacity limit and is increased by building Farms.

---

## 3. Gold Gathering

Gold gathering should be modeled as an explicit worker-to-mine cycle rather than a constant income rate.

### Gold Mine Constraints

A gold mine can contain:

```text
maximum 1 worker at a time
```

The mine therefore behaves like a single-server queue.

Multiple workers can be assigned to the same mine, but only one can be actively mining at any given time. Other workers wait for the mining spot to become available or remain in transit.

### Gold Yield

Each completed mine trip provides:

```text
50–55 gold
```

The exact amount depends on **Castle level**.

Example conceptual model:

```text
goldPerTrip = castleLevelTable[castleLevel]
```

The confirmed player-level tiers are implemented in `src/game/playerLevels.ts`; player progression is distinct from in-match Castle/Citadel upgrades.

### Gold Mining Time

Default time spent inside the mine:

```text
3.10 seconds
```

Worker items can reduce this time.

Example:

```text
effectiveMiningTime = baseGoldMiningTime - goldMiningTimeReduction
```

`gameProfile.player.goldMiningTimeReduction` is entered in seconds, defaults to 0.0, and accepts values from 0.0 to 1.0. The editor displays one decimal digit and steps by 0.1 seconds. It reduces every mine visit, including the opening trip, and affects mine queues and worker saturation. Gold travel time and yield are unchanged. The simulator keeps gathering duration at least 0.001 seconds if a custom base time is smaller than the reduction.

### Travel Time

The time from the Town Hall to the gold mine is a configurable parameter.

Default:

```text
4 seconds
```

Initial gold miners take one second less on this opening outbound trip only.
Their later outbound trips, return trips, and every trip by newly trained workers
use the configured 4-second defaults.

The return trip should also be configurable.

Default:

```text
4 seconds
```

The simulator should therefore not hard-code a universal worker movement time.

Suggested profile/configuration:

```json
{
  "gold": {
    "outboundTravelTime": 4.0,
    "returnTravelTime": 4.0,
    "baseMiningTime": 3.10
  }
}
```

### Gold Worker Cycle

For a worker with no queue delay:

```text
4s travel to mine
3.10s mine
4s return
----------------
11.10s total
```

However, when multiple workers share one mine, queueing changes the effective cycle.

### Three Workers

With 3 workers assigned to the same mine:

```text
4s travel
3.10s mining
4s return
= 11.10s per worker cycle
```

Three workers are not enough to keep the mine continuously occupied.

In steady-state terms:

```text
3 workers × 3.10s mining = 9.30 worker-seconds of mining
11.10-second cycle
```

so the mine has idle periods.

A typical staggered schedule can look conceptually like:

```text
Worker 1:   [MINE 4–7]          [MINE 15–18] ...
Worker 2:            [MINE 7–10]          [MINE 18–21] ...
Worker 3:                    [MINE 10–13]          [MINE 21–24] ...
Mine idle:                          [13–15]
```

Exact timing depends on initial worker positions and dispatch order.

### Four Workers

With 4 workers, the mine can remain continuously occupied.

Each worker spends approximately:

```text
4s travel to mine
1s average/steady-state queue wait
3.10s mining
4s return
----------------
approximately 12.40s effective cycle
```

The 1-second wait follows from the fact that the mine has one mining slot and the four workers collectively need to occupy that slot continuously:

```text
4 workers × 3.10s mining = 12.40s of mining demand
```

while the non-queue portion of an individual cycle is:

```text
4s + 3.10s + 4s = 11.10s
```

so roughly 1 additional second per worker is spent waiting in the mine queue in steady state.

This should be treated as an emergent property of the event simulation rather than hard-coded as:

```text
4 workers => exactly 1 second wait
```

The simulator should calculate the actual queue time from worker arrival times and mine availability.

### Gold Gathering State

A gold worker can be in states such as:

```text
MOVING_TO_GOLD_MINE
WAITING_FOR_MINE
MINING_GOLD
RETURNING_GOLD
```

When gold is delivered, the worker starts another trip unless reassigned.

---

## 4. Wood Gathering

Wood gathering is similar to gold gathering but does **not** have the same single-worker mine constraint.

There is effectively abundant access to trees for the workers:

- multiple workers can harvest at the same time;
- multiple workers can work on the same tree;
- there is no `maximum 1 worker gathering simultaneously` constraint.

Therefore, wood gathering can be modeled independently per worker without a shared single-server queue.

### Wood Yield

Each completed wood trip provides:

```text
50–55 wood
```

The exact amount depends on **Sawmill level**.

Conceptual model:

```text
woodPerTrip = sawmillLevelTable[sawmillLevel]
```

The exact level table should be stored as game data.

### Wood Mining/Chopping Time

Default time spent gathering wood:

```text
12.1 seconds
```

Worker items can reduce this time.

Example:

```text
effectiveWoodGatherTime = baseWoodGatherTime - woodMiningTimeReduction
```

`gameProfile.player.woodMiningTimeReduction` is entered in seconds, defaults to 0.0, and accepts values from 0.0 to 5.0. The editor displays one decimal digit and steps by 0.1 seconds. It reduces every wood gathering phase, including after a Sawmill completes. Wood travel time and yield are unchanged. The simulator keeps gathering duration at least 0.001 seconds if a custom base time is smaller than the reduction.

### Travel Time

The normal time between the Town Hall and the tree is configurable.

Default:

```text
4 seconds
```

The return trip is also configurable.

Default:

```text
4 seconds
```

Conceptual cycle:

```text
4s travel to tree
12.1s gather wood
4s return
----------------
20.1s total
```

The exact cycle should be calculated from the configured travel and item modifiers.

### Nearby Sawmill

A completed Sawmill is treated as a nearby wood deposit point. Each newly completed Sawmill resets travel time for all wood gatherers to 0.5 seconds in each direction (outbound and return). Travel time then increases by 0.5 seconds per full minute since the most recent Sawmill completion, capped at 4 seconds:

```text
fullMinutes = floor((currentTime - latestSawmillCompletionTime) / 60)
woodTravelTime = min(4, 0.5 + 0.5 * fullMinutes)
```

| Time since latest Sawmill completion | Travel time each way |
| --- | --- |
| 0–59.999… seconds | 0.5 seconds |
| 60–119.999… seconds | 1 second |
| 120–179.999… seconds | 1.5 seconds |
| 180–239.999… seconds | 2 seconds |
| 240–299.999… seconds | 2.5 seconds |
| 300–359.999… seconds | 3 seconds |
| 360–419.999… seconds | 3.5 seconds |
| 420 seconds onward | 4 seconds |

Before any Sawmill completes, workers use the configured normal wood travel times (default 4 seconds each way). Only completed Sawmills reset the timer; queued or unfinished Sawmills have no effect. Each travel leg uses the duration calculated when that leg starts. A travel leg already in progress keeps its original duration across minute boundaries and Sawmill completions. Chopping time, wood per trip, gold travel, and construction travel are unchanged.

For example:

```json
{
  "wood": {
    "outboundTravelTime": 4.0,
    "returnTravelTime": 4.0,
    "nearbySawmillOutboundTime": 0.5,
    "nearbySawmillReturnTime": 0.5,
    "sawmillTravelIncreasePerMinute": 0.5,
    "sawmillMaxTravelTime": 4.0,
    "baseGatherTime": 12.1
  }
}
```

The Sawmill timer rule applies to both Light and Dark factions.

### Wood Worker State

A wood worker can be in:

```text
MOVING_TO_TREE
GATHERING_WOOD
RETURNING_WOOD
```

Multiple wood workers may gather in parallel with no resource-node capacity limit.

---

## 5. Worker Allocation and Economy

Additional worker states (any other states can be added as needed):

```text
MOVING
IDLE
BUILDING
UPGRADING
```

Because workers are individual simulation entities, changing worker allocation must change the future resource curve.

Example:

```text
Worker 1 → Gold
Worker 2 → Gold
Worker 3 → Gold
Worker 4 → Gold
Worker 5 → Wood
Worker 6 → Wood
Worker 7 → Building
```

Worker #7 does not contribute to Gold or Wood income while constructing.

This is a key difference from a simple fixed-income build-order calculator.

The planner should allow the user to inspect:

```text
Gold workers
Wood workers
Building workers
Idle workers
```

at any point in time.

---

## 6. Castle Level

Castle/Citadel player level is stored as `gameProfile.player.townHallLevel` (integer 1–24, default 1).

It affects the amount of gold obtained per completed mining trip.

Conceptually:

```text
Castle Level
    ↓
Gold per trip
    ↓
Gold income
    ↓
Build-order timing
```

Example data structure:

```json
{
  "castle": {
    "goldPerTripByLevel": {
      "1": 50,
      "5": 51,
      "9": 52
    }
  }
}
```

Confirmed yields increase every four levels: gold/wood 50/51/52/53/54/55 and Farm/Pigsty food 20/21/22/23/24/25.

---

## 7. Sawmill Level

Sawmill player level is stored as `gameProfile.player.sawmillLevel` (integer 1–24, default 1).

It affects the amount of wood obtained per completed gathering trip.

Example:

```json
{
  "sawmill": {
    "woodPerTripByLevel": {
      "1": 50,
      "2": 51,
      "3": 52
    }
  }
}
```

The exact values should be populated manually.

---

## 8. Worker Level

Worker level affects construction and building-upgrade time.

Known behavior:

```text
Worker level 1/5/9/13/17/21 → 0%/1%/2%/3%/4%/5% construction-time reduction
```

The confirmed `gameProfile.player.workerLevel` mapping is implemented in `src/game/playerLevels.ts`. The default is 1, maximum 24. It affects construction and building upgrades but leaves worker travel and unit production bonuses unchanged.

For a base construction time:

```text
effectiveConstructionTime =
    baseConstructionTime * (1 - workerConstructionBonus)
```

The planner uses this duration-reduction formula, matching the existing production-bonus convention.

---

## 9. Production Building Level

Player production levels reduce unit training time by 1%/2%/3%/4%/5%/6% at levels 1/5/9/13/17/21 (maximum 24). The fields are `townHallLevel` for Workers/Slaves, `barracksLevel` for Barracks, `industrialBuildingLevel` for Factory/Workshop, and `arcaneBuildingLevel` for Sanctuary/Dark Gate. All default to 1; there is no zero-bonus tier. Production levels do not affect construction or building upgrades; those durations use workerLevel. Other producers, including Altar of Heroes, retain base recruitment times.

For example:

```text
baseTrainingTime = 20s
productionBonus = 4%

effectiveTrainingTime = 20 * (1 - 0.04)
                      = 19.2s
```

The bonus belongs to the production building instance/profile, not to the unit itself.

This allows:

```text
Barracks Lv.2 → Soldier = X seconds
Barracks Lv.5 → Soldier = Y seconds
```

without duplicating the Soldier definition.

---

## 10. Food Capacity

Food is modeled as a capacity rather than as a continuously gathered resource.

There is a base food capacity.

Default:

```text
20
```

Farms increase the available food capacity.

Default contribution per completed Farm:

```text
+20 food capacity
```

Conceptually:

```text
foodCapacity =
    baseFoodCapacity
    + sum(completedFarm.foodCapacityBonus)
```

Example:

```text
Base capacity: 20
Farm #1:       +20
Farm #2:       +20
-------------------
Total:          60
```

The exact terminology and population-consumption rules should be adapted to the actual War Legends mechanics.

The important simulator requirement is that unit production must be checked against the current available food capacity.

If unit production consumes population immediately, the simulator should model:

```text
currentFoodUsed
currentFoodCapacity
```

and reject/delay production when:

```text
currentFoodUsed + unitFoodCost > currentFoodCapacity
```

If the game uses a different timing for population reservation, that rule should be encoded in `GameRules`.

Farm construction itself is a normal building action and therefore can require a worker and a construction period.

---

## 11. Buildings

Each building should contain at least:

```text
id
name
cost
baseConstructionTime
prerequisites
productionCapabilities
upgradeCapabilities
```

Example:

```json
{
  "id": "barracks",
  "name": "Barracks",
  "cost": {
    "gold": 150,
    "wood": 100
  },
  "baseConstructionTime": 30,
  "produces": ["soldier"]
}
```

The actual War Legends values should be entered manually.

The current starter catalog is stored in `src/game/data.json`. Buildings are
always constructed by the faction's worker as a planner rule; unit and upgrade
producers use `produces` and `upgrades` on the producing item, and targets use
`requires`. `src/game/gameData.ts` derives the planner-facing producer and
prerequisite information from those relationships.

---

## 12. Units

Each unit should contain at least:

```text
id
name
cost
baseTrainingTime
foodCost
prerequisites
producer
```

Example:

```json
{
  "id": "soldier",
  "name": "Soldier",
  "cost": {
    "gold": 80,
    "wood": 20
  },
  "baseTrainingTime": 12,
  "foodCost": 1,
  "producer": "barracks"
}
```

Costs are assumed to be constant across account progression unless the game proves otherwise.

---

## 13. Construction Delay

The implemented profile has one configurable `constructionStartDelay`, default
4 seconds, used for travel both to the building and back to the resource.
Construction itself uses the building's `seconds` value from `data.json`.
There are no custom per-action delays or positioning modes in the current UI.

The worker stops gathering at command acceptance and remains unavailable through
travel, construction, and return. Building availability starts at completion,
before the worker returns. See `CONSTRUCTION.md` for selection priorities and the
documented decision to discard interrupted cargo and restart gathering from zero.

---

## 14. Command Time vs. Start Time

Every construction action should expose at least:

```text
commandTime
startTime
completionTime
```

Example:

```text
Barracks

commandTime:    01:20
startTime:      01:24
completionTime: 01:54
workerReturnTime: 01:58
```

This distinction is important for execution-oriented build orders.

The planner should tell the player when to issue the command, not only when the building finishes.

---

## 15. Theoretical vs. Practical Build (future modes)

The following named modes are future design ideas. The current implementation
uses only the shared profile delay; setting it to zero removes both travel legs.

### Theoretical

Assume perfect positioning:

```text
constructionStartDelay = 0
```

This shows the mathematical optimum.

### Practical

Apply the configured construction delay.

Example:

```text
                 Theoretical    Practical

Barracks start     01:34.0       01:37.0
Barracks finish    01:59.0       02:02.0
```

This makes the planner more useful for real gameplay.

---

## 16. Production Queues

Production buildings should have explicit queues.

Castle/Citadel produces Workers/Slaves, and Barracks produces Swordsmen/Goons.
Each building instance can train only one unit at a time. Training requires a
completed producer and waits for its slot, resources, and food capacity.
For example, a Worker started at 17s finishes at 35s, so the next Worker from
that Castle cannot start before 35s. A newly built producer becomes available
only when its construction finishes. Additional producer instances have
independent slots.

Example:

```text
Barracks #1
    Soldier
    Soldier
    Soldier

Barracks #2
    Soldier
    Soldier

Stable #1
    Knight
```

Production on one building must not block production on another unless the game rules require it.

The simulator should therefore track production per building instance.

---

## 17. Worker Construction and Gathering Interaction

When a worker starts building (worker involvement in upgrades remains future work):

```text
worker leaves gathering
worker becomes unavailable
construction proceeds
worker travels back to its resource
worker becomes available again
worker resumes or receives a new assignment
```

This should immediately affect the future resource curve.

Example:

```text
02:00  Worker #4 is gathering gold
02:10  Worker #4 receives construction order
02:14  Worker #4 starts building Barracks
02:44  Barracks completes
02:48  Worker #4 is available again at its resource
```

There is no gold/wood income from Worker #4 while it is:

```text
moving to construction
building
returning to its resource
```

---

## 18. Event Model

A useful internal event model is:

```text
ResourceGatheringStarted
ResourceArrived
WorkerArrived
GoldMineSpotFreed
GoldMineSpotOccupied
BuildingConstructionOrdered
BuildingConstructionStarted
BuildingConstructionFinished
BuildingUpgradeStarted
BuildingUpgradeFinished
UnitTrainingStarted
UnitTrainingFinished
WorkerAssigned
WorkerFreed
FarmCompleted
FoodCapacityChanged
```

The exact implementation can differ, but the simulator should preserve the distinction between scheduled actions and their actual state transitions.

---

## 19. Player Profile

A build should be evaluated against a player profile.

Example player block (see `BUILD_ORDER_FILES.md` for the complete persisted profile):

```json
{
  "player": {
    "startingGold": 150,
    "startingWood": 50,
    "baseFoodLimit": 20,
    "townHallLevel": 8,
    "sawmillLevel": 6,
    "farmLevel": 1,
    "barracksLevel": 5,
    "industrialBuildingLevel": 1,
    "arcaneBuildingLevel": 1,
    "workerLevel": 1
  }
}
```

This allows the same build order to be tested for different account progression levels.

---

## 20. Game Data vs. Player Data

Do not mix these two categories.

### Game data

Static definitions:

```text
unit costs
unit base training times
unit food costs
building costs
building base construction times
prerequisites
Castle-level gold yield table
Sawmill-level wood yield table
Worker-level construction modifiers
Production-building-level training modifiers
Worker-item gathering modifiers
default travel times
default nearby-Sawmill travel time
base food capacity
Farm food-capacity bonus
```

### Player data

Current configuration:

```text
Castle level
Sawmill level
Worker level
Production building levels
Worker equipment
Initial resources
Initial workers
Travel-time overrides
Construction-delay settings
```

This separation is essential because account progression changes simulation results without changing the underlying unit/building definitions.

---

## 21. Manual Data Entry

The game exposes the relevant unit/building parameters in its UI, but does not necessarily provide them as a convenient public table.

Therefore, the initial dataset should be manually transcribed into structured files.

No measurement system is required for the first version.

Recommended structure:

```text
src/game/
  data/
    units.json
    buildings.json
    upgrades.json
    progression.json
    modifiers.json
    economy.json
```

The data should be easy to update when the game changes.

---

## 22. Validation

The simulator should detect at least:

- insufficient resources;
- missing prerequisites;
- unavailable production building;
- unavailable worker;
- food/population capacity exceeded;
- invalid upgrade level;
- duplicate or impossible actions;
- production queue conflicts;
- invalid or unreachable worker assignments.

The UI should clearly distinguish:

```text
Valid
Warning
Impossible
```

---

## 23. Example Economy Timeline

A useful visualization should expose the separate components of a worker's economy cycle.

### Gold

```text
Worker #1

0:00         0:04      0:07          0:11      0:15
|------------|---------|-------------|---------|
Town Hall    Arrive    Mine          Return    Arrive again
             at mine   3.10s         4s        at mine

                [waiting is inserted here when the mine is occupied]
```

With four workers, the mine can be continuously active:

```text
Mine:
W1 [====] W2 [====] W3 [====] W4 [====] W1 [====] ...
     3.10s    3.10s    3.10s    3.10s    3.10s

Worker cycle is approximately 12.40s in steady state:
4s outbound + ~1.30s queue + 3.10s mining + 4s return.
```

With three workers, the mine is not continuously active:

```text
Mine:
W1 [====] W2 [====] W3 [====] ..idle.. W1 [====] ...
     3.10s    3.10s    3.10s    1.70s
```

The exact schedule should always be generated by the simulator, including worker starting positions and event order.

---

## 24. Future Extensions

Potential future features:

- import/export player profiles;
- saved build orders;
- build-order comparison;
- theoretical vs. practical comparison;
- configurable construction delays per building;
- optimized worker allocation;
- automatic search for earlier completion;
- automatic worker reassignment;
- gold-mine queue visualization;
- shareable build-order URLs;
- patch/versioned game data.

## Lumber Gathering Scroll

The Light Lumber Gathering scroll costs 25 mana, activates at command time + 1 second, and lasts 30 seconds. Levels 1–6 currently share a +15 wood cargo bonus (65 rather than 50 at default yield). The forest effect checks each worker's gathering-completion time: start is inclusive and expiry exclusive. This applies to workers already gathering, travelling to the forest, recruited later, or returning from construction. A returning worker's existing cargo is unchanged; its next gathering completion can receive the bonus. Cargo is fixed at gathering completion and retains any bonus when delivered after expiry. Overlapping casts do not stack; interrupted loads are discarded. Timing uses the configured travel and effective gathering durations, including Sawmill travel and equipment reductions.


## Add resources events

Both factions can add gold and wood at an explicit timestamp with no delays, mana costs, or worker requirements. The action card follows scrolls in the heroes row. The dialog defaults to 300 gold and 300 wood and one second after the latest active command; users can choose any timestamp from 00:00 to 99:59. Click the Build order row to edit the timestamp or amounts. Events persist in drafts, JSON files and share links.

## Mana well ownership

Ownership starts at zero. Capture mana well increases ownership by one at its exact command timestamp; Lose mana well decreases it by one only when at least one well is owned. There are no costs or delays. Evaluate in timestamp order and use source order for ties, including simultaneous captures and losses. Invalid losses remain blocked and do not change ownership or mana.

Mana regenerates at `manaAccumulation + ownedWells * manaFromManaWells` per minute. Integrate separately across each capture/loss, capacity completion and scroll spend. Capacity still limits regeneration and capped income is discarded. Automatic scroll suggestions use the changing rate and retain scroll order-delay rules.

## Lose unit

Both factions can lose one worker, unit or hero at a selected timestamp. Only completed, living units are eligible; starting workers exist at 00:00. Loss releases food immediately, and lost workers stop gathering. Construction workers are excluded; wood gatherers are lost before gold miners. The dialog accepts whole seconds and defaults to one second after the latest active command. Invalid events have no effect and show a warning. Events are editable and included in drafts, JSON and share links.
