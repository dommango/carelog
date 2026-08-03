import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { markAttachmentUploaded } from '@/lib/services/events';
import { prisma } from '@/lib/prisma';
import { enqueue, AI_PROCESS_EVENT } from '@carelog/queue';
import { NotFoundError } from '@/lib/errors';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const { id } = await params;

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!attachment) {
      throw new NotFoundError();
    }

    if (attachment.event.patientId !== actor.assignment.patientId) {
      return new Response('Forbidden', { status: 403 });
    }

    // MERGE NOTE — delete this call when the security-hardening branch (#16)
    // lands. There, PUT /api/upload/[id] stamps uploadedAt itself, as part of
    // the same update that stores the object, and `markAttachmentUploaded` is
    // removed entirely. Marking it here as well would let any caller in the
    // circle assert an upload that never happened, which combined with that
    // branch's write-once guard permanently blocks the real upload. It is kept
    // for now only because this branch does not carry that route change, and
    // the count below needs uploadedAt set by something.
    await markAttachmentUploaded(id);

    // Only once every attachment on the event has landed. This used to fire per
    // attachment, so a two-photo event queued two pipeline runs — the first
    // reading media the second was still uploading, and both racing on the same
    // row. The worker needs all the files present to enrich the event once.
    const pending = await prisma.attachment.count({
      where: { eventId: attachment.eventId, uploadedAt: null },
    });

    if (pending === 0) {
      // singletonKey collapses a duplicate enqueue for the same event into one
      // queued job, which matters when uploads finish near-simultaneously.
      await enqueue(
        AI_PROCESS_EVENT,
        { eventId: attachment.eventId },
        { singletonKey: attachment.eventId }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response('Not found', { status: 404 });
    }
    throw error;
  }
}
