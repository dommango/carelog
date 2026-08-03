#!/bin/sh
# Runtime entrypoint for the combined CareLog container.
set -e

# `prisma db push` was doing this before. It diffs the live database against the
# schema and reshapes it to match, with no record of what it did and no review
# step — against a database holding real care records, a renamed or retired
# column is silent data loss on boot. `migrate deploy` only applies the reviewed
# migrations committed under packages/db/prisma/migrations and refuses anything
# it does not recognise.
#
# A database created by the old `db push` path has the right tables but no
# migration history, so the first run here will stop with P3005 ("database
# schema is not empty"). That is a one-time adoption, not a failure — run:
#
#   pnpm --filter @carelog/db exec prisma migrate resolve --applied 0_init
#
# 0_init is generated from the same schema `db push` was applying, and the two
# are verified identical, so adopting it is a no-op. See the PR description.
echo "[carelog] Applying database migrations (prisma migrate deploy)..."
pnpm --filter @carelog/db exec prisma migrate deploy

echo "[carelog] Starting worker (pg-boss consumers + cron)..."
node apps/worker/dist/index.js &

echo "[carelog] Starting web on port ${PORT:-3000}..."
exec pnpm --filter web exec next start -p "${PORT:-3000}" -H 0.0.0.0
