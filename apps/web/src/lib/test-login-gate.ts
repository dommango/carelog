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
 * - development: allowed unguarded. The login page's dev sign-in form is a
 *   browser fetch, so it cannot hold a server secret — requiring one here would
 *   only mean shipping the secret to the client, which is not a secret.
 * - anything else (test, staging, a preview build): the shared secret is
 *   required, so finding the URL is not enough to walk in.
 */
export function checkTestLoginAccess(opts: {
  nodeEnv: string | undefined;
  expectedSecret: string;
  providedSecret: string | null;
}): TestLoginDecision {
  if (opts.nodeEnv === 'production') {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if (opts.nodeEnv === 'development') {
    return { allowed: true };
  }

  if (!opts.expectedSecret) {
    return { allowed: false, status: 403, message: 'Forbidden' };
  }

  if (!secretMatches(opts.providedSecret, opts.expectedSecret)) {
    return { allowed: false, status: 401, message: 'Unauthorized' };
  }

  return { allowed: true };
}
