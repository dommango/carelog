// Minimal in-process fixed-window rate limiter. CareLog runs as a single web
// instance on Railway, so a per-process counter is the honest fit — deliberately
// no new dependency and no Redis. Buckets are held in module state, which resets
// on deploy; that is acceptable for abuse-damping on a public write endpoint.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Drop expired buckets so a long-lived process can't accumulate one entry per
// distinct key seen since boot.
function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) return { ok: false, remaining: 0 };

  buckets.set(key, { ...existing, count: existing.count + 1 });
  return { ok: true, remaining: limit - existing.count - 1 };
}

// Rightmost X-Forwarded-For hop — appended by the trusted proxy. The leftmost is
// client-supplied and therefore spoofable, so keying on it would let an attacker
// mint unlimited buckets. Returns "anon" when no header is present.
export function clientIpFromForwardedFor(header: string | null): string {
  if (!header) return 'anon';
  const hops = header
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  return hops.length > 0 ? hops[hops.length - 1]! : 'anon';
}

// Test seam: buckets are module state, so suites that assert limit behaviour need
// a clean slate between cases.
export function resetRateLimits(): void {
  buckets.clear();
}
