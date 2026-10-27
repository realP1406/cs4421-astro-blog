# ADR-012: Deploy Immutable Version Tags, Never "latest"
## Status: Accepted (Date: 2026-10-27)
## Context
A rollback only works if we know exactly which image was running before. The `latest` tag changes meaning with every push,
so it cannot be rolled back to, and it hides which code is live.
## Decision
Images are tagged with a semantic version (for example `v1.0.0`) for a tagged release, or with the commit SHA for an ordinary
push to `main`. GitHub Actions validates release tags against `vMAJOR.MINOR.PATCH` with an optional prerelease suffix, then
builds and deploys that tag. The release tag is shown in the Bondwell home-page footer and in `/api/version`; the commit SHA
remains separately available for traceability. The service stack requires explicit `blueImageTag` and `greenImageTag` values
(the app defaults both to `v1.0.0`, the lab's tag), and tests check that image references use the selected tags and never fall
back to `latest`. The tag and commit SHA are passed as `APP_VERSION` and `GIT_SHA` respectively and included in application
version information and logs. ECR keeps the 10 most recent images. CI deploys the new tag to the inactive color and switches
production traffic only after the candidate is healthy; the previous active color keeps its image and running tasks for rollback.
## Consequences
- Positive: Any release can be reproduced or reversed, and a running site can always say which build it is.
- Negative: Release tags must be created and pushed intentionally; ordinary `main` builds continue to use their commit SHA.
- Negative: Only 10 images are kept, so rolling back further than that means rebuilding.
