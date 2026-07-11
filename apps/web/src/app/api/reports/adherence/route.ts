import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { reportQuerySchema } from '@/lib/zod';
import { getAdherence } from '@/lib/services/reports';
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
  const parsed = reportQuerySchema.safeParse({
    patientId: searchParams.get('patientId') ?? undefined,
    start: searchParams.get('start'),
    end: searchParams.get('end'),
  });

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await getAdherence(actor, parsed.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
