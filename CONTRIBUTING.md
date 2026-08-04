# Contributing to CareLog

Thanks for your interest! CareLog is a small personal project; issues and PRs are welcome,
but scope-changing features are best discussed in an issue first.

## Setup

Follow the [README](README.md) prerequisites (Node ≥ 20.9, pnpm 10, Postgres 16 on port
5436), then:

```bash
pnpm install --frozen-lockfile
pnpm db:generate                        # required before anything resolves @carelog/*
pnpm --filter "./packages/*" build      # internal packages are consumed via built dist/
pnpm db:deploy && pnpm db:seed
```

## Non-obvious rules (CI enforces these)

- **Migrations are committed.** Schema changes go through `pnpm db:migrate` (never
  `db:push`) — CI runs `prisma migrate diff --exit-code` and fails on drift between the
  schema and the migrations directory.
- Internal `@carelog/*` imports resolve from each package's built `dist/` — rebuild the
  package (`pnpm --filter @carelog/<name> build`) after editing it.
- `apps/web` targets a newer Next.js than most tooling assumes — see `apps/web/AGENTS.md`.

## Before opening a PR

Run the full local gate (mirrors CI):

```bash
pnpm --filter web exec tsc --noEmit     # typecheck (no root script)
pnpm test                               # vitest across workspaces
pnpm --filter web lint
pnpm --filter web test:e2e              # Playwright (needs the dev DB)
```

Use conventional commit messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
`chore:`, `perf:`, `ci:`).

## Conduct & security

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Never include
real patient data in issues, PRs, fixtures, or seed files — use obviously fictional data.
Security issues go through [SECURITY.md](SECURITY.md), not the issue tracker.
