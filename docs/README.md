# War Legends planner documentation

These documents describe the current Light and Dark planner implementation. For setup, commands, and
the user-facing feature list, see the [project README](../README.md).

| Document | Purpose |
| --- | --- |
| [Game model](GAME_MODEL.md) | Current simulation architecture, starting conditions, resource cycles, progression, timed events, and implementation boundaries. |
| [Catalog dependencies](CATALOG_DEPENDENCIES.md) | How prerequisites, building limits, upgrades, prices, and hero rules work, with links to catalog data. |
| [Construction and gathering](CONSTRUCTION.md) | Command delays, builder selection, construction/upgrade timing, interrupted gathering, and worker return. |
| [Build-order files and storage](BUILD_ORDER_FILES.md) | Version-2 JSON schema, compatibility and versioning policy, profile settings, timed commands, import/export, shareable links, browser storage, and supported limits. |
| [Dark Whip](WHIP.md) | Scroll levels, worker eligibility, preparation approximation, gathering progress, and movement effects. |
| [Duration input](DURATION_INPUT.md) | Shared command-time input and event-dialog APIs, formatting, parsing, and validation responsibilities. |

The catalog in [data.json](../src/game/data.json), profile defaults in
`src/game/gameProfile.ts`, progression formulas in `src/game/playerLevels.ts`, and limits in
`src/game/plannerLimits.ts` define the current behavior.

See [ai-changelog](../ai-changelog/) for dated changes.
