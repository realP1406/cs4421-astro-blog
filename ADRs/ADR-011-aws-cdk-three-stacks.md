# ADR-011: Manage AWS with CDK in Three Stacks (Static, Registry, Service)
## Status: Accepted (Date: 2026-10-27)
## Context
The static site already used AWS CDK in TypeScript (`hello-cdk`). The service cannot start until an image exists in ECR, and
destroying the service must never delete images. A single `cdk deploy` of everything also hung when the image was missing.
## Decision
We will keep CDK as the only way to change AWS, split into `HelloCdkStack` (static site), `AstroBlogRegistry` (ECR repository,
optional budget alert) and `AstroBlogService` (network, ECS, load balancer, monitoring). The service finds the repository by name,
so a repository made by hand in the course lab works too. Settings are passed with `-c` flags, availability zones are named
outright (no AWS lookups when building), and CI deploys named stacks, never `--all`.
## Consequences
- Positive: Reviewable, repeatable infrastructure with tests, and `cdk destroy AstroBlogService` removes the spending cleanly.
- Positive: Images and the static site survive tearing the service down.
- Negative: The order matters (registry, then image, then service), and it must be followed or the deploy hangs.
- Negative: Terraform (covered in Week 4) was not chosen, because the existing stack was already CDK.
