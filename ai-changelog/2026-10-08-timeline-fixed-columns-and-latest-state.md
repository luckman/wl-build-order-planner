# Timeline fixed columns and latest state

- Removed the redundant Selected commands panel; the Build order panel remains the single command list.
- Rebuilt the timeline around fixed resource/queue labels and fixed resource values, with only its chronological canvas horizontally scrollable.
- Replaced the initial-worker and delivery summary with the latest command-time state, including resource, food, and worker-allocation values.
- Added worker-state replay so gathering workers plus builders/travellers/idle workers always equal the displayed total at the latest command timestamp.
