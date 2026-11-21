# War Legends Build Order Planner

Create and share build orders for the Light and Dark factions in War Legends. The planner runs in
your browser, calculating action timings and showing your economy and production on an interactive
timeline.

[Open the live planner](https://luckman.github.io/wl-build-order-planner/).

## Features

- Buildings, units, heroes, upgrades, and faction scrolls, with automatic prerequisite insertion.
- Gold, wood, food, and mana simulation, including gathering, construction, and production queues.
- Timed events for resources, mana, unit losses, and worker events.
- Editable account and map settings
- Reorderable build orders, starter templates, and warnings for blocked actions.
- Shareable links, JSON import/export, and separate browser-saved drafts for each faction.

## Getting started

Choose **Light** or **Dark** at the top of the planner. Each faction has its own browser-saved draft.

### Build order

- Use **Initial worker allocation** to split your starting workers between gold and wood.
- Add **Limit gold miners** to control gold assignments from a chosen time. Gatherers can switch after delivering a load, and empty-handed builders can switch when construction finishes.
- Use **Move gold miner to wood** or **Move wood gatherer to gold** to direct a chosen number of workers to switch resources. Moves to gold use the available slots under the current gold limit.
- Drag rows to reorder your actions. Click an editable row to edit it, or right-click for its menu.
- Check **Latest order state** for resources and workers at the latest command.

### Resource collection

Adjust your account and map settings to match the game you want to simulate. Use **Save profile**
to reuse those settings in other builds for the same faction.

### Actions

Add buildings, units, heroes, upgrades, scrolls, and timed events. The planner adds missing
prerequisites automatically. Right-click a building or upgrade level to configure construction.
See the [construction guide](docs/CONSTRUCTION.md) for timing and worker options.
Open **The point is Captured/Lost** to record gaining or losing a mana well.

### Timeline

- Review when actions are scheduled and how gold, wood, food, and mana change over time.
- Hover for timing details. Click or right-click a scheduled action to open its menu.

### Share / Import

- Load a starter template to try an opening with your current **Resource collection** settings.
- Use **Copy link** to share your build and its settings.
- Expand **JSON files** to import a build or export a backup. See the
  [file-format guide](docs/BUILD_ORDER_FILES.md) for details.

Plans support up to **100 actions** after the opening allocation and a **30-minute** simulation.
Timings are estimates you can check in-game. See the [game model](docs/GAME_MODEL.md).

## Run locally

Install Node.js and npm, then run these commands from the project directory containing
`package.json`:

```sh
npm ci
npm start
```

Open the development URL printed in the terminal, normally `https://localhost:3000`. The start
script enables HTTPS and does not open a browser automatically; local development may show a
certificate warning.

Create and preview a production build:

```sh
npm run build
npm run serve
```

The generated static site is written to `build/`. Open the preview URL printed by the server. If
your Node.js environment reports an OpenSSL compatibility error during the build, use
`npm run buildNode17`, which enables the legacy OpenSSL provider.

### Development commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start the development server with HTTPS. |
| `npm run build` | Generate the production site in `build/`. |
| `npm run serve` | Serve an existing production build locally. |
| `npm run typecheck` | Check TypeScript types. |
| `npm run testAll -- --runInBand` | Run the Jest suite without watch mode. |
| `npm run teste2e` | Run the Playwright browser tests. |
| `npm run lint` | Check formatting and lint rules with Biome. |
| `npm run benchmark` | Run all simulation benchmark suites. |
| `npm run benchmark -- --work-counts` | Count simulation work for the Dark Warg Rider scenario. |

Playwright tests require its Chromium browser to be installed (`npx playwright install chromium`).
The test configuration builds and serves the app automatically.

Benchmark results are saved in `benchmark-results/`. See the
[benchmark guide](docs/PERFORMANCE_BENCHMARKS.md) for modes and past results.

## Contributing

Bug reports and confirmed War Legends data are welcome through the repository's GitHub Issues. For a
timing problem, include the faction, a shared build link or exported JSON, the expected result, and
what happened in-game. Include your browser and reproduction steps for interface issues.

For code changes, read the [documentation index](docs/README.md). Game content is declared in
`src/game/data.json`; profile defaults and progression rules live alongside it in `src/game/`. Use
confirmed game values and document assumptions or missing data. Run the production build, TypeScript
check, and relevant tests before submitting a pull request.

## Storage and analytics

Your browser saves your drafts and profiles. Anyone with a shared link can open the build and its
profile settings.

GoatCounter tracks visits, successful **Copy link** actions, and opened build links, including
invalid ones. Copy and open events send only a fixed event name and title.

To disable analytics on your deployment, remove the GoatCounter script tag from
`public/index.html` and rebuild. To update the bundled copy, keep its license notice and replace `public/count.js` with
the [official GoatCounter script](https://gc.zgo.at/count.js).

## License and credits

The source code is available under the [MIT License](LICENSE), retaining the original BurnySc2
copyright notice. The project was adapted from [SC2 Planner](https://github.com/BurnySc2/sc2-planner)
and now implements War Legends factions and mechanics.

Game names, logos, and artwork belong to their respective owners. Some icons are temporary assets
inherited from the original planner; the source-code license does not grant rights to third-party
game artwork.
