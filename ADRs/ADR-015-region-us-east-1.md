# ADR-015: Run All AWS Resources in us-east-1
## Status: Accepted (Date: 2026-10-27)
## Context
CDK is already set up for this account in us-east-1, the course slides use it, and certificates for CloudFront must be created
there anyway. An earlier plan used eu-west-1, which would need a second CDK setup and split the project across regions.
## Decision
We will create every AWS resource in us-east-1.
## Consequences
- Positive: One region, one CDK setup, and it matches the course material.
- Negative: Visitors in Ireland have slightly higher latency to the load balancer, which does not matter for this project.
