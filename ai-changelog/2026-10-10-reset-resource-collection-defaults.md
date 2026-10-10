# Reset Resource collection defaults

- Added Reset to defaults next to Advanced, visible whether Advanced is open or closed.
- Resets basic, map, player, and delays groups from the shared initial profile, including hidden imported settings, worker allocation, player levels, resources, travel, and delays. Copies each group rather than sharing mutable default objects.
- Preserves faction, build order, and Advanced visibility; the existing simulation recalculates from the restored settings.
- Updated README and added integration/browser tests for resetting hidden settings, repeated resets with Advanced open, preserving orders/faction, and serializing the complete default profile.

Validation: all 229 tests across 9 Jest suites and all 10 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first); diff whitespace check passed.
