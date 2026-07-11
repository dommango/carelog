import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { createScheduleSchema } from '@/lib/zod';
import { createSchedule, listSchedules } from '@/lib/services/schedules';
import { ForbiddenError } from '@/lib/errors';
import { RRule } from 'rrule';

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
  const patientId = searchParams.get('patientId') ?? undefined;

  try {
    const schedules = await listSchedules(actor, patientId);
    return Response.json(schedules);
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
  const parsed = createScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    RRule.fromString(parsed.data.rrule);
  } catch {
    return Response.json({ error: 'Invalid rrule' }, { status: 400 });
  }

  try {
    const schedule = await createSchedule(actor, parsed.data);
    return Response.json(schedule, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response('Forbidden', { status: 403 });
    }
    throw error;
  }
}
