# ADR-012: Deploy Immutable Version Tags, Never "latest"
## Status: Accepted (Date: 2026-10-27)
## Context
A rollback only works if we know exactly which image was running before. The `latest` tag changes meaning with every push,
so it cannot be rolled back to, and it hides which code is live.
## Decision
Images will be tagged with a version (for example `v1.0.0`) or a commit SHA. A pushed Git tag using semantic version syntax
(`vMAJOR.MINOR.PATCH`, optionally with a prerelease suffix) triggers a release workflow, and the same tag is shown on the app's
home screen and in `/api/version`. The service stack requires explicit `blueImageTag`
and `greenImageTag` values (the app defaults both to `v1.0.0`, the lab's tag), and a test checks that image references use
those tags and never fall back to `latest`. The tag and commit SHA are baked in as `APP_VERSION` and `GIT_SHA` respectively
and are shown by `/api/version` and in every log line. ECR keeps the 10 most recent images. The inactive color is deployed with
the new tag; the previous active color retains its tag and running tasks for rollback.
## Consequences
- Positive: Any release can be reproduced or reversed, and a running site can always say which build it is.
- Negative: Needs discipline to tag every build; automatic tagging comes with the release pipeline (T5).
- Negative: Only 10 images are kept, so rolling back further than that means rebuilding.
