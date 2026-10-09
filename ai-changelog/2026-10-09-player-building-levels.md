# Player building levels

- Replaced direct gold/wood trip yields and Farm/Pigsty food fields in `gameProfile.player` with six named player building levels, defaulting to 1 and validated as integers 1–24. UI inputs clamp to that range; derived yields appear in a read-only summary and action cards show effective recruitment durations.
- Derived yields and food from four-level tiers. Recruitment duration decreases by 1–6% according to the producer’s profile level; construction, upgrades, and unrelated producers retain base durations.
- Added mappings for Castle/Citadel, Barracks, Factory/Workshop, and Sanctuary/Dark Gate, keeping player progression separate from in-match upgrades. Industrial/arcane building stats remain pending catalog data.
- Updated JSON and shareable links to persist the level fields; direct yields are runtime-only. Older profiles lacking levels are rejected. Format version remains 1; game-rules revision is now `2026-10-09.2`.
- Added tier-boundary, queue, food-gating, import/export, and UI validation coverage.
