# Construction and gathering

This guide describes current construction and building-upgrade behavior for Light Workers and Dark
Slaves. See [GAME_MODEL.md](GAME_MODEL.md) for the complete economy overview and
[CATALOG_DEPENDENCIES.md](CATALOG_DEPENDENCIES.md) for building and upgrade requirements.

The first build-order command is available at `gameProfile.delays.orderDelay` (default 1.0 seconds).
Initial gold miners and the first initial wood gatherer receive their gathering orders at game
start; any additional initial wood gatherers receive theirs at the configured initial order delay.

The UI labels this setting **Order delay**, stored as `orderDelay`. Commands also wait this long
after a recruitment building completes or their building prerequisites (including counted buildings,
required levels, and capacity increases) become available. Enough gold, wood, and free food must
also have been available for `orderDelay` before the command, accounting for costs and food reserved
by earlier orders. This includes gathering deliveries, Resources collected events, completed
Farms/Pigsties, and food released by unit losses. All readiness waits overlap and can elapse while a
worker or production queue is unavailable. Worker availability adds no delay. Subsequent recruitment
starts when the previous recruit finishes if its other readiness waits have already elapsed.

Every building construction or upgrade command also waits until `orderDelay` after the previous
successful player command (construction, upgrade, recruitment, or scroll). This spacing overlaps
with the readiness waits above. Unit and hero recruitment have no additional command-spacing wait.
Blocked commands, resource adjustments, unit losses, and mana-well events do not reset this spacing.

For example, Castle level 2 completing at 01:10 unlocks an Altar command at 01:11, with construction
starting at 01:14 using the default three-second builder travel. An Elven Tree completing at 02:10
unlocks Archer recruitment at 02:11 in an existing available Barracks.

If Citadel level 2 unlocks both Goblin Lab and Altar, the Lab can be ordered one second after the
upgrade completes and the Altar one second after the Lab order with the default Order delay,
assuming resources and workers are ready.

The editable game profile contains `delays.constructionStartDelay`, defaulting to 3 seconds. It
supplies the default for both directions of builder travel. Each building or upgrade occurrence
can independently override outward and return travel, including zero. Resetting a field removes
its override; explicit values equal to the global value remain fixed after profile changes.

For a command accepted at time `t`, the worker goes through these phases.

- Departure reserves the worker and stops gathering. It occurs at `t` by default or earlier by
  the configured preparation duration.
