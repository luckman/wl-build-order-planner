# Resource-only cards and no Actions header

- Removed duration from visible action cards, retaining it in hover tooltips and accessible button names.
- Removed the Actions header and Click to add hint. Retained the accessible panel label and four category rows.
- Reduced card minimum height from 78px to 64px so removing the time line saves vertical space. Upgrade cards retain their target level.
- Updated README and UI assertions for absent header/time text, retained hover information, and shorter rendered cards.

Validation: all 224 tests in 9 Jest suites and all 4 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first); diff whitespace check passed.
