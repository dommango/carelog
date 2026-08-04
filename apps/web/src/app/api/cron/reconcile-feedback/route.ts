// POST /api/cron/reconcile-feedback — drives the Notion outbox reconciler.
// Guarded by a shared secret; the always-on worker pokes it on a pg-boss schedule
// (see apps/worker/src/cron/feedbackReconcile.ts).

import { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { secretMatches } from '@/lib/secret-compare';
import { reconcileFeedbackNotion } from '@/lib/notion/feedback-reconcile';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-cron-secret'), env.CRON_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const summary = await reconcileFeedbackNotion();
  return Response.json(summary);
}
