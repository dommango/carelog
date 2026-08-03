import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActorForPatient, can } from '@/lib/policy';
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

    await markAttachmentUploaded(id);
    await enqueue(AI_PROCESS_EVENT, { eventId: attachment.eventId });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response('Not found', { status: 404 });
    }
    throw error;
  }
}
