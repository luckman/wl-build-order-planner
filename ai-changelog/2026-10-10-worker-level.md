# Worker construction level

- Added `gameProfile.player.workerLevel`, default 1, validated as an integer from 1 to 24 and included in JSON exports/imports and shareable links. It appears as Worker level for Light and Slave level for Dark.
- Construction and building-upgrade duration now receive 0%/1%/2%/3%/4%/5% reductions at levels 1/5/9/13/17/21. Builder occupancy, return times, prerequisite completion, and action-card durations use the same adjusted time. Travel and order delay stay unchanged. Recruitment retains its separate producer-level bonuses.
- Game-rules revision is `2026-10-10.1`; format version remains 1. Imports require workerLevel alongside the other player levels.
- Added tier-boundary, upgrade, builder availability, import validation, and faction-label coverage.
