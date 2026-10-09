# JSON build-order export/import

- Added JSON file download and upload controls beside the build order, with the exact action sequence, faction, and full game profile.
- Added optional per-action calculated timings, excluded by default and always ignored on import.
- Imports validate before replacing planner state, resolve current catalog IDs without inserting dependencies, and recalculate through the existing simulator.
- Added separate file-format and game-rules revisions. Rules mismatches warn without blocking import; historical game rules are not retained.
- Kept parsing/serialization transport-independent for future shareable links. Added limits and readable validation errors, documentation, and regression coverage.
- Validation: production build and TypeScript check passed; all 103 tests in 6 suites passed. Jest required execution outside the Windows sandbox because its temporary-directory realpath check failed inside it. Existing React testing-library deprecation warnings remain.
