import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { CreateEventInput, UpdateEventInput } from '@/lib/zod';
import { EventStatus } from '@carelog/db';

export async function createEvent(actor: Actor, input: CreateEventInput) {
  if (!can(actor, 'event:create', { type: 'event', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const id = randomUUID();
  const now = new Date();

  const event = await prisma.$transaction(async (tx) => {
    const existing = await tx.careEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return existing;

    const created = await tx.careEvent.create({
      data: {
        id,
        patientId: actor.assignment.patientId,
        authorId: actor.userId,
        category: input.category ?? null,
        status: EventStatus.pending_ai,
        occurredAt: new Date(input.occurredAt),
        capturedAt: now,
        rawInput: input.rawInput,
        templateId: input.templateId ?? null,
        scheduleId: input.scheduleId ?? null,
        clientId: input.clientId,
        idempotencyKey: input.idempotencyKey,
      },
    });

    return created;
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'event.create',
    entityType: 'event',
    entityId: event.id,
    after: event as unknown as Record<string, unknown>,
    clientId: input.clientId,
  });

  return event;
}

export async function listEvents(
  actor: Actor,
  opts: { patientId?: string; limit?: number; cursor?: string } = {}
) {
  const patientId = opts.patientId ?? actor.assignment.patientId;
  if (!can(actor, 'event:read', { type: 'event', patientId })) {
    throw new ForbiddenError();
  }

  return prisma.careEvent.findMany({
    where: { patientId, deletedAt: null },
    orderBy: { occurredAt: 'desc' },
    take: opts.limit ?? 50,
    include: { author: { select: { name: true } } },
  });
}

export async function updateEvent(actor: Actor, id: string, input: UpdateEventInput) {
  const event = await prisma.careEvent.findUnique({ where: { id } });
  if (!event) throw new NotFoundError();

  if (
    !can(actor, 'event:update', {
      type: 'event',
      patientId: event.patientId,
      authorId: event.authorId,
      createdAt: event.createdAt,
    })
  ) {
    throw new ForbiddenError();
  }

  const before = { ...event } as Record<string, unknown>;

  const updated = await prisma.$transaction(async (tx) => {
    return tx.careEvent.update({
      where: { id },
      data: {
        rawInput: input.rawInput ?? event.rawInput,
        category: input.category ?? event.category,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : event.occurredAt,
        version: { increment: 1 },
      },
    });
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'event.update',
    entityType: 'event',
    entityId: id,
    before,
    after: updated as unknown as Record<string, unknown>,
    clientId: event.clientId,
  });

  return updated;
}
