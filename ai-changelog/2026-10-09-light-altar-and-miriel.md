# Light Altar of Heroes and Miriel

- Added Altar of Heroes: Production, 150 gold / 100 wood base cost, 50 seconds, Castle level 2 required, unlimited quantity with existing copy-price scaling.
- Added Miriel: Hero, 650 gold / 250 wood / 10 food, 45 seconds, produced by and requiring Altar of Heroes, maximum one including queued recruitment across all Altars.
- Added the hero item kind, Heroes action group, shared unit/hero recruitment handling, and data-driven `maxCount` enforcement in dependency insertion and scheduling.
- Included heroes in production timeline lanes and all food calculations; action cards now show food costs for recruitable items.
- Reused existing Light artwork. Dark remains unchanged.
- Added regressions for producer prerequisites, global uniqueness during and after recruitment, removal, Altar price scaling, hero food, and the Heroes UI.
