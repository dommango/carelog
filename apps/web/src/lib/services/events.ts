import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { CreateEventInput, UpdateEventInput } from '@/lib/zod';
import { EventStatus, AttachmentKind } from '@carelog/db';
import { getStorage } from '@carelog/storage';
import { enqueue, AI_PROCESS_EVENT } from '@carelog/queue';
import { markAcknowledged } from '@/lib/services/notifications';

export type CreateEventResult = {
  event: Awaited<ReturnType<typeof prisma.careEvent.create>>;
  uploads: Array<{ attachmentId: string; url: string; method: 'PUT' }>;
};

export async function createEvent(actor: Actor, input: CreateEventInput): Promise<CreateEventResult> {
  if (!can(actor, 'event:create', { type: 'event', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const id = input.id ?? randomUUID();
  const now = new Date();
  const storage = getStorage();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.careEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { attachments: true },
    });

    if (existing) {
      const uploads = await Promise.all(
        existing.attachments.map(async (attachment) => {
          const signed = await storage.getSignedUrl(attachment.storageKey, 600);
          return { attachmentId: attachment.id, url: signed.url, method: signed.method };
        })
      );
      return { event: existing, uploads };
    }

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

    const attachments = input.attachments ?? [];
    const uploads: Array<{ attachmentId: string; url: string; method: 'PUT' }> = [];

    for (const attachmentInput of attachments) {
      const storageKey = `attachments/${created.id}/${attachmentInput.id}`;
      await tx.attachment.create({
        data: {
          id: attachmentInput.id,
          eventId: created.id,
          kind: attachmentInput.kind,
          storageKey,
          mimeType: attachmentInput.mimeType,
          sizeBytes: attachmentInput.sizeBytes ?? null,
        },
      });
      const signed = await storage.getSignedUrl(storageKey, 600);
      uploads.push({ attachmentId: attachmentInput.id, url: signed.url, method: signed.method });
    }

    return { event: created, uploads };
  });

  // Only write audit when the event is newly created.
  if (result.event.id === id) {
    await writeAudit({
      actorType: 'user',
      actorId: actor.userId,
      action: 'event.create',
      entityType: 'event',
      entityId: result.event.id,
      after: result.event as unknown as Record<string, unknown>,
      clientId: input.clientId,
    });

    // Phase 4: acknowledge any notification for the linked schedule occurrence.
    if (result.event.scheduleId && result.event.occurredAt) {
      await markAcknowledged(
        result.event.id,
        result.event.scheduleId,
        result.event.occurredAt
      ).catch((err) => {
        console.error('Failed to acknowledge notification:', err);
      });
    }

    // Text-only events have no upload step, so enqueue AI enrichment now.
    // Events with attachments are enqueued once their media finishes uploading
    // (see /api/attachments/[id]/complete) so the worker can read the files.
    if ((input.attachments ?? []).length === 0) {
      await enqueue(AI_PROCESS_EVENT, { eventId: result.event.id }).catch((err) => {
        console.error('Failed to enqueue AI processing:', err);
      });
    }
  }

  return result;
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
    include: { author: { select: { name: true } }, attachments: true },
  });
}

/**
 * Whether anything has ever been logged for this patient. Deliberately not
 * listEvents(..., { limit: 1 }): that pulls rawInput plus two joins across the
 * wire to answer a yes/no, and rawInput is PHI. `select: { id: true }` keeps
 * the answer to a single indexed column.
 */
export async function hasAnyEvent(
  actor: Actor,
  opts: { patientId?: string } = {}
): Promise<boolean> {
  const patientId = opts.patientId ?? actor.assignment.patientId;
  if (!can(actor, 'event:read', { type: 'event', patientId })) {
    throw new ForbiddenError();
  }

  const found = await prisma.careEvent.findFirst({
    where: { patientId, deletedAt: null },
    select: { id: true },
  });

  return found !== null;
}

export async function listEventsNeedingReview(
  actor: Actor,
  opts: { patientId?: string; limit?: number } = {}
) {
  const patientId = opts.patientId ?? actor.assignment.patientId;
  if (!can(actor, 'event:read', { type: 'event', patientId })) {
    throw new ForbiddenError();
  }

  return prisma.careEvent.findMany({
    where: { patientId, deletedAt: null, status: EventStatus.needs_review },
    orderBy: { occurredAt: 'desc' },
    take: opts.limit ?? 20,
    include: { author: { select: { name: true } }, attachments: true },
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
  const incomingVersion = input.version ?? event.version;
  const versionMismatch = incomingVersion !== event.version;

  const updated = await prisma.$transaction(async (tx) => {
    return tx.careEvent.update({
      where: { id },
      data: {
        rawInput: input.rawInput ?? event.rawInput,
        category: input.category ?? event.category,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : event.occurredAt,
        version: { increment: 1 },
        hasConflict: versionMismatch || event.hasConflict,
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

  if (versionMismatch) {
    await writeAudit({
      actorType: 'user',
      actorId: actor.userId,
      action: 'event.conflict',
      entityType: 'event',
      entityId: id,
      before: { version: event.version, ...before },
      after: {
        version: updated.version,
        rawInput: updated.rawInput,
        category: updated.category,
        occurredAt: updated.occurredAt,
      },
      clientId: event.clientId,
    });
  }

  return updated;
}

export async function markAttachmentUploaded(attachmentId: string): Promise<void> {
  await prisma.attachment.update({
    where: { id: attachmentId },
    data: { uploadedAt: new Date() },
  });
}

export async function confirmEvent(actor: Actor, id: string) {
  const event = await prisma.careEvent.findUnique({ where: { id } });
  if (!event) throw new NotFoundError();

  if (!can(actor, 'event:confirm', {
    type: 'event',
    patientId: event.patientId,
    authorId: event.authorId,
    createdAt: event.createdAt,
  })) {
    throw new ForbiddenError();
  }

  const before = { ...event } as Record<string, unknown>;
  const updated = await prisma.careEvent.update({
    where: { id },
    data: { status: EventStatus.confirmed },
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'event.confirm',
    entityType: 'event',
    entityId: id,
    before,
    after: updated as unknown as Record<string, unknown>,
    clientId: event.clientId,
  });

  return updated;
}
