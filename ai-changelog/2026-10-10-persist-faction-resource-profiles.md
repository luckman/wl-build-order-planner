# Persist Resource collection settings per faction

- Save complete Light and Dark Resource collection profiles independently in browser local storage and restore them when reopening the app or switching factions.
- Include starting resources, worker allocation, food limit, player levels, advanced settings, and hidden Basic values.
- Imports replace and persist only the imported faction's profile; Reset to defaults affects only the active faction. Build orders remain in React state.
- Reuse JSON import validation when restoring saved values. Invalid saved profiles fall back independently to defaults; storage access failures preserve editing in memory.
- Update faction-switch expectations and cover persistence, import priority, reset isolation, malformed data, and unavailable storage.
