# Building price multipliers

Production and Racial initial buildings now multiply base gold/wood prices by their copy number, counting earlier planned copies of the same building even before construction starts. Upgrades do not multiply costs or increase copy counts; Economic and Defensive buildings remain fixed-price.

The catalog retains building type metadata. Scheduling, affordability, resource graphs, and latest-command totals use each order's calculated cost. Action cards display the next copy's price and refresh after removal or faction changes.

Regression coverage includes both factions, simultaneous construction orders, insufficient gold/wood, independent building counts, Racial pricing, fixed-price categories/upgrades, and UI price/resource updates.
