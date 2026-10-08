# Dark building icons

- Replaced the temporary Citadel, Pigsty, Sawmill, and Barracks artwork with transparent building icons based on the supplied screenshot. Citadel lvl 2 shares the Citadel icon.
- Removed card borders, level badges, upgrade arrows, card-count bars, background glows, and particles.
- Used the built-in image editing tool with a separate background-extraction prompt per building: isolate the corresponding central artwork, preserve its design, red colors, materials, and game-art style, retain its base, and remove all UI onto a transparent square canvas.
- Saved assets under `src/icons/buildings/dark-{citadel,pigsty,sawmill,barracks}.png` and updated the shared icon mapping used throughout the app.
