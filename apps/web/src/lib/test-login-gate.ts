import { secretMatches } from '@/lib/secret-compare';

export type TestLoginDecision =
  | { allowed: true }
  | { allowed: false; status: 403 | 401; message: string };

/**
 * Who may use /api/auth/test-login, which mints a database session for an
 * arbitrary email and is therefore credential-equivalent.
 *
 * - production: refused outright, with no env escape hatch. The retired
 *   ENABLE_TEST_LOGIN flag made this a one-variable-away backdoor on a real
 *   deployment; sign-in there goes through Google or the magic link.
 * - a configured TEST_LOGIN_SECRET is required whenever it is set, in every
 *   non-production environment, so a `next dev` preview is not an open door.
 * - development with no secret set: allowed. The login page's dev sign-in form
 *   is a browser fetch and cannot hold a server secret, so requiring one there
 *   would only mean shipping the secret to the client, which is not a secret.
 * - anything else (test, staging, a preview build) with no secret set: refused,
 *   so forgetting to configure it fails closed.
 */
export function checkTestLoginAccess(opts: {
  nodeEnv: string | undefined;
  expectedSecret: string;
  providedSecret: string | null;
}): TestLoginDecision {
  if (opts.nodeEnv === 'production') {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  // A configured secret is always enforced, development included. Otherwise a
  // preview served by `next dev` would be an open door to a route that grants
  // an admin assignment and a 30-day session. Local development simply leaves
  // TEST_LOGIN_SECRET unset and is unaffected.
  if (opts.expectedSecret) {
    return secretMatches(opts.providedSecret, opts.expectedSecret)
      ? { allowed: true }
      : { allowed: false, status: 401, message: 'Unauthorized' };
  }

  if (opts.nodeEnv === 'development') {
    return { allowed: true };
  }

  return { allowed: false, status: 403, message: 'Forbidden' };
}
