# CLAUDE.md

Guidance for Claude Code working in this repository.

CareLog is a caregiver activity-logging PWA: a small team logs the daily care of one senior patient (nebulizer treatments, meds, meals, mood, notes) via text/voice/photo, and an async AI pipeline turns messy input into structured records that feed reminders, adherence tracking, and doctor-visit reports. Greenfield app (deliberately not an extension of a prior in-house app). Full design: `docs/architecture.md` (historical; where it and the code disagree, the code wins). All five build phases from the design doc have shipped.

## Layout (pnpm monorepo)

```
apps/web        Next.js PWA — UI, API routes, auth, SSE, service worker  (App Router in src/app)
apps/worker     pg-boss consumers — AI pipeline + notification/schedule cron
packages/db     Prisma schema + generated client (single source of truth for data)
packages/ai     Anthropic + OpenAI clients (Claude normalize/classify, Whisper transcription)
packages/queue  pg-boss job queue, rrule schedule expansion, Twilio SMS, web-push
packages/storage  local-filesystem media store (rooted at STORAGE_ROOT; S3/R2 not yet wired)
```

Workspaces are `apps/*` and `packages/*`; internal deps use `@carelog/*` (`workspace:*`).

## Stack

Next.js **16.2.10** (App Router) · React **19.2.4** · TS strict · Auth.js / next-auth **5.0.0-beta** (Prisma adapter, DB sessions, Google + email) · Prisma **5.16** (`prisma-client-js`, `postgresql`) · Tailwind **v4** · Serwist SW + Dexie (offline outbox) · TanStack-style optimistic mutations · Recharts + `@react-pdf/renderer` (reports) · rrule · Zod **v4** · pg-boss **10** (queue) · Anthropic SDK + OpenAI SDK · Twilio + web-push (notifications).

`apps/web/AGENTS.md` warns: this Next.js diverges from training data — read `node_modules/next/dist/docs/` before writing framework code.

## Commands

Run from repo root (each proxies to a workspace via `pnpm --filter`):

```bash
pnpm dev                 # web dev server on :3000
pnpm build               # build web
pnpm test                # unit/integration tests (vitest): web, @carelog/ai, worker, @carelog/storage
pnpm worker:dev          # worker (tsx watch) ; worker:build ; worker:start
pnpm db:generate         # prisma generate
pnpm db:migrate          # prisma migrate dev (migrations are committed; CI checks drift)
pnpm db:deploy           # prisma migrate deploy (applies committed migrations)
pnpm db:push             # prisma db push (no migration — avoid; see db:migrate)
pnpm db:studio           # prisma studio
pnpm db:seed             # seed via apps/web/src/scripts/seed.ts
```

In `apps/web`: `pnpm test:e2e` (Playwright), `pnpm lint` (eslint). No `typecheck` script — run `pnpm --filter web exec tsc --noEmit` (or `tsc` per package).

## Database

Postgres, local `DATABASE_URL=postgresql://carelog:carelog@localhost:5436/carelog` (port **5436** — note other projects use 5435/5432). No `docker-compose` is committed; run your own Postgres on that port. Schema lives at `packages/db/prisma/schema.prisma` (13 models incl. Auth.js `Account`/`Session`, `Patient`, `CareEvent`, `Attachment`, `Template`, `Schedule`, `Notification`, `PushSubscription`, append-only `AuditLog`). `CareEvent` uses client-generated UUID PKs + unique `idempotencyKey` for offline-replay safety; `rawInput` is never overwritten by the AI; soft-delete via `deletedAt`.

## Env

`env.example` (root, deliberately no leading dot) documents every var; real values live in `apps/web/.env.local`, `apps/worker/.env`, `packages/db/.env`. Names in use: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `EMAIL_SERVER`/`EMAIL_FROM`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STORAGE_ROOT`, `STORAGE_BASE_URL`, `APP_BASE_URL`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER`, `NOTION_API_KEY`/`NOTION_FEEDBACK_DB_ID` (feedback mirror), `CRON_SECRET` (reconciler route), `TEST_LOGIN_SECRET` (test-login gate; refused outright in prod), `ALLOWED_SIGNIN_EMAILS` (unset = open sign-up — set on public deployments). Google sign-in is env-gated (`apps/web/src/lib/env.ts`) — the app boots fine with those two unset, just without the Google provider. `AUTH_SECRET`/`AUTH_URL` are the canonical next-auth v5 names; the legacy `NEXTAUTH_SECRET`/`NEXTAUTH_URL` are aliased by the library and still work, but new code/docs should use the `AUTH_*` names. `trustHost: true` is set in `auth.ts` for Railway's proxy, so `AUTH_URL` itself is optional — Auth.js infers the origin from the request.

## Architecture notes

- **Write path never blocks on AI.** Events persist immediately with `status=pending_ai` and raw input intact; the worker enriches asynchronously and pushes a sync nudge. Confidence gate sets `confirmed` / `needs_review` / `ai_failed`.
- **Sync** is server-authoritative delta-pull (`/api/sync` by `updated_at` cursor) with an SSE nudge as wake-up, not data transport. Writes are idempotent on `idempotencyKey`.
- **Notifications** degrade to log-only: a `Notification` row is always written; SMS/push only fire when the Twilio/VAPID env vars are set (dev runs the full flow with none).
- **Queue is pg-boss** on the same Postgres — no Redis. The worker also runs the schedule/escalation cron.

## Deploy

Architecture doc targets **Railway** (separate `web` + `worker` services + managed Postgres). Committed: `Dockerfile` + `docker-start.sh` (web image; runs `migrate deploy` on boot) and CI at `.github/workflows/ci.yml` (typecheck, tests with a Postgres service container, migration-drift check, Playwright). Not committed: `railway.json`, `docker-compose`. Media is on the local-filesystem store (`STORAGE_ROOT`); S3/R2 not yet wired.
