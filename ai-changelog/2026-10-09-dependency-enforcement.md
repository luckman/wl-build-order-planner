# Dependency enforcement

- Derived building family, level, and exact upgrade-source metadata from catalog upgrade links.
- Added physical building instances to scheduling. Upgrade commands reserve a preceding-level instance immediately, replace its level at completion, and preserve its production queue and copy-price identity.
- Enforced completed quantity/minimum-level prerequisites and highest-completed-level limits, counting construction orders from command time, including worker travel.
- Updated dependency insertion to add missing quantities and limit-unlocking upgrades, reject duplicate upgrades without another source building, and report impossible limits/cycles without partially changing the order.
- Added UI explanations for rejected additions and blocked orders. Removing prerequisites recalculates eligibility and resource spending.
- Added regressions for both factions through level 4, reserved slots, independent town halls, inherited production, missing quantities, Archer recruitment, removal, duplicate upgrades, and future production-building upgrades.
- Updated current-scope and dependency documentation to describe implemented behavior.
