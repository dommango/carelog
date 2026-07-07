import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { reportQuerySchema } from '@/lib/zod';
import { getTimeline } from '@/lib/services/reports';
import { ForbiddenError } from '@/lib/errors';
import { EventCategory } from '@carelog/db';

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
  const parsed = reportQuerySchema.safeParse({
    patientId: searchParams.get('patientId') ?? undefined,
    start: searchParams.get('start'),
    end: searchParams.get('end'),
    category: searchParams.get('category') ?? undefined,
    authorId: searchParams.get('authorId') ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const filters: { category?: EventCategory; authorId?: string } = {};
  if (parsed.data.category) filters.category = parsed.data.category;
  if (parsed.data.authorId) filters.authorId = parsed.data.authorId;

  try {
    const events = await getTimeline(actor, parsed.data, filters);
    return Response.json(events);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
