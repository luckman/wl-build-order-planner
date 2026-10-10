# Icon action cards and hover details

- Removed visible names from Buildings, Units, and Heroes action cards; Upgrades retain their names.
- Replaced labeled resource lines with gold/wood/food on one line and duration below. Buildings and upgrades explicitly show zero food.
- Reduced cards to 90px wide, with the icon above costs. Native browser hover tooltips show the name, labeled gold/wood/food values, and time, using current prices and player-level duration. Accessible button names preserve full details.
- Updated README, component coverage, price assertions, and browser tests for hidden names, upgrade labels, compact cost lines, tooltip contents, and card layout.

Validation: all 224 tests in 9 Jest suites and all 4 Chromium UI tests passed. Typecheck and production build passed; browser tests build the app first. Inspected the desktop screenshot and checked diff whitespace.
