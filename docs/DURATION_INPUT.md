# Default event time input

Use `src/DurationInput.tsx` for command-time selection in planner event dialogs. Scroll, Resources collected, mana-well, and Unit is killed dialogs use this shared control. Its styling lives in `src/duration-input.css` and has no dependency on scroll components or styles.

```tsx
import { useState } from "react"
import DurationInput from "../DurationInput"
import { formatDuration, parseDuration } from "../durationTime"

const [time, setTime] = useState(() => formatDuration(135))
const seconds = parseDuration(time)

<DurationInput label="Command time (mm:ss)" value={time} onChange={setTime} />
```

The controlled value is formatted text so an incomplete or invalid edit can stay visible. `parseDuration` returns seconds or null; use that result to validate or submit an event. `formatDuration` converts seconds for initial values and calculated previews. `MAX_DURATION_SECONDS` is 1799 (29:59), derived from `MAX_COMMAND_SECONDS` in `src/game/plannerLimits.ts`. The 30:00 simulation horizon is separate from this command-input limit.

The field keeps the colon visible and shifts digits from the right: 2 → 00:02, then 1 → 00:21, then 5 → 02:15. It accepts 215, 0215, or 02:15, preserves up to three fractional second digits, caps typed/pasted values at 29:59, and rejects seconds 60 or greater. It selects its contents on focus and maintains the cursor during editing.

Standard input props such as disabled, id, name, required, aria-invalid, and aria-describedby can be supplied. Disabled calculated previews should be passed as formatted text. Domain rules such as mana availability, cooldown, minimum command time, and warnings belong to the event dialog rather than the input.
`src/EventTimeDialog.tsx` provides the shared manual timestamp editor for existing scrolls and creation/editing of mana-well events. Supply the event name, stored `commandTime`, `onSave`, and `onClose`. The caller updates an existing event by identity; simulation remains responsible for reporting mana, cooldown, and other timing conflicts. `src/ScrollDialog.tsx`, `src/ResourcesCollectedDialog.tsx`, and `src/UnitKilledDialog.tsx` use `DurationInput` in their own forms for scroll creation, resource amounts, and unit selection respectively.

Set `wholeSeconds` for an integer-second field (Resources collected, mana well and Unit is killed events). It uses a numeric keyboard and discards fractional seconds on entry. Other callers retain fractional-second support.

`EventTimeDialog` also accepts `title`, `submitLabel`, `wholeSeconds`, and `validateTime`. Mana well dialogs use these for creation/editing with a timestamp-only form and immediate ownership validation.
