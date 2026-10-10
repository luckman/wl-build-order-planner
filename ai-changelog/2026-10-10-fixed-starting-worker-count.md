# Fix starting worker count at five

- Removed `GameProfile.player.startingWorkers` and its Resource collection input.
- The game-rule constant `STARTING_WORKER_COUNT = 5` determines initial population, ten food used, and the allocation slider's limit. Opening allocation remains a build-order action.
- Imports and stored profiles discard obsolete `startingWorkers` fields. Existing resource settings and valid build drafts remain intact; allocations above five are rejected.
- Updated documentation and regression tests. Bumped the game-rules revision to `2026-10-10.8`.
- Validation: all 252 unit/integration tests and 10 Chromium browser tests passed, along with production build and typecheck.
