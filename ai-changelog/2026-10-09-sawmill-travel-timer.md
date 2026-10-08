# Sawmill travel timer

- Wood travel now increases by 0.5 seconds per full minute since the latest completed Sawmill, starting at 0.5 seconds and capped at 4 seconds after 7 minutes. Every newly completed Sawmill resets the timer for both factions.
- All scheduled completions are retained so future buildings cannot reset the timer early, including during worker allocation replay. Each outbound/return leg uses its start time; travel already underway keeps its duration.
- Updated simulation tests for minute boundaries, saturation, successive resets, completion ordering, and income after the first minute. Updated the UI explanation, README, and game model.
