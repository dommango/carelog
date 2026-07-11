#!/bin/sh
# Runtime entrypoint for the combined CareLog container.
set -e

echo "[carelog] Syncing database schema (prisma db push)..."
pnpm --filter @carelog/db exec prisma db push --skip-generate

echo "[carelog] Starting worker (pg-boss consumers + cron)..."
node apps/worker/dist/index.js &

echo "[carelog] Starting web on port ${PORT:-3000}..."
exec pnpm --filter web exec next start -p "${PORT:-3000}" -H 0.0.0.0
