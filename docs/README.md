# War Legends planner documentation

These documents describe the current Light and Dark planner implementation. For setup, commands, and the user-facing feature list, see the [project README](../README.md).

| Document | Purpose |
| --- | --- |
| [Game model](GAME_MODEL.md) | Current simulation architecture, starting conditions, resource cycles, progression, timed events, and implementation boundaries. |
| [Catalog dependencies](CATALOG_DEPENDENCIES.md) | Catalog relationships, quantity and level prerequisites, building limits, upgrade ownership, copy prices, and Light hero rules. |
| [Construction and gathering](CONSTRUCTION.md) | Command delays, builder selection, construction/upgrade timing, interrupted gathering, and worker return. |
| [Build-order files and storage](BUILD_ORDER_FILES.md) | Version-2 JSON schema, profile settings, timed commands, import/export, shareable links, browser storage, and supported limits. |
| [Duration input](DURATION_INPUT.md) | Shared command-time input and event-dialog APIs, formatting, parsing, and validation responsibilities. |

The catalog in `src/game/data.json`, profile defaults in `src/game/gameProfile.ts`, progression formulas in `src/game/playerLevels.ts`, and limits in `src/game/plannerLimits.ts` define the current behavior. Update these guides when their corresponding implementation changes. Dated change history lives in [`ai-changelog/`](../ai-changelog/).

The planner was initially adapted using the neighboring `sc2-planner/` project as a reference. That directory remains read-only reference material. The active implementation lives here and uses War Legends data and mechanics; the original migration plan has been removed.
