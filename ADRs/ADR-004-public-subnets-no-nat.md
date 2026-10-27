# ADR-004: Use Public Subnets Only and No NAT Gateway
## Status: Accepted (Date: 2026-10-27)
## Context
A NAT Gateway costs about 32 USD a month before any traffic, more than the rest of the stack combined.
Fargate tasks need to reach ECR (to pull the image) and CloudWatch (to write logs).
## Decision
We will place the VPC in two availability zones with public subnets only, give each task its own public IP address,
and restrict its security group to accept port 4321 only from the load balancer. A test fails if a NAT Gateway
is ever added.
## Consequences
- Positive: Saves about 32 USD a month; keeps the one-week cost near 10 USD.
- Positive: The task is still not reachable from the internet directly, because the security group only allows the load balancer.
- Negative: Tasks have public IPv4 addresses (about 0.84 USD a week each) and are not in a private network.
- Negative: Moving to private subnets later needs VPC endpoints for ECR and logs, which have their own cost.
