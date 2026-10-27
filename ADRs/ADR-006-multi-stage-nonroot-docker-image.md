# ADR-006: Build a Multi-Stage, Non-Root Docker Image with Public Settings as Build Arguments
## Status: Accepted (Date: 2026-10-27)
## Context
Astro inlines `PUBLIC_*` values into the code at build time, so the Supabase URL and publishable key cannot be supplied
only at runtime. The image should be small, free of dev tools, and must not run as root.
The course sample uses Node 20, but Astro 7 requires Node 22.12 or newer.
## Decision
We will use four stages on `node:22-alpine` (all dependencies, production dependencies, build, runtime). The runtime stage
holds only production modules and `dist`, runs as user 1000, and starts `node` directly so signals reach the app.
The two Supabase values are build arguments, and the build fails with a clear message if they are missing.
## Consequences
- Positive: Smaller attack surface, no dev tools in production, and layers cache well.
- Positive: A mis-built image fails at build time instead of starting broken.
- Negative: An image is tied to one Supabase project; changing it means rebuilding (a limit of Astro's build-time inlining).
- Negative: The image is still a few hundred MB, because Astro itself depends on its bundler. The smoke test prints the real size and fails above 600 MB.
