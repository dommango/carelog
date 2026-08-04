#!/bin/bash
# Runtime entrypoint for the combined CareLog container.
#
# bash, not sh: the supervision below needs `wait -n`, which dash does not have.
# node:20-slim ships bash. The Dockerfile CMD invokes this with bash explicitly.
set -euo pipefail

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

# The worker used to be launched with a bare `&`. If it died — an unhandled
# rejection, an OOM kill — nothing noticed: the container kept serving HTTP and
# looked perfectly healthy while every reminder and every AI enrichment silently
# stopped. Supervise it, and let /api/health surface the heartbeat so a worker
# that cannot stay up is visible rather than merely absent.
supervise_worker() {
  local backoff=1
  local code=0

  while true; do
    # `set -e` would abort this function the moment the worker exits non-zero,
    # which is precisely the case we exist to handle.
    if node apps/worker/dist/index.js; then
      code=0
    else
      code=$?
    fi

    # 0 and 143 (128+SIGTERM) mean a deliberate shutdown; do not fight it.
    if [ "$code" -eq 0 ] || [ "$code" -eq 143 ]; then
      echo "[carelog] Worker exited cleanly (code ${code}); not restarting."
      return 0
    fi

    echo "[carelog] Worker exited with code ${code}; restarting in ${backoff}s..."
    sleep "$backoff"

    # Capped exponential backoff, so a worker that cannot start does not spin
    # and take the database with it.
    backoff=$(( backoff * 2 ))
    if [ "$backoff" -gt 60 ]; then
      backoff=60
    fi
  done
}

echo "[carelog] Starting worker (pg-boss consumers + cron)..."
supervise_worker &
worker_supervisor=$!

echo "[carelog] Starting web on port ${PORT:-3000}..."
pnpm --filter web exec next start -p "${PORT:-3000}" -H 0.0.0.0 &
web=$!

# Forward shutdown to both children. Previously the web server was the `exec`
# target, so it alone received SIGTERM and the worker was killed outright when
# the container went down — mid-job, holding pg-boss locks until they expired.
# The worker's own SIGTERM handler drains pg-boss before exiting.
shutdown() {
  echo "[carelog] Received shutdown signal, stopping children..."
  kill -TERM "$web" "$worker_supervisor" 2>/dev/null || true
  wait "$web" 2>/dev/null || true
  wait "$worker_supervisor" 2>/dev/null || true
  exit 0
}
trap shutdown TERM INT

# If either half exits on its own, bring the container down so the platform
# restarts it whole rather than leaving a half-running app serving traffic.
wait -n
echo "[carelog] A child process exited; shutting down the container."
kill -TERM "$web" "$worker_supervisor" 2>/dev/null || true
exit 1
