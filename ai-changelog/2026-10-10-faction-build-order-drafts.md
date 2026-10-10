# Separate faction build-order drafts

- Keep Light and Dark build orders separately in React state, restoring each draft when switching factions.
- Clicking the selected faction preserves its order; Clear only clears the active draft.
- JSON and shared-link imports replace only the imported faction's draft, preserving the other faction's order and keeping the game profile shared.
- Reset timeline hover and dependency messages on faction switching. Drafts reset on page reload.
- Add regression coverage for switching, action order, clearing, and shared-link import isolation.
