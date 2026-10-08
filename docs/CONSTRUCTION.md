# Construction and gathering

Implemented on 2026-10-08 for Light Workers and Dark Slaves.

The first build-order command is available at 1.0 seconds. Initial gold miners
and the first initial wood gatherer receive their gathering orders at game
start; any additional initial wood gatherers receive theirs at 1.0 seconds.

The editable game profile contains one `constructionStartDelay`, defaulting to
4 seconds. It applies to every building and building upgrade, and both directions
of builder travel.
There are no per-building overrides or positioning modes.

For a command accepted at time `t`:

- Costs are paid and the selected worker stops gathering at `t`.
- Construction starts at `t + constructionStartDelay`.
- The building or building upgrade completes after its `seconds` duration from
  `src/game/data.json`.
- The worker returns to its resource after another `constructionStartDelay`.

A 30-second Barracks ordered at 0s therefore starts at 4s, completes at 34s,
and releases its worker back to gathering at 38s. The Barracks can train units
at 34s. The builder cannot gather or accept another construction command
before 38s. Multiple buildings can be constructed concurrently when enough
eligible workers and resources are available.

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

The UI currently assigns all starting workers to gold or wood. The simulation
also supports idle workers when total worker count exceeds those assignments.
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
scheduled delivery at 20s does not occur.

Gathering and commands use the same chronological simulation, so lost deliveries
also delay later purchases. Building completion, food capacity, producer queues,
and newly trained workers use the delayed completion times. Command scheduling
retains the existing 600-second planning horizon; resource simulation extends
through the final scheduled completion/worker return when necessary.

Building upgrades retain their producer-queue behavior while also reserving a
worker for outbound travel, construction, and the return trip. They appear in
the construction timeline lane, including their start, completion, and worker
return timestamps.
