import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, clientIpFromForwardedFor, resetRateLimits } from '@/lib/rate-limit';

beforeEach(() => {
  resetRateLimits();
});

describe('rateLimit', () => {
  it('allows requests up to the limit and rejects the next one', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('k', 3, 60_000).ok).toBe(true);
    }
    expect(rateLimit('k', 3, 60_000)).toEqual({ ok: false, remaining: 0 });
  });

  it('counts each key independently', () => {
    expect(rateLimit('a', 1, 60_000).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('starts a fresh window once the old one expires', async () => {
    expect(rateLimit('k', 1, 1).ok).toBe(true);
    expect(rateLimit('k', 1, 1).ok).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(rateLimit('k', 1, 1).ok).toBe(true);
  });
});

describe('clientIpFromForwardedFor', () => {
  it('falls back to a shared anon key when the header is absent', () => {
    expect(clientIpFromForwardedFor(null)).toBe('anon');
    expect(clientIpFromForwardedFor('')).toBe('anon');
  });

  it('takes the rightmost hop, since earlier hops are client-spoofable', () => {
    expect(clientIpFromForwardedFor('1.1.1.1')).toBe('1.1.1.1');
    expect(clientIpFromForwardedFor('9.9.9.9, 10.0.0.1, 203.0.113.7')).toBe('203.0.113.7');
  });
});
