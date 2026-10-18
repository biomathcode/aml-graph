# syntax=docker/dockerfile:1
# Final image carries only this project's code (bundled to plain JS) and
# production node_modules — no devDependencies, no TypeScript toolchain.

# Shared manifest layer so npm ci is cached until package-lock.json changes.
FROM node:22-alpine AS manifest
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/falkordb-aml/package.json packages/falkordb-aml/package.json
COPY packages/ui/package.json packages/ui/package.json

# Install every dependency (dev included) so vite/tsc/esbuild can build.
FROM manifest AS deps
COPY package-lock.json package-lock.json
RUN --mount=type=cache,target=/root/.npm npm ci

# Produce build/ (vite static assets) and build/server/ (bundled server JS).
FROM deps AS build
COPY . .
RUN npm run build && npm run bundle

# Install only production dependencies for the runtime image, then drop
# every package the bundled server does not declare (peers, dev extras,
# frontend-only packages already compiled into build/).
FROM manifest AS prod-deps
COPY package-lock.json package-lock.json
COPY scripts/prune-runtime-deps.mjs scripts/prune-runtime-deps.mjs
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev \
 && PRUNE_NODE_MODULES=1 node scripts/prune-runtime-deps.mjs /app/node_modules

FROM node:22-alpine
ENV NODE_ENV=production
# Cap the V8 heap so memory stays predictable on small hosts instead of
# growing to the default (up to ~4GB) before GC gets aggressive.
ENV NODE_OPTIONS=--max-old-space-size=1024
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/package.json ./package.json
# drizzle's migrator reads the folder at runtime: keep the /server/db path.
COPY --from=build --chown=node:node /app/server/db/migrations ./server/db/migrations
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data
USER node
EXPOSE 3000
# Zombie reaping comes from Compose's `init: true`.
CMD ["node", "build/server/index.js"]
