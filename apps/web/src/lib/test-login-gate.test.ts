import { describe, it, expect } from 'vitest';
import { checkTestLoginAccess } from '@/lib/test-login-gate';

const SECRET = 'a-shared-secret-value';

describe('checkTestLoginAccess', () => {
  it('refuses in production even when the secret is correct', () => {
    // The regression that matters: this route mints a session for any email, so
    // no env var may re-enable it on a real deployment. The retired
    // ENABLE_TEST_LOGIN flag made it exactly one variable away.
    expect(
      checkTestLoginAccess({
        nodeEnv: 'production',
        expectedSecret: SECRET,
        providedSecret: SECRET,
      })
    ).toEqual({ allowed: false, status: 403, message: 'Forbidden' });
  });

  it('refuses in production when no secret is configured at all', () => {
    expect(
      checkTestLoginAccess({ nodeEnv: 'production', expectedSecret: '', providedSecret: null })
        .allowed
    ).toBe(false);
  });

  it('allows development when no secret is configured', () => {
    // The login page's dev sign-in form is a browser fetch and cannot hold a
    // server secret; requiring one would only mean shipping it to the client.
    expect(
      checkTestLoginAccess({ nodeEnv: 'development', expectedSecret: '', providedSecret: null })
    ).toEqual({ allowed: true });
  });

  it('enforces a configured secret even in development', () => {
    // Otherwise a preview served by `next dev` is an open door to a route that
    // grants an admin assignment and a 30-day session.
    expect(
      checkTestLoginAccess({
        nodeEnv: 'development',
        expectedSecret: SECRET,
        providedSecret: null,
      })
    ).toEqual({ allowed: false, status: 401, message: 'Unauthorized' });

    expect(
      checkTestLoginAccess({
        nodeEnv: 'development',
        expectedSecret: SECRET,
        providedSecret: SECRET,
      })
    ).toEqual({ allowed: true });
  });

  it('allows a matching secret outside development', () => {
    expect(
      checkTestLoginAccess({ nodeEnv: 'test', expectedSecret: SECRET, providedSecret: SECRET })
    ).toEqual({ allowed: true });
  });

  it('rejects a wrong or missing secret outside development', () => {
    for (const providedSecret of ['wrong', '', null]) {
      expect(
        checkTestLoginAccess({ nodeEnv: 'test', expectedSecret: SECRET, providedSecret })
      ).toEqual({ allowed: false, status: 401, message: 'Unauthorized' });
    }
  });

  it('refuses outside development when no secret is configured', () => {
    // Otherwise an unset TEST_LOGIN_SECRET would leave a staging build wide open.
    expect(
      checkTestLoginAccess({ nodeEnv: 'staging', expectedSecret: '', providedSecret: '' })
    ).toEqual({ allowed: false, status: 403, message: 'Forbidden' });
  });

  it('refuses when NODE_ENV is unset', () => {
    expect(
      checkTestLoginAccess({ nodeEnv: undefined, expectedSecret: '', providedSecret: null }).allowed
    ).toBe(false);
  });
});
