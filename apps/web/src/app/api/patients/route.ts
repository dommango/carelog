import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { createPatient, listPatients } from '@/lib/services/patients';
import { createPatientSchema } from '@/lib/zod';
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

// Unlike every sibling POST route, this one resolves no Actor: it is the
// onboarding path, so by definition the caller has no assignment yet.
// createPatient owns the authorization check (and the lock that keeps two
// concurrent calls from creating two care circles).
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createPatientSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const patient = await createPatient(session.user.id as string, parsed.data);
    return Response.json(patient, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
