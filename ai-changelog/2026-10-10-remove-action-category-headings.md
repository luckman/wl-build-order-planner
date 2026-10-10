# Remove action category headings

- Removed the visible Buildings, Units, Heroes, and Upgrades headings and their margins to reduce Actions panel height. Kept the four rows in the same order and retained accessible category labels.
- Updated README and UI tests to locate rows by accessible labels and confirm visible category headings are absent.

Validation: all 224 tests across 9 Jest suites and all 4 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first); diff whitespace check passed.
