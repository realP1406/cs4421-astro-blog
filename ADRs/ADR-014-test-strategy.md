# ADR-014: Test with Vitest, Playwright Against a Faked Supabase, and CDK Assertions
## Status: Accepted (Date: 2026-10-27)
## Context
We need fast feedback on money calculations and server code, proof that the page works in a real browser, and a way to stop
infrastructure changes from silently raising cost or removing safety settings. Real Supabase tests would need secrets and shared data.
## Decision
Unit tests use Vitest (in UTC, with an 80% coverage threshold on `src/utils` and `src/server`). A few browser tests use Playwright
against a built copy of the site with every Supabase call answered by a fake. CDK assertion tests guard cost and safety (no NAT
Gateway, smallest task size, no `latest` tag, alarm and health-check settings), and we confirmed they fail when those settings are broken on purpose.
## Consequences
- Positive: Most tests run in about a second, and the browser tests need no secrets.
- Positive: Cost and rollback settings cannot change without a test failing.
- Negative: The faked Supabase does not test real row-level security.
- Negative: CI must download a browser for the Playwright job, which adds time.
