# ADR-012: Deploy Immutable Version Tags, Never "latest"
## Status: Accepted (Date: 2026-10-27)
## Context
A rollback only works if we know exactly which image was running before. The `latest` tag changes meaning with every push,
so it cannot be rolled back to, and it hides which code is live.
## Decision
Images will be tagged with a version (for example `v1.0.0`) or a commit SHA. The service stack requires an explicit `imageTag` (the app defaults to `v1.0.0`, the lab's tag),
and a test checks that the image reference is built from that tag and never falls back to `latest`. The tag is also baked in as `APP_VERSION` and `GIT_SHA` and shown by `/api/version` and in every log line.
ECR keeps the 10 most recent images. Rolling back means deploying a previous tag, and `scripts/wait-for-version.mjs` confirms the switch.
## Consequences
- Positive: Any release can be reproduced or reversed, and a running site can always say which build it is.
- Negative: Needs discipline to tag every build; automatic tagging comes with the release pipeline (T5).
- Negative: Only 10 images are kept, so rolling back further than that means rebuilding.
