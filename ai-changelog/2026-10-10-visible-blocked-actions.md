# Visible blocked actions

- Blocked Build order rows now have a red background, bright red left edge, readable reason text, and an explicit Blocked label.
- Replaced the subtle text below Timeline with a prominent red warning above its graphs. It lists the blocked count and each action's icon, order number, name, and blocking reason, remaining outside horizontal timeline scrolling.
- Indicators are driven by simulation state and clear when the action can be scheduled. Blocked actions retain their reason tooltip and removal control.
- Updated README and UI coverage for dependency/capacity blocks, resource blocks, red rendered styles, and recovery after resources change.

Validation: all 226 tests across 9 Jest suites and all 7 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first). Inspected the blocked-state screenshot; diff whitespace check passed.
