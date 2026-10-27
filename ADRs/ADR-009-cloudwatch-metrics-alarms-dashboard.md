# ADR-009: Monitor with CloudWatch: Three Log Metrics, Five Alarms and One Dashboard
## Status: Accepted (Date: 2026-10-27)
## Context
We need to know when the app is failing without paying for a large monitoring setup (each alarm costs about 0.10 USD a month,
and dashboards beyond the first three cost 3 USD a month).
## Decision
Logs go to one log group kept for 7 days. Three metric filters count ERROR lines, readiness problems and requests slower than
1 second. Five alarms email through SNS: a burst of 5xx responses (5 or more in a minute), unhealthy tasks in either target group,
CPU above 80% in 2 of 3 periods, 5 or more ERROR lines in 5 minutes, and 3 or more readiness problems in 5 minutes.
One dashboard shows all of it. Missing data never raises an alarm. A test fails if the alarm count changes.
## Consequences
- Positive: Covers errors, health, capacity and dependency problems for under 1 USD a week.
- Positive: `docs/runbook.md` gives a first step and a Logs Insights query for each alarm.
- Negative: The thresholds are starting guesses and will need tuning with real traffic.
- Negative: The email subscription must be confirmed by hand, or no alarm email is ever delivered.
