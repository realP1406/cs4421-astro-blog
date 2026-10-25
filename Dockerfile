# syntax=docker/dockerfile:1

# Builds the SERVER version of the app (DEPLOY_TARGET=server) and runs it as a normal user.
#
#   docker build \
#     --build-arg PUBLIC_SUPABASE_URL=https://xxxx.supabase.co \
#     --build-arg PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx \
#     --build-arg APP_VERSION=1.0.0 --build-arg GIT_SHA=$(git rev-parse --short HEAD) \
#     -t astro-blog:v1.0.0 .

# ---- 1. All dependencies (the build needs the dev tools) -----------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --fetch-retries=5 --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

# ---- 2. Production dependencies only (what the running server imports) ---------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev --fetch-retries=5 --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000

# ---- 3. Build ------------------------------------------------------------------------------
FROM deps AS build
# Astro bakes PUBLIC_* values into the code at build time, so they must be given here.
# They are public values (the browser sees them anyway), not secrets.
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL \
    PUBLIC_SUPABASE_PUBLISHABLE_KEY=$PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    DEPLOY_TARGET=server
RUN if [ -z "$PUBLIC_SUPABASE_URL" ] || [ -z "$PUBLIC_SUPABASE_PUBLISHABLE_KEY" ]; then \
      echo "ERROR: pass --build-arg PUBLIC_SUPABASE_URL and --build-arg PUBLIC_SUPABASE_PUBLISHABLE_KEY" >&2; \
      exit 1; \
    fi
COPY . .
RUN npm run build

# ---- 4. Runtime: small, no dev tools, not root ---------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA
LABEL org.opencontainers.image.title="astro-blog" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$GIT_SHA

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

# Never run the app as root. 1000 is the "node" user that already exists in the official image
# (a number, not a name, so container platforms can check it is not root).
USER 1000:1000
EXPOSE 4321

# Docker's own liveness check. (The load balancer uses /api/readyz instead.)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Run node directly (not through npm) so SIGTERM reaches the app and it can shut down cleanly.
CMD ["node", "./dist/server/entry.mjs"]
