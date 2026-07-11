import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { createEvent, listEvents, updateEvent, confirmEvent } from '@/lib/services/events';
import { Actor } from '@/lib/policy';
import { EventCategory, EventStatus, Role } from '@carelog/db';
import { ForbiddenError } from '@/lib/errors';

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens"
    RESTART IDENTITY CASCADE;
  `);
}

async function seed() {
  const patient = await prisma.patient.create({ data: { name: 'Mom' } });
  const adminUser = await prisma.user.create({
    data: { email: 'admin@test.local', name: 'Admin' },
  });
  const caregiverUser = await prisma.user.create({
    data: { email: 'cg@test.local', name: 'Caregiver' },
  });
  const otherCaregiverUser = await prisma.user.create({
    data: { email: 'other@test.local', name: 'Other' },
  });

  const adminAssignment = await prisma.caregiverAssignment.create({
    data: { userId: adminUser.id, patientId: patient.id, role: Role.admin },
  });
  const caregiverAssignment = await prisma.caregiverAssignment.create({
    data: {
      userId: caregiverUser.id,
      patientId: patient.id,
      role: Role.caregiver,
    },
  });
  const otherAssignment = await prisma.caregiverAssignment.create({
    data: {
      userId: otherCaregiverUser.id,
      patientId: patient.id,
      role: Role.caregiver,
    },
  });

  const adminActor: Actor = {
    userId: adminUser.id,
    role: Role.admin,
    assignment: adminAssignment,
  };
  const caregiverActor: Actor = {
    userId: caregiverUser.id,
    role: Role.caregiver,
    assignment: caregiverAssignment,
  };
  const otherActor: Actor = {
    userId: otherCaregiverUser.id,
    role: Role.caregiver,
    assignment: otherAssignment,
  };

  return {
    patient,
    caregiverUser,
    adminActor,
    caregiverActor,
    otherActor,
  };
}

function eventInput(overrides: Partial<{
  rawInput: string;
  category: EventCategory;
  occurredAt: string;
  templateId: string;
  clientId: string;
  idempotencyKey: string;
}> = {}) {
  return {
    rawInput: overrides.rawInput ?? 'Gave albuterol nebulizer',
    category: overrides.category ?? EventCategory.nebulizer_treatment,
    occurredAt: overrides.occurredAt ?? new Date().toISOString(),
    templateId: overrides.templateId,
    clientId: overrides.clientId ?? 'test-client',
    idempotencyKey: overrides.idempotencyKey ?? randomUUID(),
    attachments: [],
  };
}

describe('events service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates an event and writes an audit row', async () => {
    const { adminActor } = await seed();
    const { event } = await createEvent(adminActor, eventInput());

    expect(event.rawInput).toBe('Gave albuterol nebulizer');
    expect(event.authorId).toBe(adminActor.userId);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'event', entityId: event.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('event.create');
  });

  it('lists events newest first', async () => {
    const { adminActor } = await seed();
    await createEvent(
      adminActor,
      eventInput({
        rawInput: 'Older',
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
      })
    );
    await createEvent(
      adminActor,
      eventInput({ rawInput: 'Newer' })
    );

    const events = await listEvents(adminActor);
    expect(events.map((e) => e.rawInput)).toEqual(['Newer', 'Older']);
  });

  it('is idempotent on duplicate idempotencyKey', async () => {
    const { adminActor } = await seed();
    const key = randomUUID();
    const { event: event1 } = await createEvent(adminActor, eventInput({ idempotencyKey: key }));
    const { event: event2 } = await createEvent(
      adminActor,
      eventInput({ idempotencyKey: key, rawInput: 'Different text' })
    );

    expect(event1.id).toBe(event2.id);
    expect(event2.rawInput).toBe('Gave albuterol nebulizer');
  });

  it('allows admin to update any event', async () => {
    const { adminActor, caregiverActor } = await seed();
    const { event } = await createEvent(caregiverActor, eventInput());
    const updated = await updateEvent(adminActor, event.id, {
      rawInput: 'Updated by admin',
    });

    expect(updated.rawInput).toBe('Updated by admin');
    expect(updated.version).toBe(2);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'event', entityId: event.id, action: 'event.update' },
    });
    expect(audits).toHaveLength(1);
  });

  it('allows caregiver to update own event within 24h', async () => {
    const { caregiverActor } = await seed();
    const { event } = await createEvent(caregiverActor, eventInput());
    const updated = await updateEvent(caregiverActor, event.id, {
      rawInput: 'Updated by caregiver',
    });

    expect(updated.rawInput).toBe('Updated by caregiver');
  });

  it('forbids caregiver from updating own event after 24h', async () => {
    const { caregiverActor } = await seed();
    const { event } = await createEvent(caregiverActor, eventInput());
    const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.$executeRawUnsafe(
      `UPDATE "care_events" SET "created_at" = $1 WHERE "id" = $2`,
      stale,
      event.id
    );

    await expect(
      updateEvent(caregiverActor, event.id, { rawInput: 'Too late' })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids caregiver from updating another users event', async () => {
    const { caregiverActor, otherActor } = await seed();
    const { event } = await createEvent(caregiverActor, eventInput());

    await expect(
      updateEvent(otherActor, event.id, { rawInput: 'Not yours' })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows caregiver to confirm a needs_review event', async () => {
    const { caregiverActor, caregiverUser, patient } = await seed();
    const event = await prisma.careEvent.create({
      data: {
        id: randomUUID(),
        patientId: patient.id,
        authorId: caregiverUser.id,
        rawInput: 'Needs review',
        status: EventStatus.needs_review,
        occurredAt: new Date(),
        capturedAt: new Date(),
        clientId: 'test',
        idempotencyKey: randomUUID(),
      },
    });

    const confirmed = await confirmEvent(caregiverActor, event.id);
    expect(confirmed.status).toBe(EventStatus.confirmed);

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'event', entityId: event.id, action: 'event.confirm' },
    });
    expect(audits).toHaveLength(1);
  });
});
