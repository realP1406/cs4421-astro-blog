# Bondwell

Bondwell is a bond portfolio dashboard built with Astro. Sign in to keep track of your bonds, projected coupon income, and upcoming payments.

This app is part of the Block 1 Scrum/DevOps coursework for the ISE course at UL, alongside the project's weekly notes.

## Getting started

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Run `supabase/schema.sql` in your Supabase project and enable email/password authentication.
4. Start the local development server with `npm run dev`.

## Commands

| Command | Action |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run check` | Check Astro and TypeScript |
| `npm run lint` | Run ESLint |
| `npm run build` | Build the site into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run rollback` | Immediately route production traffic to the other healthy color |
| `npm run switch:traffic -- blue` | Route production traffic to a specific color (`blue` or `green`) |

## ECS blue/green releases

The ECS service stack runs separate, always-on blue and green services. CI deploys each release to the inactive color, waits for
the ECS deployment and target group to become healthy, and then switches production traffic. The previous color remains running
with its prior image so rollback does not need to start new tasks.

Run `npm run rollback` from the repository root with AWS CLI credentials authorized to read the `AstroBlogService` stack and
describe/modify its ELBv2 listener and target groups. The command finds the currently active color, checks that the other color
has a healthy target, and switches the listener. To select a color explicitly, run `npm run switch:traffic -- blue` or
`npm run switch:traffic -- green`.

The service stack changed from one ECS-native blue/green service to two independent services. Before the first deployment of
this design, destroy only the old service stack, then rerun the CI deployment:

```sh
cd hello-cdk
npm ci
npx cdk destroy AstroBlogService --force
```

This causes a short outage but does not delete the ECR repository or static site. See
[ADR-010](./ADRs/ADR-010-ecs-native-blue-green-releases.md) for the decision and trade-offs.

## Tagged releases

Push a semantic version tag to release a specific version:

```sh
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3
```

Tags must use `vMAJOR.MINOR.PATCH` (optionally followed by a prerelease suffix), such as `v1.2.3` or `v1.2.3-rc.1`.
GitHub Actions runs the checks, builds the container with that version, deploys it to the inactive color, and displays the tag in
the app footer after promotion. Ordinary pushes to `main` continue to deploy using their commit SHA as the version.
