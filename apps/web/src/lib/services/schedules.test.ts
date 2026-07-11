import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '@/lib/prisma';
import { createSchedule, expandSchedule, listSchedules, updateSchedule, deleteSchedule } from '@/lib/services/schedules';
import { Actor } from '@/lib/policy';
import { Role, ScheduleStatus } from '@carelog/db';
import { ForbiddenError } from '@/lib/errors';

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens", "push_subscriptions"
    RESTART IDENTITY CASCADE;
  `);
}

async function seed() {
  const patient = await prisma.patient.create({ data: { name: 'Mom' } });
  const adminUser = await prisma.user.create({ data: { email: 'admin@test.local', name: 'Admin' } });
  const caregiverUser = await prisma.user.create({ data: { email: 'cg@test.local', name: 'Caregiver' } });

  const adminAssignment = await prisma.caregiverAssignment.create({
    data: { userId: adminUser.id, patientId: patient.id, role: Role.admin },
  });
  const caregiverAssignment = await prisma.caregiverAssignment.create({
    data: { userId: caregiverUser.id, patientId: patient.id, role: Role.caregiver },
  });

  const adminActor: Actor = { userId: adminUser.id, role: Role.admin, assignment: adminAssignment };
  const caregiverActor: Actor = { userId: caregiverUser.id, role: Role.caregiver, assignment: caregiverAssignment };

  return { patient, adminActor, caregiverActor, adminUser, caregiverUser };
}

describe('schedules service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a schedule and validates rrule', async () => {
    const { adminActor } = await seed();
    const schedule = await createSchedule(adminActor, {
      name: 'Morning nebulizer',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
      windowMinutes: 90,
      remindOffsets: [0, 15],
    });

    expect(schedule.name).toBe('Morning nebulizer');
    expect(schedule.remindOffsets).toEqual([0, 15]);
  });

  it('rejects an invalid rrule', async () => {
    const { adminActor } = await seed();
    await expect(
      createSchedule(adminActor, {
        name: 'Bad',
        rrule: 'INVALID',
      })
    ).rejects.toThrow();
  });

  it('lists active schedules', async () => {
    const { adminActor } = await seed();
    await createSchedule(adminActor, {
      name: 'Morning nebulizer',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });

    const schedules = await listSchedules(adminActor);
    expect(schedules).toHaveLength(1);
  });

  it('forbids caregivers from creating schedules', async () => {
    const { caregiverActor } = await seed();
    await expect(
      createSchedule(caregiverActor, {
        name: 'Bad',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
      })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('expands a daily rrule', () => {
    const schedule = {
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260704T000000Z',
      windowMinutes: 60,
    };

    const start = new Date('2026-07-05T00:00:00Z');
    const end = new Date('2026-07-07T00:00:00Z');
    const occurrences = expandSchedule(schedule, start, end);

    expect(occurrences).toHaveLength(2);
    expect(occurrences[0].dueAt.toISOString()).toBe('2026-07-05T08:00:00.000Z');
    expect(occurrences[0].windowStart.toISOString()).toBe('2026-07-05T07:30:00.000Z');
    expect(occurrences[0].windowEnd.toISOString()).toBe('2026-07-05T08:30:00.000Z');
  });

  it('updates a schedule', async () => {
    const { adminActor } = await seed();
    const schedule = await createSchedule(adminActor, {
      name: 'Morning nebulizer',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });

    const updated = await updateSchedule(adminActor, schedule.id, { name: 'Evening nebulizer' });
    expect(updated.name).toBe('Evening nebulizer');
  });

  it('soft deletes a schedule', async () => {
    const { adminActor } = await seed();
    const schedule = await createSchedule(adminActor, {
      name: 'Morning nebulizer',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });

    await deleteSchedule(adminActor, schedule.id);
    const schedules = await listSchedules(adminActor);
    expect(schedules).toHaveLength(0);

    const paused = await prisma.schedule.findUnique({ where: { id: schedule.id } });
    expect(paused?.status).toBe(ScheduleStatus.paused);
    expect(paused?.deletedAt).not.toBeNull();
  });
});
