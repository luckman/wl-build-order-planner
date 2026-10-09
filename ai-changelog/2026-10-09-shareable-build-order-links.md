# Shareable build-order links

- Added Save shareable link to Import / Export. Copy a compressed URL with the current faction, exact action order, and complete game profile, always excluding calculated timings.
- Reused the existing pako dependency for zlib compression and URL-safe base64 encoding in a versioned build fragment. Added link-length and decompression limits; oversized orders suggest JSON export.
- Load links on startup and hash changes through the existing JSON validator and current simulation. Errors preserve planner state; game-rules mismatches show the existing warning.
- Close the menu after successful copying, with a manual-copy field when clipboard access is unavailable. Keep JSON export/import behavior unchanged.
- Validation: all 147 tests in 8 suites, production build, and TypeScript check passed. Coverage includes both factions, duplicate actions, customized/empty profiles, corrupt/unsupported/oversized links, hash navigation, and clipboard fallback.
