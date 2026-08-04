import { z } from 'zod';
import { parseSignInAllowlist } from '@/lib/signin-allowlist';

// Auth-related server config, validated once at import. Throwing here surfaces
// misconfiguration loudly at startup rather than at the first sign-in attempt.
//
// AUTH_SECRET/AUTH_URL are deliberately not read here: next-auth v5 infers
// both automatically from process.env (aliasing the legacy NEXTAUTH_SECRET /
// NEXTAUTH_URL names too), so re-reading them into config here would only
// risk overriding that inference with an explicit `undefined`.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  AUTH_GOOGLE_ID: z.string().default(''),
  AUTH_GOOGLE_SECRET: z.string().default(''),
  // Email magic-link (SMTP). Not wired into carelog's login UI yet, but the
  // Nodemailer provider stays registered when configured.
  EMAIL_SERVER: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  // Feedback → central Notion DB mirror. Both unset = the sync no-ops and
  // feedback lives in Postgres only; nothing in the submit path depends on them.
  NOTION_API_KEY: z.string().default(''),
  NOTION_FEEDBACK_DB_ID: z.string().default(''),
  // Public origin the Notion-facing screenshot URLs are built from. Notion's
  // servers fetch these, so it must be the externally reachable origin.
  APP_BASE_URL: z.string().default(''),
  // Shared secret guarding the reconciler cron route.
  CRON_SECRET: z.string().default(''),
  // Shared secret guarding /api/auth/test-login outside development. The route
  // is refused outright in production regardless of this value.
  TEST_LOGIN_SECRET: z.string().default(''),
  // Comma-separated sign-in allowlist. Unset = anyone who authenticates with a
  // configured provider may sign in and onboard their own care circle. Set =
  // only these addresses get past the signIn callback.
  ALLOWED_SIGNIN_EMAILS: z.string().default(''),
});

export const env = schema.parse(process.env);

export const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
export const emailEnabled = Boolean(env.EMAIL_SERVER && env.EMAIL_FROM);
export const notionEnabled = Boolean(env.NOTION_API_KEY && env.NOTION_FEEDBACK_DB_ID);

/**
 * Normalised sign-in allowlist. Empty means "no allowlist configured", which is
 * the open-sign-in default — self-serve onboarding depends on a brand-new user
 * being able to authenticate before they have any assignment or invite.
 */
export const allowedSignInEmails = parseSignInAllowlist(env.ALLOWED_SIGNIN_EMAILS);

const hasAuthSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
if (!hasAuthSecret && env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET (or legacy NEXTAUTH_SECRET) is required in production');
}
