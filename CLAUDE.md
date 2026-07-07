# CLAUDE.md

Guidance for Claude Code working in this repository.

CareLog is a caregiver activity-logging PWA: a small team logs the daily care of one senior patient (nebulizer treatments, meds, meals, mood, notes) via text/voice/photo, and an async AI pipeline turns messy input into structured records that feed reminders, adherence tracking, and doctor-visit reports. Greenfield app (deliberately **not** a CareCover extension). Full design: `docs/architecture.md`. Current branch `phase-5-reporting` — Phase 5 (reporting: adherence rollups, mood charts, PDF/CSV export) is the active work.

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
pnpm test                # web unit/integration tests (vitest)
pnpm worker:dev          # worker (tsx watch) ; worker:build ; worker:start
pnpm db:generate         # prisma generate
pnpm db:migrate          # prisma migrate dev
pnpm db:push             # prisma db push (no migration)
pnpm db:studio           # prisma studio
pnpm db:seed             # seed via apps/web/src/scripts/seed.ts
```

In `apps/web`: `pnpm test:e2e` (Playwright), `pnpm lint` (eslint). No `typecheck` script — run `pnpm --filter web exec tsc --noEmit` (or `tsc` per package).

## Database

Postgres, local `DATABASE_URL=postgresql://carelog:carelog@localhost:5436/carelog` (port **5436** — note other projects use 5435/5432). No `docker-compose` is committed; run your own Postgres on that port. Schema lives at `packages/db/prisma/schema.prisma` (13 models incl. Auth.js `Account`/`Session`, `Patient`, `CareEvent`, `Attachment`, `Template`, `Schedule`, `Notification`, `PushSubscription`, append-only `AuditLog`). `CareEvent` uses client-generated UUID PKs + unique `idempotencyKey` for offline-replay safety; `rawInput` is never overwritten by the AI; soft-delete via `deletedAt`.

## Env

No `.env.example` is committed — vars live in `apps/web/.env.local`, `apps/worker/.env`, `packages/db/.env`. Names in use: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `STORAGE_ROOT`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_PHONE_NUMBER`.

## Architecture notes

- **Write path never blocks on AI.** Events persist immediately with `status=pending_ai` and raw input intact; the worker enriches asynchronously and pushes a sync nudge. Confidence gate sets `confirmed` / `needs_review` / `ai_failed`.
- **Sync** is server-authoritative delta-pull (`/api/sync` by `updated_at` cursor) with an SSE nudge as wake-up, not data transport. Writes are idempotent on `idempotencyKey`.
- **Notifications** degrade to log-only: a `Notification` row is always written; SMS/push only fire when the Twilio/VAPID env vars are set (dev runs the full flow with none).
- **Queue is pg-boss** on the same Postgres — no Redis. The worker also runs the schedule/escalation cron.

## Deploy

Architecture doc targets **Railway** (separate `web` + `worker` services + managed Postgres, media on R2/S3). No `railway.json`, `Dockerfile`, or CI config is committed yet — deploy is not wired up.
