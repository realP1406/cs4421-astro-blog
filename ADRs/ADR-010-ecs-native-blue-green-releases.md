# ADR-010: Keep Both Blue/Green ECS Services Warm for Fast Rollback
## Status: Accepted (Date: 2026-10-27)
## Context
The course requires zero-downtime releases and a rollback drill under 90 seconds. ECS-native blue/green keeps the previous
tasks only for a short bake time; after that, recovery requires deploying the old image again. That makes rollback depend on
CloudFormation and ECS starting tasks, instead of simply moving production traffic back to a known-good version.
## Decision
We will run two independent ECS Fargate services, named blue and green, behind separate health-checked target groups and one
Application Load Balancer. Each service keeps at least one task running. CI deploys the new immutable image to the color that is
not currently receiving traffic, waits for ECS deployment stability and healthy targets, and then switches the listener to it.
The previously active service and image remain running as the rollback version. The `npm run rollback` command checks which
color is active, verifies the other color has a healthy target, and changes the listener weights to route 100% of production
traffic to that other color. It does not rebuild or redeploy the image. A failed candidate deployment is not promoted, and ECS's
deployment circuit breaker restores the candidate service's prior task definition if its tasks fail to start.
## Consequences
- Positive: A rollback is a single command and only changes ALB weights, so it avoids image pulls, task startup, and a new CDK deployment.
- Positive: Both target groups are health-checked, the services are monitored together, and immutable tags identify each retained version.
- Negative: Keeping two Fargate tasks running roughly doubles the service's task compute cost.
- Negative: Manual traffic switches use the AWS ELBv2 API and can create CloudFormation drift; the listener rule must remain a
  weighted-forward rule containing both target groups. Verify the active color after any CDK change to the listener rule.
- Negative: The existing ECS-native service stack must be destroyed and recreated once to adopt the two-service design, causing
  a brief service outage. ECR images and the static-site stack are separate and remain intact.
- Negative: The initial blue and green services start on the same image. Rollback speed and the 90-second target must be verified
  in the AWS rollback drill; no live AWS deployment has been run as part of this change.
