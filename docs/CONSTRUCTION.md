# Construction and gathering

This guide describes current construction and building-upgrade behavior for Light Workers and Dark Slaves. See [GAME_MODEL.md](GAME_MODEL.md) for the complete economy overview and [CATALOG_DEPENDENCIES.md](CATALOG_DEPENDENCIES.md) for building and upgrade requirements.

The first build-order command is available at `gameProfile.delays.orderDelay` (default 1.0 seconds). Initial gold miners
and the first initial wood gatherer receive their gathering orders at game
start; any additional initial wood gatherers receive theirs at the configured initial order delay.

The UI labels this setting **Order delay**, stored as
`orderDelay`. Commands also wait this long after a recruitment building
completes or their building prerequisites (including counted buildings, required
levels, and capacity increases) become available. Enough gold, wood, and free food
must also have been available for `orderDelay` before the command, accounting for
costs and food reserved by earlier orders. This includes gathering deliveries,
Resources collected events, completed Farms/Pigsties, and food released by unit losses.
All readiness waits overlap and can elapse while a worker or production queue is
unavailable. Worker availability adds no delay. Subsequent recruitment starts when
the previous recruit finishes if its other readiness waits have already elapsed.

For example, Castle level 2 completing at 01:10 unlocks an Altar command at
01:11, with construction starting at 01:14 using the default three-second builder
travel. An Elven Tree completing at 02:10 unlocks Archer recruitment at 02:11
in an existing available Barracks.

The editable game profile contains `delays.constructionStartDelay`, defaulting to
3 seconds. It applies to every building and building upgrade, and both directions
of builder travel.
There are no per-building overrides or positioning modes.

For a command accepted at time `t`:

- Costs are paid and the selected worker stops gathering at `t`.
- Construction starts at `t + constructionStartDelay`.
- The building or building upgrade completes after its `seconds` duration multiplied by
  `1 - floor((workerLevel - 1) / 4) / 100`, using the base duration from
  `src/game/data.json`.
- The worker returns to its resource after another `constructionStartDelay`.

At worker level 1–4, a 30-second Barracks ordered at 1s therefore starts at 4s, completes at 34s,
and releases its worker back to gathering at 37s. The Barracks can train units
at 35s with the default one-second order delay, if resources and food permit. The builder cannot gather or accept another construction command
before 37s. Multiple buildings can be constructed concurrently when enough
eligible workers and resources are available.

Player `workerLevel` defaults to 1 and is an integer from 1 to 24. The six tiers
(1–4, 5–8, 9–12, 13–16, 17–20, 21–24) reduce construction and upgrade
duration by 0%, 1%, 2%, 3%, 4%, and 5%. Builder travel in both directions,
order delay, and unit recruitment are unaffected by worker level. For example,
at level 21 a 30-second Barracks ordered at 1s starts at 4s, completes at
32.5s, and releases its builder at 35.5s.

## Automatic worker selection

Selection occurs when the command can actually be accepted, after simultaneous
resource deliveries, mine transitions, and worker training completions:

1. Idle workers.
2. Wood workers, ordered by least carried/gathered wood.
3. Gold workers, ordered by least carried gold, excluding workers inside the mine.

Outbound workers and workers waiting outside the mine carry zero. Wood gathered
so far is proportional to time spent chopping; workers returning to deposit carry
a full trip. Worker ID breaks ties for reproducible results. Mine workers become
eligible when they exit the mine; other queued miners can enter the freed slot.
Workers travelling to a building, constructing, or returning are unavailable.
If no eligible worker exists, the command waits for a worker to become eligible.

The planner assigns all five starting workers to gold or wood; the UI permits
1–4 gold miners, while JSON/API opening allocations permit 0–5. The lower-level
worker economy also supports idle workers when its worker count exceeds its
assignments, but the persisted game profile has no idle-worker allocation field.
Newly trained workers retain the existing allocation rule: gold up to mine
saturation, then wood. Workers temporarily constructing still count toward
their previous resource assignment for this allocation rule.

## Interrupted gathering

For this implementation, interrupted cargo and partial gathering progress are
discarded. Any pending delivery for that worker is cancelled. After the return
delay, the worker is at its previous resource and starts gathering from zero
(or queues for the gold mine). No additional normal outbound gathering travel
is charged on this first resumed trip. Subsequent trips use the normal resource
outbound, gathering, and deposit travel times.

Wood example: a worker interrupted at 5s for a 30-second building returns at
43s, chops for 12.1s, then travels 4s to deposit 50 wood at 59.1s. Its originally
scheduled delivery at 20.1s does not occur. This example uses normal four-second
wood travel with no completed Sawmill, gathering reduction, or scroll effect.

Gathering and commands use the same chronological simulation, so lost deliveries
also delay later purchases. Building completion, food capacity, producer queues,
and newly trained workers use the delayed completion times. Command scheduling
uses a maximum 30:00 planning horizon. Commands whose completion or builder
return would exceed 30:00 remain blocked without spending resources or reserving
a builder. The graphs follow the plan within this maximum; they do not extend
beyond it. See [BUILD_ORDER_FILES.md](BUILD_ORDER_FILES.md#supported-plan-limits).

Building upgrades retain their producer-queue behavior while also reserving a
worker for outbound travel, construction, and the return trip. They appear in
the construction timeline lane, including their start, completion, and worker
return timestamps.

## Dark Whip and builder travel

An affected Slave travels toward construction at ×1.15 movement speed while Whip remains active. Activation during travel and expiry preserve distance already traveled. Construction starts at the resulting arrival time and immediately removes Whip; construction duration stays unchanged. Return travel uses normal speed unless a fresh cast activates after construction finishes. A builder already constructing cannot receive the effect. See [WHIP.md](WHIP.md).
