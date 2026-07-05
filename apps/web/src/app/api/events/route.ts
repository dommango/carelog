import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { createEventSchema } from '@/lib/zod';
import { createEvent, listEvents } from '@/lib/services/events';
import { prisma } from '@/lib/prisma';
import { ForbiddenError } from '@/lib/errors';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const { searchParams } = new URL(request.url);

  const idempotencyKey = searchParams.get('idempotencyKey');
  if (idempotencyKey) {
    try {
      const event = await prisma.careEvent.findUnique({
        where: { idempotencyKey },
        include: { author: { select: { name: true } }, attachments: true },
      });
      if (!event) {
        return new Response('Not found', { status: 404 });
      }
      if (event.patientId !== actor.assignment.patientId) {
        return new Response('Forbidden', { status: 403 });
      }
      return Response.json({ event });
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return new Response('Forbidden', { status: 403 });
      }
      throw error;
    }
  }

  const limit = searchParams.has('limit')
    ? parseInt(searchParams.get('limit')!, 10)
    : 50;

  try {
    const events = await listEvents(actor, { limit });
    return Response.json(events);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { event, uploads } = await createEvent(actor, parsed.data);
    return Response.json({ event, uploads }, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
