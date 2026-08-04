import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActorForPatient, can } from '@/lib/policy';
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

  const { id } = await params;

  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { event: true },
    });

    if (!attachment) {
      throw new NotFoundError();
    }

    const patientId = attachment.event.patientId;

    // Same gate as PUT /api/upload/[id]: resolved for this specific patient,
    // and requiring the event-authoring permission so a read-only viewer
    // cannot drive an attachment to completion.
    const actor = await getActorForPatient(session.user.id as string, patientId);
    if (!can(actor, 'event:create', { type: 'event', patientId })) {
      return new Response('Forbidden', { status: 403 });
    }

    // Deliberately does NOT mark the attachment uploaded. That stamp is the
    // record that bytes were actually stored, so it belongs to the request that
    // stored them (PUT /api/upload/[id]). Setting it here let any caller assert
    // an upload had happened when it had not.

    // Enqueue only once every attachment on the event has landed. This used to
    // fire per attachment, so a two-photo event queued two pipeline runs — the
    // first reading media the second was still uploading, and both racing on
    // the same row. The worker needs all the files present to enrich the event
    // once. `uploadedAt` is set by the upload route, so this now counts
    // attachments whose bytes genuinely exist.
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
