# Build order timing hover

- Added a native hover tooltip to each Build order action row showing command, start, finish, and applicable worker-return times.
- Shared the timing formatter with Timeline events so both panels show identical details and update together when simulation settings change. Recruitment omits worker-return timing; blocked orders show their blocking reason without invented timestamps.
- Updated README and related component/browser tests for matching construction and upgrade details, changed construction delays, recruitment, and blocked orders.

Validation: all 225 tests across 9 Jest suites and all 6 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first); diff whitespace check passed.
