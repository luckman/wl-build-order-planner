# Higher town-hall levels and dependency catalog

- Added Castle/Citadel levels 3 and 4 with confirmed prices, timings, upgrade links, and quantity/level prerequisites.
- Added Economic Tower of Mana to both factions at 200 gold / 150 wood and 40 seconds, using existing faction artwork.
- Converted `requires` to structured item/count/minLevel records and added data-driven building limits for Farm/Pigsty, Sawmill, and Tower of Mana. Barracks requires a level 1 town hall and has no quantity limit.
- Preserved the structured metadata in the loader while retaining the current presence-based dependency compatibility view.
- This step prepares catalog data only. Full dependency enforcement, per-building upgrade ownership, and higher-level upgrade scheduling remain pending as requested.
- Added catalog regression checks for both factions and documented the schema and pending behavior in `docs/CATALOG_DEPENDENCIES.md`.
