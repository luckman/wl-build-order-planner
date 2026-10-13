# War Legends Build Order Planner — Agent Instructions

## Scope and project history

- This directory is the root of the War Legends build-order planner.
- It was bootstrapped from an older RTS planner. Do not reintroduce legacy game terminology, mechanics, data, UI, tests, or logic into the active project.
- Temporary source icon artwork is allowed in `src/icons/` until War Legends artwork replaces it. Do not expose the source game's names in the UI or data model.
- Support exactly two factions unless the project owner explicitly expands that scope: Light and Dark.

## Documentation and changelog

- Write a dated changelog entry for each meaningful implementation change in `ai-changelog/`.
- Before creating a new changelog file during the same browser/chat session, review the existing session entries and append to a relevant file when the changes continue the same topic. Create a separate file when the topic is distinct; use dated sections within a reused file to preserve chronology.
- Changelog filenames must begin with the current date in `YYYY-MM-DD` format.
- Keep migration background and longer design documentation in `docs/`.
- Update the root `README.md` when the user-facing scope, setup, or capabilities change.

Update 2026-10-10: old changelog entries have been removed

## Confirmed starter game data

Use only these values unless new values are provided by the project owner.

### Light faction

| Item         | Type     | Gold | Wood | Food | Build time | Producer / prerequisite           |
|--------------|----------|-----:|-----:|-----:|-----------:|-----------------------------------|
| Castle       | Building |  500 |  500 |    0 |     60 sec | Built by Worker; produces Workers |
| Castle lvl 2 | Upgrade  |  200 |  200 |    0 |     45 sec | Upgrade from Castle lvl 1         |
| Sawmill      | Building |  200 |  100 |    0 |     20 sec | Built by Worker                   |
| Farm         | Building |  150 |  200 |    0 |     25 sec | Built by Worker; produces food    |
| Barracks     | Building |  200 |  150 |    0 |     30 sec | Built by Worker                   |
| Worker       | Unit     |  150 |    0 |    2 |     18 sec | Produced by Castle                |
| Swordsman    | Unit     |  150 |    0 |    3 |     21 sec | Produced by Barracks              |

### Dark faction

| Item          | Type     | Gold | Wood | Food | Build time | Producer / prerequisite         |
|---------------|----------|-----:|-----:|-----:|-----------:|---------------------------------|
| Citadel       | Building |  500 |  500 |    0 |     60 sec | Built by Slave; produces Slaves |
| Citadel lvl 2 | Upgrade  |  200 |  200 |    0 |     45 sec | Upgrade from Citadel lvl 1      |
| Sawmill       | Building |  200 |  100 |    0 |     20 sec | Built by Slave                  |
| Pigsty        | Building |  150 |  200 |    0 |     25 sec | Built by Slave; produces food   |
| Barracks      | Building |  200 |  150 |    0 |     30 sec | Built by Slave                  |
| Slave         | Unit     |  150 |    0 |    2 |     18 sec | Produced by Citadel             |
| Goon          | Unit     |  200 |    0 |    4 |     27 sec | Produced by Barracks            |

## Unknown values and modeling policy

- Do not invent food supplied by Farm or Pigsty, starting resources, starting workers, income rates, gathering limits, worker travel, construction-worker occupancy, production queues, or parallel timing.
- Leave mechanics that rely on unknown values unimplemented or visibly marked as pending game data.
- Add a value only after the project owner supplies it, then update the relevant documentation and changelog.

## Verification

- Use `src/DurationInput.tsx` as the default command-time control for all planner events. Shared formatting, parsing, and the 99:59 limit live in `src/durationTime.ts`; keep event-specific validation in the caller. See `docs/DURATION_INPUT.md` for usage.

- For source changes, run `npm run build` and `npm run typecheck` when dependencies are available.
- Run Jest without watch mode: `npm run testAll -- --runInBand` (add `--silent` if existing React deprecation warnings obscure the results).
- On Windows, Jest may fail before running tests with `EPERM: operation not permitted, realpath` from `jest-util` / `jest-config`, often while resolving the sandbox's temporary directory. This is an execution-environment failure. Retry the same test command with `sandbox_permissions: "require_escalated"` through the normal approval mechanism when available; this resolved the issue on 2026-10-13. Changing `TEMP` / `TMP` did not resolve it, so avoid repeated temporary-directory workarounds or changes to application code for this error.
- Actual test assertion failures still require investigation and fixes. If the retry is unavailable or denied, report that tests could not run and include the environment error; do not report them as passing.
