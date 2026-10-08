# Parallel timeline queues — 2026-10-08

- Replaced the single, overlapping action lane with separate, collision-free production and construction rows.
- Added a horizontally scrollable selected-command strip above the planner, preserving the order in which actions were chosen.
- Moved the selected-command strip between Resource collection and Timeline, expanded the scrolling view to 90 seconds, and set starting gold to 150.
- Kept the gold, wood, and food charts together with the queue rows under one shared timestamp ruler.
- Added a synchronized horizontal timeline scroller: its initial visible width represents one minute, while longer plans extend the canvas to the right.
- Construction rows visually separate concurrent building activity but explicitly do not infer worker occupancy, because that game data remains pending.
