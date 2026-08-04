import { describe, it, expect } from 'vitest';
import { parseSignInAllowlist, isSignInAllowed } from '@/lib/signin-allowlist';

describe('parseSignInAllowlist', () => {
  it('treats unset and empty as no allowlist', () => {
    expect(parseSignInAllowlist(undefined).size).toBe(0);
    expect(parseSignInAllowlist('').size).toBe(0);
    expect(parseSignInAllowlist('  ,  ,').size).toBe(0);
  });

  it('trims, lowercases, and drops blanks', () => {
    const list = parseSignInAllowlist(' Dom@Example.com , second@example.com ,, ');
    expect([...list]).toEqual(['dom@example.com', 'second@example.com']);
  });
});

describe('isSignInAllowed', () => {
  const configured = parseSignInAllowlist('dom@example.com');

  it('allows everyone when no allowlist is configured', () => {
    const open = parseSignInAllowlist('');
    expect(isSignInAllowed('anyone@example.com', open)).toBe(true);
    // Notably including a brand-new user with no assignment and no invite —
    // self-serve onboarding depends on this staying true.
    expect(isSignInAllowed('brand-new@example.com', open)).toBe(true);
    expect(isSignInAllowed(null, open)).toBe(true);
  });

  it('admits a listed address regardless of case or surrounding space', () => {
    expect(isSignInAllowed('dom@example.com', configured)).toBe(true);
    expect(isSignInAllowed('  DOM@Example.COM  ', configured)).toBe(true);
  });

  it('rejects an unlisted address', () => {
    expect(isSignInAllowed('attacker@example.com', configured)).toBe(false);
  });

  it('rejects a missing address when an allowlist is configured', () => {
    expect(isSignInAllowed(null, configured)).toBe(false);
    expect(isSignInAllowed(undefined, configured)).toBe(false);
    expect(isSignInAllowed('', configured)).toBe(false);
    expect(isSignInAllowed('   ', configured)).toBe(false);
  });
});
