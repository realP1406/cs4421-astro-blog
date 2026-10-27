# ADR-001: Transition from Static Site to Containerized SSR Runtime
## Status: Accepted (Date: 2026-10-27)
## Context
Our platform needs a running server: operational endpoints (/api/health, /api/readyz, /api/version),
per-request structured logs and health-checked releases. Static hosting on S3 cannot execute server-side
Node.js code, so none of these can exist there.
## Decision
We will configure Astro with the `@astrojs/node` adapter in standalone mode and package the application
as a Docker container. The server build is added next to the existing static build, not instead of it (ADR-002).
## Consequences
- Positive: Enables live API routes, dynamic rendering, request logs and operational health checks.
- Positive: Makes zero-downtime releases and automatic rollback possible (ADR-010).
- Negative: Increases operational complexity; requires a container compute runtime and about $10 a week of AWS spend.
- Negative: The app's own features (sign-in, bond data) still run in the browser (ADR-013), so SSR adds operations features, not product features.
