# Construction delay and builder economy

- Added a game-profile construction start delay, default 4s, shared by outbound
  and return travel for all Light/Dark buildings.
- Replaced precomputed income/scheduling passes with a chronological worker
  economy shared by resource previews and build scheduling.
- Added automatic idle/wood/gold builder priority, least-cargo selection, and
  exclusion of workers inside the mine.
- Cancelled interrupted deliveries and reserved builders through their return;
  returning workers restart gathering from zero at the previous resource.
- Kept building availability tied to construction completion, independently of
  builder return. New workers and multiple producers remain supported.
- Timeline tooltips expose command/start/completion/worker-return times, including
  fractional seconds. Added construction and income regression tests.
- Documented the reset-cargo decision and construction-only scope in
  `docs/CONSTRUCTION.md`; updated the README and game model.
