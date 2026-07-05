import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { CreateScheduleInput, UpdateScheduleInput } from '@/lib/zod';
import { ScheduleStatus, Prisma } from '@carelog/db';
import { expandSchedule as expandScheduleShared } from '@carelog/queue';
import { RRule } from 'rrule';

export type ScheduleOccurrence = {
  dueAt: Date;
  windowStart: Date;
  windowEnd: Date;
};

export async function createSchedule(actor: Actor, input: CreateScheduleInput) {
  const patientId = input.patientId ?? actor.assignment.patientId;

  if (!can(actor, 'schedule:create', { type: 'schedule', patientId })) {
    throw new ForbiddenError();
  }

  // Validate rrule parses before persisting.
  RRule.fromString(input.rrule);

  const schedule = await prisma.schedule.create({
    data: {
      patientId,
      templateId: input.templateId ?? null,
      name: input.name,
      rrule: input.rrule,
      windowMinutes: input.windowMinutes,
      remindOffsets: input.remindOffsets,
      escalation: input.escalation as Prisma.InputJsonValue | undefined,
    },
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'schedule.create',
    entityType: 'schedule',
    entityId: schedule.id,
    after: schedule as unknown as Record<string, unknown>,
  });

  return schedule;
}

export async function listSchedules(actor: Actor, patientId?: string) {
  const targetPatientId = patientId ?? actor.assignment.patientId;

  if (!can(actor, 'schedule:read', { type: 'schedule', patientId: targetPatientId })) {
    throw new ForbiddenError();
  }

  return prisma.schedule.findMany({
    where: {
      patientId: targetPatientId,
      status: { not: ScheduleStatus.paused },
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSchedule(actor: Actor, id: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new NotFoundError();

  if (!can(actor, 'schedule:read', { type: 'schedule', patientId: schedule.patientId })) {
    throw new ForbiddenError();
  }

  return schedule;
}

export async function updateSchedule(actor: Actor, id: string, input: UpdateScheduleInput) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new NotFoundError();

  if (!can(actor, 'schedule:update', { type: 'schedule', patientId: schedule.patientId })) {
    throw new ForbiddenError();
  }

  if (input.rrule) {
    RRule.fromString(input.rrule);
  }

  const before = { ...schedule } as Record<string, unknown>;
  const updated = await prisma.schedule.update({
    where: { id },
    data: {
      templateId: input.templateId !== undefined ? (input.templateId ?? null) : undefined,
      name: input.name,
      rrule: input.rrule,
      windowMinutes: input.windowMinutes,
      remindOffsets: input.remindOffsets,
      escalation: input.escalation as Prisma.InputJsonValue | undefined,
    },
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'schedule.update',
    entityType: 'schedule',
    entityId: id,
    before,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated;
}

export async function deleteSchedule(actor: Actor, id: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id } });
  if (!schedule) throw new NotFoundError();

  if (!can(actor, 'schedule:delete', { type: 'schedule', patientId: schedule.patientId })) {
    throw new ForbiddenError();
  }

  const before = { ...schedule } as Record<string, unknown>;
  const updated = await prisma.schedule.update({
    where: { id },
    data: { status: ScheduleStatus.paused, deletedAt: new Date() },
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'schedule.delete',
    entityType: 'schedule',
    entityId: id,
    before,
    after: updated as unknown as Record<string, unknown>,
  });

  return updated;
}

export function expandSchedule(
  schedule: { rrule: string; windowMinutes: number },
  start: Date,
  end: Date
): ScheduleOccurrence[] {
  return expandScheduleShared(schedule, start, end);
}
