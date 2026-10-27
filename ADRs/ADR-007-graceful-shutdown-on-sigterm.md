# ADR-007: Drain Traffic on SIGTERM Before Exiting
## Status: Accepted (Date: 2026-10-27)
## Context
ECS and Docker stop containers with SIGTERM. Node running as the main process in a container ignores SIGTERM unless a handler exists,
so it would be force-killed after the timeout, dropping requests, and the load balancer would keep sending traffic to a task that is stopping.
## Decision
On SIGTERM the server will mark itself not ready, keep serving for a grace period (`SHUTDOWN_GRACE_MS`, default 5 seconds) so the
load balancer notices, then exit with code 0. Ctrl+C (SIGINT) exits immediately for local development. The ECS stop timeout is 15 seconds.
## Consequences
- Positive: Releases and scale-ins do not drop in-flight requests, and the exit code shows a clean stop.
- Negative: Stopping a task takes about 5 seconds longer.
- Negative: Adds shutdown code that must be kept in step with the container's stop timeout.
