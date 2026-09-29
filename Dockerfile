# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22-bookworm-slim

# -----------------------------------------------------------------------------
# deps: full dependency tree (build tooling + Prisma CLI), Prisma client generated
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# -----------------------------------------------------------------------------
# build: compile TypeScript
# -----------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

# -----------------------------------------------------------------------------
# migrate: one-off job that applies migrations and seeds reference data
# -----------------------------------------------------------------------------
FROM deps AS migrate
COPY tsconfig.json ./
COPY src ./src
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed"]

# -----------------------------------------------------------------------------
# runtime: production dependencies + compiled app only, non-root
# -----------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# Scripts are skipped (postinstall would need the Prisma CLI); the generated
# client is copied from the build stage and argon2 ships prebuilt binaries.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health/live').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
