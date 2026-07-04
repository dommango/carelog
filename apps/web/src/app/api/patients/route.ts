import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { ForbiddenError } from '@/lib/errors';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const patients = await listPatients(actor);
    return Response.json(patients);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
