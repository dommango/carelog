# CareLog — combined web + worker image for Railway.
# Both processes share one container so they can share a single mounted
# volume at STORAGE_ROOT (Railway volumes attach to one service only).
FROM node:20-slim

# openssl + ca-certificates are required by the Prisma query engine.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm
ENV PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app

# Install deps first, keyed only on manifests for better layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/queue/package.json ./packages/queue/
COPY packages/ai/package.json ./packages/ai/
COPY packages/storage/package.json ./packages/storage/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile

# Copy the rest of the source and build.
COPY . .

# Generate the Prisma client, then build packages + apps (topological order).
RUN pnpm --filter @carelog/db exec prisma generate

# Placeholder values so `next build` can initialize modules; no DB connection
# happens at build time (all routes are dynamic / server-rendered on demand).
ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXTAUTH_SECRET="build-time-placeholder"
RUN pnpm -r run build

EXPOSE 3000
CMD ["sh", "/app/docker-start.sh"]
