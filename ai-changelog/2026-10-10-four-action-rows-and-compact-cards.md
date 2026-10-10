# Four action rows and compact cards

- Replaced the two-row horizontal catalog with four category rows in order: Buildings, Units, Heroes, and Upgrades. Each row scrolls independently, reducing the distance needed to reach a category.
- Reduced card width from 160px to 112px. Matched the supplied sketch with a wrapping name across the top, an icon below on the left, and stacked gold, wood, optional food, and duration on the right.
- Retained the wider timeline and its 120-second viewport. Updated the README, price assertions, and browser layout tests for the new cards and rows, including empty categories.

Validation: all 223 tests across 9 Jest suites and all 4 Chromium UI tests passed. TypeScript check and production build passed (the browser suite builds the app before testing). Inspected the desktop screenshot. Desktop remains the design focus; existing viewport regression tests were retained.
