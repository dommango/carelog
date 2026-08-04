# Security Policy

## Supported versions

CareLog is pre-1.0. Only the `main` branch receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](../../security/advisories/new) — do **not** open a public
issue. You can expect an acknowledgment within a week. Please allow up to 90 days for a
fix before public disclosure.

**This app handles sensitive health data — do not include real care records, patient
names, or production URLs in a report.** Reproduce against seeded demo data instead.

## Security model (for researchers)

Things that are deliberate design, not oversights:

- `/api/auth/test-login` refuses outright in production with no env escape hatch, and
  outside development requires `TEST_LOGIN_SECRET`; it fails closed when unset.
- Cron/reconciler routes are guarded by a constant-time comparison against `CRON_SECRET`.
- The public feedback-screenshot endpoint serves a raster-only allowlist (PNG/JPEG/WebP —
  no SVG), with `X-Content-Type-Options: nosniff` and a `default-src 'none'; sandbox` CSP.
- Rate limiting keys on the **rightmost** `X-Forwarded-For` hop, since earlier hops are
  client-spoofable.
- `ALLOWED_SIGNIN_EMAILS` unset intentionally allows open sign-up (self-serve onboarding);
  deployments that want a closed instance must set it.

Reports about secrets in the repository, authentication/authorization bypasses, cross-user
data access within a care circle, or the AI pipeline leaking one patient's data into
another's records are especially valuable.
