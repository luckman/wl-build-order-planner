# Order unlock delay

- Apply `orderDelay` after recruitment-building completion and prerequisite completion, including required levels, counted buildings, and capacity unlocked by town-hall upgrades.
- Measure delays from completion, allow overlapping unlocks, and preserve immediate subsequent recruitment once the producer queue clears.
- Rename the profile field to `orderDelay` and label it “Order delay”.
- Add regression coverage for multiple producers, zero and fractional delays, the Castle/Altar timing example, and Archer recruitment in an existing Barracks.
