# ADR-013: Keep Supabase External; Authenticate and Query from the Browser
## Status: Accepted (Date: 2026-10-27)
## Context
The app already signs users in and stores bonds in Supabase, calling it directly from the browser with a publishable key
and row-level security. Running a database on AWS would add cost and work and nothing to the course goals.
## Decision
Supabase stays a hosted service outside AWS. The browser keeps talking to it directly; the server does not proxy those calls and
holds no secret keys. Only the publishable key (safe to expose) is used anywhere.
## Consequences
- Positive: No database to run, patch or pay for on AWS, and a Supabase outage does not stop pages from loading.
- Negative: Data security depends entirely on correct row-level-security policies.
- Negative: Each site address (static and load balancer) must be added to Supabase's allowed redirect URLs, or sign-up emails link to the wrong place.
