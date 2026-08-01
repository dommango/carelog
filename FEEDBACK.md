# Feedback → Notion Contract

This app mirrors in-app feedback/bug reports into the shared central Notion database
**"📥 App Feedback"**. This document is the canonical contract that both the app code and
any triage agent must follow. Keep it in sync across all consuming apps.

- **Central database:** `📥 App Feedback`
- **Database ID:** `c153f1e7-b65d-49d2-a2d8-5e57d1f22b70`
- **Data source:** `collection://5ccf696e-e7bf-42ba-ae23-5e12d4d35b2f`
- **Env var:** `NOTION_FEEDBACK_DB_ID` (this ID in dev; prod repointed during supervised cutover)

## Schema

| Property    | Type             | Notes                                                    |
| ----------- | ---------------- | -------------------------------------------------------- |
| Title       | title            | `{emoji} {title}` — 🐛 Bug / 💬 Feedback / ✨ Request    |
| App         | select           | SousIQ, HessFest, CareCover, Arnie, CareLog (one per app) |
| Type        | select           | Bug, Feedback, Request                                   |
| Status      | select           | New, Triaged, In progress, Done, Won't fix, Duplicate    |
| Priority    | select           | Critical, High, Medium, Low                              |
| Environment | select           | Production, Development                                  |
| App Row ID  | rich_text        | Postgres UUID/cuid — **idempotency key, write-once**     |
| Page URL    | url              | page the report was filed from                           |
| User Email  | email            | from auth, if present                                    |
| Browser     | rich_text        | userAgent, truncated                                     |
| Screenshot  | files            | external URLs to the app's public screenshot endpoint    |
| Fix Link    | url              | PR/commit — agent/human writable                         |
| Submitted   | created_time     | auto                                                     |
| Ticket ID   | unique_id (`FB`) | auto                                                     |

Page body: description paragraph + inline image blocks for screenshots.

## Property write-ownership

- **App-owned (never edited by agents):** Title, App, App Row ID, Page URL, User Email,
  Browser, Screenshot, Environment, and the initial Type.
- **Agent-writable:** Status, Priority, Fix Link, and comments.

## Status transitions

```
New → Triaged → In progress → Done
New | Triaged → Won't fix | Duplicate
```

Never move a row backwards out of In progress/Done during automated triage.

## Dedupe rule

Same **App** + near-identical Title within **≤14 days** → the newer row is set to
**Duplicate** with a comment linking to the original. Never archive/delete the original.

## Idempotency / reconciler rule

- The app writes the Notion page id (`notion_page_id` / `notionPageId`) immediately after
  creating a Notion page; a NULL synced-at timestamp is the outbox flag.
- The reconciler **queries Notion by `App Row ID` before creating** a page, so a
  crash-after-create window never produces a duplicate.
- Sync attempts are capped at 5; the last error is retained; persistent failure surfaces
  via host logs — feedback is never silently lost.

## Integration connection (required)

The app authenticates with the ONE shared Notion integration token. That integration
**must be connected to the central DB** (DB `•••` → Connections → add the integration) or
every `pages.create` returns **404**. 401 = bad token; 400 = schema/property mismatch.

## Per-app specifics — CareLog

**App value:** `CareLog`

**Env vars** (both required to enable the mirror; missing either keeps feedback DB-only —
`notionEnabled` in `apps/web/src/lib/env.ts` gates the whole sync):

- `NOTION_API_KEY` — Notion integration token (the integration must be connected to the
  central "📥 App Feedback" database — see above).
- `NOTION_FEEDBACK_DB_ID` — the central database ID above (`c153f1e7-…`).
- `APP_BASE_URL` — the externally reachable origin (e.g. `https://carelog.up.railway.app`).
  Notion's servers fetch screenshot URLs built from it; when unset, cards sync **without**
  images rather than carrying URLs Notion cannot resolve.
- `CRON_SECRET` — shared secret for the reconciler route. Must match on the web service
  and the worker, or the reconciler never runs.

Set these in `apps/web/.env.local` (web) and `apps/worker/.env` (`APP_BASE_URL` +
`CRON_SECRET` only), and on both Railway services for prod.

**Data model:** `model Feedback` in `packages/db/prisma/schema.prisma` → table `feedback`,
with outbox columns `notion_page_id`, `notion_synced_at` (NULL = unsynced, the outbox
flag), `notion_sync_attempts`, `notion_last_error`. Apply with `pnpm db:push` (this repo
does not commit a Prisma migrations directory). No history fencing was needed — the table
is new, so there are no pre-existing rows for the reconciler to sweep.

**Submit path:** `POST /api/feedback` validates with zod, rate-limits, inserts the row and
returns `{ id }` immediately. The Notion mirror runs via Next's `after()` in
`apps/web/src/lib/services/feedback.ts`, so a slow or broken integration can never delay
or fail a submission. On success it writes the page id + synced-at; on failure the row
keeps `notion_synced_at = NULL` and the reconciler retries it.

**Reconciler:** `POST /api/cron/reconcile-feedback` (guarded by a constant-time
`x-cron-secret` check), invoked every 30 minutes by the always-on worker via the pg-boss
schedule `feedback.reconcile_tick` (`apps/worker/src/cron/feedbackReconcile.ts`). It
queries Notion by `App Row ID` first and backfills rather than creating a duplicate; a
failed lookup is treated as "unknown", never as "no page exists". Batch 20, max 5
attempts, skips rows younger than 2 minutes so it does not race the submit-path sync.

**Screenshot endpoint:** `GET /api/feedback/screenshots/{id}/{index}` — public (Notion
fetches it server-side), raster-only allowlist (`image/png`, `image/jpeg`, `image/webp` —
no SVG, which can carry script), `X-Content-Type-Options: nosniff` and
`Content-Security-Policy: default-src 'none'; sandbox`.

**Rate limit:** in-process fixed-window limiter (`apps/web/src/lib/rate-limit.ts`, no new
dependency — the repo had none): 10 submits / 5 min per signed-in user or per source IP,
30 / 5 min for the shared IP-less "anon" bucket. Keyed on the **rightmost**
`X-Forwarded-For` hop, since earlier hops are client-spoofable. Counters are per-process
and reset on deploy, which is the right fit for CareLog's single web instance.

**Widget:** `apps/web/src/components/FeedbackWidget.tsx`, mounted once in
`apps/web/src/app/layout.tsx` outside the signed-in branch so sign-in problems can also be
reported. Trigger: floating button or Cmd/Ctrl+Shift+F (suppressed while typing). Region
snip via `html-to-image` + canvas crop, markup via `ScreenshotAnnotator.tsx`. Max 3 images
per report (`apps/web/src/lib/feedback/limits.ts` — the single source shared by the widget,
the route schema and the screenshot endpoint).
