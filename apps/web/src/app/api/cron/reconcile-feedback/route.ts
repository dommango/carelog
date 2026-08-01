// POST /api/cron/reconcile-feedback — drives the Notion outbox reconciler.
// Guarded by a shared secret; the always-on worker pokes it on a pg-boss schedule
// (see apps/worker/src/cron/feedbackReconcile.ts).

import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { reconcileFeedbackNotion } from '@/lib/notion/feedback-reconcile';

export const dynamic = 'force-dynamic';

// Compare digests rather than the raw values so the comparison is constant-time
// over a fixed length and does not leak the secret's length.
function secretMatches(provided: string | null): boolean {
  if (!env.CRON_SECRET || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(env.CRON_SECRET).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-cron-secret'))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const summary = await reconcileFeedbackNotion();
  return Response.json(summary);
}
