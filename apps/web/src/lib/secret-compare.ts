import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time comparison of a caller-provided shared secret against the
 * expected value. Digests are compared rather than the raw strings so the
 * comparison runs over a fixed length and does not leak the secret's length.
 *
 * Returns false when either side is empty — an unset secret must never be
 * satisfiable by an absent header.
 */
export function secretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
