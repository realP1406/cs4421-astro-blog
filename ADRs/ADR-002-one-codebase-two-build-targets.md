# ADR-002: Build the Static and Server Versions from One Codebase
## Status: Accepted (Date: 2026-10-27)
## Context
We need to keep the existing static site (S3 + CloudFront) and add the server version. A separate fork or
long-lived branch for each would mean every fix is made twice and the two copies drift apart.
We also found that a static build fails with `NoAdapterInstalled` if any route in `src/pages` sets `prerender = false`.
## Decision
We will keep one repository and choose the target with the `DEPLOY_TARGET` environment variable (`build:static`
and `build:server` scripts). Server-only routes and middleware live in `src/server-routes/` and `src/server/`
and are added to the build only when `DEPLOY_TARGET=server`, so the static build never sees them.
## Consequences
- Positive: One place to fix bugs; both builds share all pages, components and tests.
- Positive: CI can build both targets and catch either one breaking.
- Negative: Config in `astro.config.mjs` is slightly more complex, and server-only code must never be placed in `src/pages`.
- Negative: Both build outputs use the same folder by default, so builds must not be run at the same time.
