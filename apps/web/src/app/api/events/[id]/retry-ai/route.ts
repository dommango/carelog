// POST /api/events/[id]/retry-ai — put a failed event back through the AI
// pipeline.
//
// Without this, `ai_failed` was terminal: the event kept its raw input but the
// only way to get structure onto it was to retype it. A transient outage during
// enrichment permanently degraded every record it touched.

import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActorForPatient, can } from '@/lib/policy';
import { prisma } from '@/lib/prisma';
import { EventStatus } from '@carelog/db';
import { enqueue, AI_PROCESS_EVENT } from '@carelog/queue';
import { writeAudit } from '@/lib/audit';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  const event = await prisma.careEvent.findUnique({
    where: { id },
    select: { id: true, patientId: true, status: true, clientId: true },
  });

  if (!event || event.status === undefined) {
    return new Response('Not found', { status: 404 });
  }

  const actor = await getActorForPatient(session.user.id as string, event.patientId);
  if (!can(actor, 'event:create', { type: 'event', patientId: event.patientId })) {
    return new Response('Forbidden', { status: 403 });
  }

  // Only a settled failure is retryable. Re-queueing something already
  // pending_ai would just duplicate work the worker is about to do anyway, and
  // a confirmed event must not be silently re-derived underneath its reviewer.
  if (event.status !== EventStatus.ai_failed && event.status !== EventStatus.needs_review) {
    return Response.json(
      { error: `Cannot retry an event with status ${event.status}` },
      { status: 409 }
    );
  }

  // Conditional so two people tapping Retry produce one queued job, not two.
  const reset = await prisma.careEvent.updateMany({
    where: { id, status: event.status },
    data: { status: EventStatus.pending_ai, aiClaimedAt: null, aiFlags: [] },
  });

  if (reset.count === 0) {
    return Response.json({ error: 'Event changed; try again' }, { status: 409 });
  }

  await writeAudit({
    actorType: 'user',
    actorId: actor!.userId,
    action: 'event.retry_ai',
    entityType: 'event',
    entityId: id,
    before: { status: event.status },
    after: { status: EventStatus.pending_ai },
    clientId: event.clientId,
  });

  await enqueue(AI_PROCESS_EVENT, { eventId: id }, { singletonKey: id });

  return Response.json({ ok: true, status: EventStatus.pending_ai });
}
