import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { ForbiddenError } from '@/lib/errors';

export interface SyncResult {
  events: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  schedules: Array<Record<string, unknown>>;
  cursor: string;
}

export async function getDelta(actor: Actor, since?: string): Promise<SyncResult> {
  if (!can(actor, 'event:read', { type: 'event', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const patientId = actor.assignment.patientId;
  const sinceDate = since ? new Date(since) : new Date(0);

  const [events, templates, schedules] = await Promise.all([
    prisma.careEvent.findMany({
      where: { patientId, updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: 'asc' },
      take: 500,
      include: { author: { select: { name: true } }, attachments: true },
    }),
    prisma.template.findMany({
      where: { patientId, updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    }),
    prisma.schedule.findMany({
      where: { patientId, updatedAt: { gt: sinceDate } },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    }),
  ]);

  const maxUpdated = [...events, ...templates, ...schedules].map((row) => row.updatedAt.getTime()
  );
  const cursorTime = maxUpdated.length > 0 ? Math.max(...maxUpdated) : sinceDate.getTime();
  const cursor = new Date(cursorTime).toISOString();

  return {
    events: events as unknown as Array<Record<string, unknown>>,
    templates: templates as unknown as Array<Record<string, unknown>>,
    schedules: schedules as unknown as Array<Record<string, unknown>>,
    cursor,
  };
}
