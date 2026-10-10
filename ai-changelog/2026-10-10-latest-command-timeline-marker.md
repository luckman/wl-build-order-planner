# Latest-command timeline state

- Show a grey vertical line within each resource graph at the same timestamp as the Build order's latest-command snapshot, without extending through the timestamp ruler or production queues.
- Default the fixed resource amounts to that timestamp. Graph hover continues to show cursor values and its existing tooltip; leaving restores the latest-command state without a tooltip.
- Keep the grey line visible alongside the hover marker. Hide it only when no command has been scheduled. Preserve horizon resource values for an empty or fully blocked order.
- Validation: production build, TypeScript check, and all 20 App UI tests passed, including latest-command amounts, hover override, restoration, removal, and clearing.
