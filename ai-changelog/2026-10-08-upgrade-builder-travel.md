# Building upgrade builder travel

- Made building upgrades use the same worker selection, outbound travel,
  construction occupancy, and return travel as new buildings.
- Kept the producer queue reserved through the upgrade completion while the
  worker remains unavailable until its return completes.
- Moved upgrade events into construction timeline lanes and added coverage for
  their start and worker-return timestamps.
