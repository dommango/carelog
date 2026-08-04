# CareLog

CareLog is a caregiver activity-logging PWA. A small team of caregivers (family members
plus hired help) logs the daily care of one senior patient — nebulizer treatments,
medications, meals, mood, and notes — via text, voice, or photo. An async AI pipeline
turns that messy input into structured records that feed reminders, adherence tracking,
and doctor-visit reports. It is offline-first: entries are captured to a local outbox and
sync when connectivity returns.

> **Not a medical device.** CareLog is a personal record-keeping tool for informal
> caregivers. It does not provide medical advice, diagnosis, or treatment, and its
> AI-generated summaries and adherence reports may be incomplete or incorrect — always
> verify against the original entry before relying on them. Never use CareLog to make
> clinical decisions or in an emergency; call your local emergency number.
>
> **Not HIPAA-compliant.** CareLog is not offered as a covered entity or business
> associate, no BAA is available, and it transmits care notes to third-party AI providers
> (Anthropic, OpenAI). Do not use it to store or process PHI on behalf of a healthcare
> provider.

## Layout (pnpm monorepo)

| Workspace          | Purpose                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `apps/web`         | Next.js PWA — UI, API routes, auth, SSE, service worker              |
| `apps/worker`      | pg-boss consumers — AI pipeline + notification/schedule cron         |
| `packages/db`      | Prisma schema + generated client (single source of truth for data)   |
| `packages/ai`      | Anthropic + OpenAI clients (Claude normalize/classify, Whisper STT)  |
| `packages/queue`   | pg-boss job queue, rrule schedule expansion, Twilio SMS, web-push    |
| `packages/storage` | Local-filesystem media store (rooted at `STORAGE_ROOT`)              |

Full design rationale: [`docs/architecture.md`](docs/architecture.md).

## Prerequisites

- Node.js ≥ 20.9
- pnpm 10 (pinned via `packageManager`; `corepack enable` handles it)
- PostgreSQL 16 listening on port **5436** (no docker-compose is committed — run your
  own, e.g. `docker run -d --name carelog-pg -p 5436:5432 -e POSTGRES_USER=carelog -e POSTGRES_PASSWORD=carelog -e POSTGRES_DB=carelog postgres:16`)

## Getting started

```bash
pnpm install
cp env.example apps/web/.env.local      # fill in at least DATABASE_URL, AUTH_SECRET, STORAGE_ROOT
cp env.example apps/worker/.env         # worker reads its own env file
echo 'DATABASE_URL=postgresql://carelog:carelog@localhost:5436/carelog' > packages/db/.env

pnpm db:generate       # prisma generate
pnpm db:deploy         # apply committed migrations
pnpm db:seed           # demo patient + admin/caregiver users
pnpm dev               # web on :3000
pnpm worker:dev        # in a second shell — AI pipeline + cron
```

The app boots with most integrations unset and degrades gracefully: no Google/email env →
those sign-in providers are hidden; no Twilio/VAPID → notifications are logged to the
database only; no Notion env → feedback stays in Postgres. See `env.example` for the
full annotated list — including `ALLOWED_SIGNIN_EMAILS`, which **you should set on any
internet-reachable deployment** (unset means anyone who can authenticate may sign up).

## Commands

```bash
pnpm dev             # web dev server on :3000
pnpm build           # build web
pnpm test            # vitest: web, @carelog/ai, worker, @carelog/storage
pnpm worker:dev      # worker (tsx watch); worker:build; worker:start
pnpm db:generate     # prisma generate
pnpm db:migrate      # prisma migrate dev (creates a migration)
pnpm db:deploy       # prisma migrate deploy (applies committed migrations)
pnpm db:studio       # prisma studio
pnpm db:seed         # seed demo data
```

In `apps/web`: `pnpm test:e2e` (Playwright) and `pnpm lint`. There is no `typecheck`
script — run `pnpm --filter web exec tsc --noEmit` (or `tsc` per package).

## Deployment

A `Dockerfile` + `docker-start.sh` build and run the web service (migrations apply on
boot); the worker runs `pnpm worker:build && pnpm worker:start` as a second service
against the same Postgres. CI lives in `.github/workflows/ci.yml`. The design doc targets
Railway, but nothing is Railway-specific.

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and PR expectations, and
[SECURITY.md](SECURITY.md) for how to report vulnerabilities.

## License

[Apache-2.0](LICENSE)
