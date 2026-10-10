# Remove Build order Blocked label

- Removed the standalone Blocked word from Build order rows, retaining the red styling, action name, and blocking reason.
- Removed unused label styling and updated README and UI assertions.

Validation: all 226 tests across 9 Jest suites and all 7 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first); diff whitespace check passed.
