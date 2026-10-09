# Grouped game profile

- Replaced the flat persisted economy profile with basic, map, player, and delays blocks; the UI and planner state use the same structure. Initial worker assignments belong to map.
- Added configurable basic.initialGoldTravelReduction, map.sawmillWoodTravelTime, and delays.initialOrderDelay throughout imports, exports, the profile editor, and simulation.
- Initial order delay affects first recruitment/build commands and second/later initial wood assignments. Initial gold travel reduction applies only to opening gold outbound trips and clamps travel at zero. Sawmill travel retains fixed 0.5-second-per-minute growth and a 4-second cap.
- Kept JSON format version and game-rules revision unchanged as requested. Updated fixtures and validation for the grouped shape; prior flat profiles are not migrated.
- Added coverage for custom and zero delays/travel, gold travel reduction, sawmill growth/reset/capping, grouped round trips, validation, and UI import/export.
- Validation: all 125 tests in 6 suites passed after the final worker-field relocation; production build, TypeScript check, and diff whitespace checks passed.
