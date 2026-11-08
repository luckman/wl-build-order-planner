# War Legends Build Order Planner

Create and share build orders for the Light and Dark factions in War Legends. The planner runs in
your browser, calculating action timings and showing your economy and production on an interactive
timeline.

[Open the live planner](https://luckman.github.io/wl-build-order-planner/).

## Features

- Buildings, units, heroes, upgrades, and faction scrolls, with automatic prerequisite insertion.
- Gold, wood, food, and mana simulation, including gathering, construction, and production queues.
- Editable account and map settings, plus timed events for resources, mana spending, mana wells, unit losses, and worker idle/reactivation events.
- Reorderable build orders, starter templates, and warnings for blocked actions.
- Top-right notifications for rejected upgrades and newly added blocked actions, with blocked reasons also shown in the build order and below the timeline.
- Planner controls pause while committed build-order changes recalculate. Updates still pending after 100 ms show a centered spinner.
- Shareable links, JSON import/export, and separate browser-saved drafts for each faction.

## Getting started

Choose a faction, set your opening workers and **Resource collection** settings, then add
**Actions** or load a template from **Share / Import**. Reorder actions and review the **Timeline**
to refine your opening. Right-click a **Build order** row to edit or delete that action, including
blocked actions. Left-click an editable row or its clock to open the editor directly. In **Timeline**,
either mouse button opens a scheduled command's menu. After saving a Timeline edit, the Timeline
follows the command's new position.

**Build order** rows show a range from command time to recruitment or construction completion,
upgrade completion, or scroll expiry. Times show tenths only when needed, as in `0:56.7 - 1:24`.
Single-timestamp events show `Command` and their time. Make active also shows its travel duration.
Blocked rows show their reason. Hover over a row to see its timing phases, including builder return
when shown for a customized order.

Choose **Delete from here** in a Build order row's menu to remove that action and all rows below
it. The confirmation shows how many actions will be deleted. **Clear** asks for confirmation before
removing all actions and restoring the default initial worker allocation.

In **Share / Import**, use the primary **Copy link** action to share a build, choose a starter
template, or expand **JSON files** to import or export a `.wl-build-order.json` file.
Drafts save automatically in your browser; export important builds for backup. **Save profile**
stores personal resource settings separately from your build.

**Mana spent** records immediate mana expenditure for an unmodeled spell. Choose a positive whole
number (default 75) and fixed command time. It respects and starts shared scroll cooldown without
an order delay or spell effect; edit or delete it like other timed events.

Right-click a building or an upgrade target level to configure its outward and return travel
before adding. Click construction rows, or choose **Edit** on their timeline items, to change
settings. **Construction time modifier** sets each eligible building to normal time, +50%, or
+100% after worker-level bonuses. Quick adds and inserted prerequisites use normal time.
Castles, Citadels, and upgrades use their usual timing rules.
**Preparation** reserves the worker before the purchase command, stopping gathering
for the entered interval; its departure moves when the command is rescheduled. Timeline items
separate preparation, outward travel, work and return travel with vertical dividers.
Hover for command, start and finish times and additional details on customized orders.
**Use idle worker** selects only an available idle builder; it becomes idle at completion
without return travel. A returning gatherer can start another construction at completion; its
unfinished return journey is retained as a minimum after the next job. The construction and
upgrade dialogs show seconds in the field labels and step by 0.1 seconds. Each travel
setting is marked **Global** or **Custom**. The reset link beside **Custom** shows the
current profile delay and restores live inheritance. Idle mode dims the return settings
and keeps the saved duration. The **(?)** beside the dialog title explains preparation,
builder travel, and when you need resources.

**Make Worker idle** (Light) and **Make Slave idle** (Dark) remove a chosen count of gatherers
from income and ordinary builder selection. The **Activate worker** and **Activate slave**
buttons open the **Make Worker active** and **Make Slave active** events, which restore previous
assignments, optionally after travel. The idle and activation cards follow **Unit is killed**
and use matching pause and resume icons in the build order and timeline. Both events use fixed times
and apply the full count or report an error. The build-order idle event title includes a count only
for two or more workers. Latest order state lists idle workers separately. For worker losses,
choose Gathering or Idle. If that group is unavailable, the planner reports an error.

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