- The planner pays construction costs at `t`. The worker travels out and starts building on arrival.
- The building or building upgrade completes after its `seconds` duration multiplied by
  `1 - floor((workerLevel - 1) / 4) / 100` and any
  [per-order construction time factor](#construction-time-modifier), using the base duration
  from `src/game/data.json`.
- At completion, a gathering worker starts the return trip. A worker assigned with **Use idle
  worker** becomes idle at the site.

At worker level 1–4, a 30-second Barracks ordered at 1s therefore starts at 4s, completes at 34s,
and releases its worker back to gathering at 37s. The Barracks can train units at 35s with the
default one-second order delay if resources and food permit. The builder can take another
construction order at 34s or resume gathering after returning at 37s. Multiple buildings can be
constructed concurrently when enough workers and resources are available.

Player `workerLevel` defaults to 1 and is an integer from 1 to 24. The six tiers (1–4, 5–8, 9–12,
13–16, 17–20, 21–24) reduce construction and upgrade duration by 0%, 1%, 2%, 3%, 4%, and 5%. Builder
travel in both directions, order delay, and unit recruitment are unaffected by worker level. For
example, at level 21 a 30-second Barracks ordered at 1s starts at 4s, completes at 32.5s, and
releases its builder at 35.5s.

## Automatic worker selection

The planner selects an available worker at departure in this order.

1. Wood workers, ordered by least carried/gathered wood.
2. Gold workers, ordered by least carried gold, excluding workers inside the mine.

Outbound workers and workers waiting outside the mine carry zero. Wood gathered so far is
proportional to time spent chopping; workers returning to deposit carry a full trip. Worker ID
breaks ties for reproducible results. Mine workers become eligible when they exit the mine; other
queued miners can enter the freed slot. Workers travelling to a building, constructing, or returning
remain excluded from Make idle and worker losses. Returning gatherers are eligible for
construction and upgrades immediately at completion. If no eligible worker exists, the command waits
for a worker to become eligible.

The planner assigns all five starting workers to gold or wood; the UI permits 1–4 gold miners, while
JSON/API opening allocations permit 0–5. Use Make idle during the build to pause gathering. Newly
trained workers join gold up to mine saturation, then wood. Workers temporarily constructing still
count toward their saved resource assignment.

## Interrupted gathering

Wood workers preserve the exact amount already gathered, using the remaining work calculation that
accounts for Whip activation and expiry. No gathering occurs during builder travel or construction.
After the return delay, the worker resumes only the remaining work at its current gathering speed. A
worker interrupted while carrying a completed load keeps that load, including any Lumber Gathering
bonus, and travels to deposit it after returning without gathering again.

Interrupted gold cargo is discarded; returning gold workers queue for the mine. Any pending delivery
is rescheduled. No additional normal outbound gathering travel is charged on the first resumed trip.
Subsequent trips use the normal resource outbound, gathering, and deposit travel times.

Wood example: a worker interrupted at 5s for a 30-second building returns at 43s, keeps its one
second of gathering progress, chops for the remaining 11.1s, then travels 4s to deposit 50 wood at
58.1s. Its originally scheduled delivery at 20.1s does not occur. This example uses normal
four-second wood travel with no completed Sawmill, gathering reduction, or scroll effect.

Gathering and commands use the same chronological simulation, so lost deliveries also delay later
purchases. Building completion, food capacity, producer queues, and newly trained workers use the
delayed completion times. Command scheduling uses a maximum 30:00 planning horizon. Commands whose
completion or builder return would exceed 30:00 remain blocked without spending resources or
reserving a builder. The graphs follow the plan within this maximum; they do not extend beyond it.
See [BUILD_ORDER_FILES.md](BUILD_ORDER_FILES.md#supported-plan-limits).

Building upgrades retain their producer-queue behavior while also reserving a worker for outbound
travel, construction, and the return trip. They appear in the construction timeline lane, including
their start, completion, and worker return timestamps.

## Dark Whip and builder travel

An affected Slave travels toward construction at ×1.15 movement speed while Whip remains active.
Activation during travel and expiry preserve distance already traveled. Construction starts at the
resulting arrival time and immediately removes Whip; construction duration stays unchanged. Return
travel uses normal speed unless a fresh cast activates after construction finishes. A builder
already constructing cannot receive the effect. See [WHIP.md](WHIP.md).

## Explicit idle builders

Use idle worker selects only a deliberately idle, available worker when the command
is ready (at departure when preparation is configured). An empty idle pool blocks the order without
costs or a reservation. An idle builder retains its gathering progress and becomes idle at the
site when construction completes. The planner stores any return override for use if the order
switches to a gathering worker.

## Chained construction

When a returning gatherer is assigned again, retain its unfinished journey in normal-speed
travel units. Its next return is max(configured return, retained remainder). Pause that
journey through the next outward trip and construction; repeat the rule across further
assignments. Whip preserves distance travelled. Twelve seconds interrupted after five
leaves seven; a next return override of three or zero still requires seven. Plan results
record interrupted return endpoints, separately from projected return arrival.

## Construction time modifier

In Configure or Edit, choose **0% (Normal construction time)**, **+50%**, or **+100%**
before Preparation. The setting applies to one building order. Quick adds and automatically inserted
prerequisites use 0%. The modifier applies to building construction other than Castle and Citadel.

The modifier multiplies the worker-adjusted construction duration by 1, 1.5, or 2.
For example, a worker-adjusted duration of 28.5 seconds takes 42.75 seconds at +50%.
Scheduling keeps full precision and applies the existing display format. Preparation and
both travel legs keep their timing rules. The revised finish determines when the worker
becomes idle or starts return travel, when dependent orders can proceed, and when building
effects begin. Plan limits use the resulting timings.

## Command-relative preparation

Per-order preparation defaults to zero. The full interval fits after time zero; an
early command moves later rather than truncating preparation. Worker selection and
gathering interruption occur at departure, before purchase readiness is checked.
Resources, food, prerequisites, queues and command spacing retain their existing rules.

Departures are processed chronologically across all rows, before construction commands
and after same-time worker/loss events. If a command moves, the planner recalculates the worker
departure and its effect on gathering.
Reservations for rejected orders are released. An idle-only order requires an idle worker at
its departure; a future Make idle event cannot satisfy it. Preparation is unaffected
by Whip; outward/return travel retains movement effects and unfinished journey minima.

## Timeline phases

Each construction or upgrade is one editable item spanning actual departure through
the end of its return segment. Construction is blue and upgrades are purple, with
vertical dividers between their phases. Zero-duration phases and idle-builder return
are omitted. Chaining ends a return segment at reassignment. Both the build order and
the timeline show command, start and finish times on hover. Orders with preparation,
an idle builder, a travel override, or a nonzero modifier also show worker and travel details,
including the actual end of an interrupted return.
