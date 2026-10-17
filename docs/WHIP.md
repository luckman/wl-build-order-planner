# Whip (Dark)

Whip costs 50 mana and activates one second after its fixed command timestamp.
It uses the existing mana readiness and shared scroll cooldown rules, including
the configured order delay (one second by default). `player.darkWhipLevel` accepts
levels 1–6; all six currently have identical effects:

- Wood harvesting time: −2 seconds per load.
- Gold mining time: −0.5 seconds per visit.
- Movement speed: ×1.15.
- Duration: 30 seconds per affected worker.

The command is stored as `{ "type": "use-scroll", "scrollId": "whip", "commandTime": 91 }`.
It survives JSON, links and Dark drafts. The card appears beside Dark heroes and
uses the owner-provided `dark-whip.png` artwork. Its level is
editable in Resources collection and resets with basic settings.

## Worker eligibility and refresh

At activation, apply the effect to existing workers traveling, waiting for a mine
slot, or gathering. Idle workers, workers constructing buildings, and workers
created afterward do not inherit it. A new application sets each eligible worker's
expiry to activation + 30 seconds. Neither strength nor remaining duration stacks.
The active interval includes activation and excludes expiry.

A builder retains the movement benefit on the way to construction, including
casts activated during that journey. Starting construction removes the effect;
it does not resume after construction, even if the original expiry is still in
the future. Construction duration remains unchanged. Return travel uses normal
speed unless a fresh Whip activates after construction has finished; a returning
builder is moving and can receive that new effect. The worker remains unavailable
for another command throughout travel, construction and return, as before.

## Gathering and movement

The normal gathering times already include equipment reductions. Effective
gathering durations are clamped to at least 0.001 seconds.

Gold visit duration is chosen on mine entry: normal time minus 0.5 seconds if the
worker has Whip then. Activation or expiry inside the mine does not change that
visit. A waiting worker checks its effect when admitted to the mine.

Wood progress is continuous. For normal load time T, the progress rates are 1/T
without Whip and 1/max(0.001, T−2) with Whip. Activation and expiry preserve the
work already done. If Whip begins after S normal gathering seconds and lasts
until completion, total gathering time is:

`S + (1 − S/T) × (T − 2)`

For T = 12.1 and S = 6.05, this is 11.1 seconds. At S = 6.25 it is approximately
11.1331 seconds. Carrying capacity is unchanged.

Movement uses normal speed ×1.15 while active. Activation and expiry preserve
distance already traveled. A fully affected trip takes normal travel time / 1.15;
this applies independently to both resource travel directions and travel to a
construction site. Forest travel growth and Sawmill resets still determine the
normal duration of each resource leg.

## Scheduling

Worker simulation processes activation and expiry alongside arrivals, gathering
completions and deliveries. Gold duration is fixed at entry; remaining wood work
and resource travel are rescaled when the effect changes.

Construction travel is projected across accepted future Whip activations and
expiry. The planner replays with validated casts as travel forecasts until those
casts agree, ensuring a cast during travel also updates building completion,
prerequisite availability, and builder return. Mana validation remains
chronological, and rejected commands cannot accelerate construction travel.
