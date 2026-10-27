# ADR-005: Separate Liveness and Readiness Probes, and Treat a Supabase Outage as Degraded
## Status: Accepted (Date: 2026-10-27)
## Context
The course lab uses one always-200 `/api/health` endpoint. That cannot tell "the process is alive" from "this instance
should receive traffic". The app serves pages without Supabase (sign-in happens in the browser), so failing readiness during a
Supabase outage would remove every task from the load balancer and turn a partial problem into a full outage.
## Decision
We will provide `/api/livez` (and `/api/health`, the lab name) with no dependencies, and `/api/readyz` with three states:
`ready` (200), `degraded` (200, Supabase slow or down) and `not_ready` (503: config missing, shutting down, or Supabase rejected our key).
The Supabase check has a 2 second timeout and a 5 second cache. `READINESS_REQUIRE_SUPABASE=true` makes an outage critical.
The load balancer checks `/api/readyz`; the container's own check uses `/api/health`.
## Consequences
- Positive: A bad deploy with a wrong or missing Supabase key is stopped before it gets traffic.
- Positive: A Supabase outage does not take the site down, and responses never reveal URLs or keys.
- Negative: A degraded app stays in service, so we rely on logs and the readiness-problems alarm to notice it.
- Negative: More code and tests than a single health endpoint.
