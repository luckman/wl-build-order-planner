# Production queues — 2026-10-08

- Added one completed initial Castle (Light) or Citadel (Dark), available at time zero.
- Unit production now waits for a matching completed producer with a free slot, as well as resources and food.
- Each producer instance has its own queue. Additional town halls and Barracks become usable on construction completion.
- Town-hall upgrades use the same producer slot as worker training.
- Newly trained workers begin gathering only after their corrected training completion.
- Updated blocked-order messages, README, and GAME_MODEL with the initial town hall and five-worker default.

## Verification

- Regression tests cover the 17s → 35s worker queue, both factions, Barracks availability and serialization, and independent producer instances.
- All 7 tests, type checking, and the production build passed.
