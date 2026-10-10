# Opening worker allocation belongs to the build order

- Moved the allocation slider out of Resource collection into a fixed first Build order action. It cannot be removed or reordered.
- Resource profiles store the starting worker count (default 5); the opening action stores gold assignments and the remainder gathers wood. Food usage follows the count. Count edits clamp an oversized allocation.
- Each faction's opening and catalog action sequence now persist together as a build draft, separately from its resource profile. Clear resets the selected draft; resource reset preserves the opening and actions where the count permits.
- JSON and shareable links use version 2. The required first entry is `{"type":"allocate-workers","goldWorkers":4}`; catalog entries follow. Old files/links are rejected. Invalid, repeated, or misplaced opening actions fail validation before replacing state.
- Existing browser resource profiles migrate allocation into drafts while retaining resource settings. Corrupt data and unavailable storage retain independent fallback behavior.
- Added regression coverage for allocation round trips, delivery recalculation, profile separation, reset/Clear, faction persistence across reloads, legacy storage migration, count limits, and invalid imports/drafts.
- Validation: production build and typecheck passed; all 254 unit/integration tests and 10 Chromium browser tests passed. Browser checks covered keyboard allocation, reload persistence, fixed opening placement, drag reordering, and 1440/1024/390px layouts. Reviewed the desktop opening-action screenshot.
