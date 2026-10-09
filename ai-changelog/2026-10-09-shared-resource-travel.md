# Shared gold and wood travel times

- Replaced separate outbound/return settings with map.goldTravelTime and map.woodTravelTime throughout the profile, JSON files, Advanced editor, and simulation.
- Each resource's travel time applies in both directions, defaulting to 4 seconds. Opening gold-trip reduction and Sawmill wood-travel behavior remain unchanged; mine saturation uses twice the shared gold travel time.
- Updated fixtures, documentation, round-trip validation, and tests for custom travel values on both trip legs. Versions remain unchanged.
- Validation: all 131 tests in 6 suites, production build, and TypeScript check passed.
