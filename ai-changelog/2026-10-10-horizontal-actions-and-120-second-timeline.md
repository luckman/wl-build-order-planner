# Horizontal actions and 120-second timeline

- Moved Actions into the planner column directly above Timeline and removed the left sidebar column. Build order remains on the right on desktop.
- Arranged action categories in a horizontally scrollable strip with two rows of compact cards. Updated the empty build-order prompt to match the new location.
- Increased the visible timeline window and minimum horizon from 90 to 120 seconds, retaining 30 seconds of padding after the latest completion and synchronized resource/queue scrolling.
- Kept endpoint timestamps inside the timeline to prevent unwanted overflow, and reset the previous narrow-screen action ordering so the strip stays above Timeline.
- Updated README and component tests for panel ordering, horizon scaling, and exact resource-hover boundaries.
- Added Chromium layout tests for both factions, action access/addition, viewport widths, 120-second graph scaling, tooltip boundaries, and fixed columns while scrolling. Made the Playwright server command work on Windows via cross-env. Desktop is the current UI focus; the narrow-screen checks had already been completed when mobile work was deferred.

Validation: all 9 Jest suites / 223 tests and all 4 Playwright browser tests passed. Production build, TypeScript check, and git diff whitespace check passed. Inspected the desktop screenshot. Jest required execution outside the Windows filesystem sandbox; the missing Playwright Chromium headless browser was installed before running browser tests.
