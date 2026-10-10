# Narrower cards and upgrade level labels

- Reduced action cards from 90px to 78px wide.
- Upgrade cards now show only `lvl X`, using the item's modeled target level. Reduced label height to fit the single line. Full names and costs remain in hover tooltips and accessible button names.
- Updated README and related component/browser assertions for card width, level-only labels, and retained hover details.

Validation: all 224 tests across 9 Jest suites and all 4 Chromium UI tests passed. Typecheck and production build passed (the browser suite builds the app first). Inspected the desktop screenshot and checked diff whitespace.
