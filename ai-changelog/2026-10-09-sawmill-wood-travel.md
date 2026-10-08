# Sawmill wood travel

- Completed Sawmills reduce subsequent wood travel legs to 0.5 seconds in both directions for Light and Dark. The first completion activates the rule; extra Sawmills do not stack it.
- Integrated the completion event with build scheduling and worker allocation replay. Travel already in progress retains its duration; chopping, yields, gold, and builder travel remain unchanged.
- Updated the game model, Resource collection explanation, and README; added regression coverage for activation timing and resource-dependent orders.
