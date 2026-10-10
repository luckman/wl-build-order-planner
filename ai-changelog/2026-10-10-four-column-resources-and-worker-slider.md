# Four-column resources and worker slider

- Changed the Resource collection grids to four columns on desktop.
- Moved initial allocation into the main grid as a range slider, defaulting to 4 gold miners and 1 wood gatherer. Each edit sets gold miners from 0 through 5 and assigns the remaining workers to wood, keeping five total workers and ten initial food.
- Removed separate gold/wood worker number inputs from Advanced. The main slider and live allocation readout remain visible when Advanced is expanded or collapsed.
- Preserved imported allocations without silently rewriting saved plans. Profiles whose imported total differs from five display a note that moving the slider uses five workers. Slider changes persist through existing JSON and shareable-link fields.
- Updated README, file-format UI documentation, component/import/export tests, and browser coverage for four columns, all worker splits, keyboard controls, food totals, and retained edits.

Validation: all 225 tests across 9 Jest suites and all 5 Chromium UI tests passed. Typecheck and production build passed (browser tests build the app first). Inspected the desktop screenshot; diff whitespace check passed.
