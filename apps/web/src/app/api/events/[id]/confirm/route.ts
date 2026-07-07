import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { confirmEvent } from '@/lib/services/events';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

export async function POST(
  request: Request,
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
    const event = await confirmEvent(actor, id);
    return Response.json(event);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return new Response('Not found', { status: 404 });
    }
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
