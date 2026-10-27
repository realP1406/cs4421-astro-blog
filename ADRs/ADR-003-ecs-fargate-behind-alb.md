# ADR-003: Run the Container on ECS Fargate Behind an Application Load Balancer
## Status: Accepted (Date: 2026-10-27)
## Context
The course asks for containers on AWS, health-checked releases and a one-week run on a 100 USD credit budget.
Options considered: EC2 (we would patch servers and pay while idle), AWS App Runner (simpler, but less control over
the release strategy), Lambda (needs a different adapter and is not a container workload), and EKS
(the control plane alone costs about 17 USD a week).
## Decision
We will run the image on ECS with Fargate (0.25 vCPU, 0.5 GB, x86) behind an Application Load Balancer.
The ALB provides readiness health checks and weighted listener rules. Independent blue and green ECS services keep their
versions running so a release can switch traffic without waiting for tasks to start.
## Consequences
- Positive: No servers to manage; pay only for running tasks (about 2 USD a week per task).
- Positive: ECS circuit breakers protect each service update; ALB traffic switching enables a fast rollback to the other service.
- Negative: Two always-running tasks roughly double compute cost compared with one service.
- Negative: The ALB is the largest fixed cost (about 5 USD a week) and cannot be turned off without taking the site down.
- Negative: Ties the deployment to AWS-specific services.
