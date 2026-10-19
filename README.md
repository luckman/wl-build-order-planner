# War Legends Build Order Planner

Create and share build orders for the Light and Dark factions in War Legends. The planner runs in
your browser, calculating action timings and showing your economy and production on an interactive
timeline.

[Open the live planner](https://luckman.github.io/wl-build-order-planner/).

## Features

- Buildings, units, heroes, upgrades, and faction scrolls, with automatic prerequisite insertion.
- Gold, wood, food, and mana simulation, including gathering, construction, and production queues.
- Editable account and map settings, plus timed events for resources, mana wells, and unit losses.
- Reorderable build orders, starter templates, and warnings for blocked actions.
- Shareable links, JSON import/export, and separate browser-saved drafts for each faction.

## Getting started

Choose a faction, set your opening workers and **Resource collection** settings, then add
**Actions** or load a template from **Import / Export**. Reorder actions and review the **Timeline**
to refine your opening. Click timed-event rows to edit them.

Use **Copy link** to share a build or **Import / Export** to save a `.wl-build-order.json` file.
Drafts save automatically in your browser; export important builds for backup. **Save profile**
stores personal resource settings separately from your build.

Plans support **100 actions** after the opening allocation and a **30-minute** simulation. The
catalog is still expanding, and timings are estimates to check in-game. See the
[game model](docs/GAME_MODEL.md) and [file-format guide](docs/BUILD_ORDER_FILES.md) for details.

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

Playwright tests require its Chromium browser to be installed (`npx playwright install chromium`).
The test configuration builds and serves the app automatically.

## Contributing

Bug reports and confirmed War Legends data are welcome through the repository's GitHub Issues. For a
timing problem, include the faction, a shared build link or exported JSON, the expected result, and
what happened in-game. Include your browser and reproduction steps for interface issues.

For code changes, read the [documentation index](docs/README.md). Game content is declared in
`src/game/data.json`; profile defaults and progression rules live alongside it in `src/game/`. Use
confirmed game values and document assumptions or missing data. Run the production build, TypeScript
check, and relevant tests before submitting a pull request.

## Storage and analytics

Build drafts and personal profiles are stored locally in your browser. Shared URLs contain the build
and profile, so anyone with the link can open those settings.

The site loads GoatCounter visitor analytics for `luckman.goatcounter.com`. It also counts
successful **Copy link** actions and openings of URLs containing a build parameter, including
invalid build links. These custom events send fixed event names and titles, without the shared URL
or build contents. The integration is defined in `public/index.html` and `src/analytics.ts`.

To disable analytics in your own deployment, remove the GoatCounter `<script>` tag from
`public/index.html` and rebuild the app. The existing event hooks safely do nothing without that
script.

## License and credits

The source code is available under the [MIT License](LICENSE), retaining the original BurnySc2
copyright notice. The project was adapted from SC2 Planner and now implements War Legends factions
and mechanics.

Game names, logos, and artwork belong to their respective owners. Some icons are temporary assets
inherited from the original planner; the source-code license does not grant rights to third-party
game artwork.
