# ADR-008: Write Structured JSON Logs with Request IDs and Secret Redaction
## Status: Accepted (Date: 2026-10-27)
## Context
Plain `console.log` lines cannot be searched or counted across many requests. During an incident we need to match a user's
report to exact log lines, and logs must never contain keys or passwords.
## Decision
The server will write one JSON object per line to stdout with timestamp, level, message, version and commit, plus request ID,
route, method, status and latency for each request. Every response carries an `x-request-id` header (an incoming ID is reused
only if it passes a safety check), and the load balancer's `x-amzn-trace-id` is logged. Fields whose names look secret
(authorization, apikey, password, token, cookie and similar) are replaced with `[REDACTED]`. Successful probes are logged at DEBUG only.
## Consequences
- Positive: CloudWatch can filter and alarm on fields (for example `statusCode >= 500`), and one request ID finds all its lines.
- Positive: Probe traffic does not fill the logs or the bill.
- Negative: Only server-side code is logged; the browser code (sign-in, data calls) is not.
- Negative: Stack traces are kept in the logs, so log access must be treated as sensitive.
