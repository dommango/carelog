/**
 * Optional coarse gate on who may authenticate at all.
 *
 * Deliberately not an invite check: a brand-new user has no assignment and no
 * invite, and that is precisely the state /onboarding serves. Per-patient access
 * is enforced on every request by getActor()/can(); this only decides whether an
 * address may hold an account in the first place.
 */
export function parseSignInAllowlist(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** An empty allowlist means "not configured", which allows everyone. */
export function isSignInAllowed(
  email: string | null | undefined,
  allowlist: ReadonlySet<string>
): boolean {
  if (allowlist.size === 0) return true;
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && allowlist.has(normalized));
}
