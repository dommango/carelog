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
