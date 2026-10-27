# ADR-010: Release with ECS Native Blue/Green, a Bake Time and Alarm-Based Rollback
## Status: Accepted (Date: 2026-10-27)
## Context
The course requires zero-downtime releases and a fast rollback drill (target: under 90 seconds). A plain rolling update with a circuit
breaker catches tasks that fail to start, but it replaces the old version gradually, so going back means another full deployment.
CodeDeploy blue/green would work but adds a separate service, an application spec and extra roles. Canary and linear strategies
add waiting time and cost for little benefit at this size.
## Decision
We will use ECS's built-in blue/green strategy with two identical target groups. The new version starts in the idle group and
must pass `/api/readyz` before traffic moves. The old version then keeps running for a 2 minute bake time. A release is rolled back
automatically if the new tasks fail their health check, keep failing to start (circuit breaker), or the 5xx alarm fires.
The production listener rule lists both target groups (100 and 0), as AWS requires, and ECS swaps the weights itself.
## Consequences
- Positive: Visitors never see an unhealthy version, and a manual rollback during the bake time takes seconds.
- Positive: Rollback needs no extra AWS services.
- Negative: ECS owns the listener rule after the first deploy, so it must never be edited by hand or changed in code.
- Negative: Costs one extra task for about 3 minutes per release, and an existing service must be destroyed and recreated to switch strategies.
- Negative: Not yet exercised on AWS: the first real deploy and Rollback Drill 2 will validate it.
