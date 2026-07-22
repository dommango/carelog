import { z } from 'zod';

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
});

export const env = schema.parse(process.env);

export const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
export const emailEnabled = Boolean(env.EMAIL_SERVER && env.EMAIL_FROM);

const hasAuthSecret = Boolean(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET);
if (!hasAuthSecret && env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET (or legacy NEXTAUTH_SECRET) is required in production');
}
