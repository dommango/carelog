import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  getAdherence,
  getMoodTrends,
  getMealHydrationSummary,
  getDoctorVisitExport,
  exportToCsv,
} from '@/lib/services/reports';
import { createSchedule } from '@/lib/services/schedules';
import { Actor } from '@/lib/policy';
import { EventCategory, EventStatus, Prisma, Role } from '@carelog/db';

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

function makeEvent(
  patientId: string,
  authorId: string,
  overrides: Partial<{
    rawInput: string;
    category: EventCategory;
    occurredAt: string;
    scheduleId: string;
    status: EventStatus;
    structuredData: Record<string, unknown>;
    aiFlags: string[];
  }> = {}
) {
  return prisma.careEvent.create({
    data: {
      id: randomUUID(),
      patientId,
      authorId,
      rawInput: overrides.rawInput ?? 'Test event',
      category: overrides.category ?? null,
      status: overrides.status ?? EventStatus.confirmed,
      occurredAt: new Date(overrides.occurredAt ?? new Date().toISOString()),
      capturedAt: new Date(),
      scheduleId: overrides.scheduleId ?? null,
      structuredData: overrides.structuredData
        ? (overrides.structuredData as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      aiFlags: overrides.aiFlags ?? [],
      clientId: 'test-client',
      idempotencyKey: randomUUID(),
    },
  });
}

describe('reports service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('adherence', () => {
    it('computes scheduled vs logged and on-time percentage', async () => {
      const { adminActor, patient, adminUser } = await seed();
      const schedule = await createSchedule(adminActor, {
        name: 'Morning nebulizer',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260701T000000Z',
        windowMinutes: 60,
      });

      // Two on-time logs and one missed across three days.
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'On time 1',
        scheduleId: schedule.id,
        occurredAt: '2026-07-01T08:00:00Z',
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'On time 2',
        scheduleId: schedule.id,
        occurredAt: '2026-07-02T08:15:00Z',
      });
      // July 3 is missed.

      const result = await getAdherence(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-03T23:59:59Z',
      });

      expect(result).toHaveLength(1);
      const row = result[0];
      expect(row.scheduled).toBe(3);
      expect(row.logged).toBe(2);
      expect(row.onTime).toBe(2);
      expect(row.missed).toBe(1);
      expect(row.onTimePercent).toBe(67);
    });

    it('excludes needs_review events from adherence', async () => {
      const { adminActor, patient, adminUser } = await seed();
      const schedule = await createSchedule(adminActor, {
        name: 'Meds',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260701T000000Z',
        windowMinutes: 60,
      });

      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Unconfirmed',
        scheduleId: schedule.id,
        occurredAt: '2026-07-01T08:00:00Z',
        status: EventStatus.needs_review,
      });

      const result = await getAdherence(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-01T23:59:59Z',
      });

      expect(result[0].scheduled).toBe(1);
      expect(result[0].logged).toBe(0);
      expect(result[0].missed).toBe(1);
    });

    it('links one event to the correct occurrence window', async () => {
      const { adminActor, patient, adminUser } = await seed();
      const schedule = await createSchedule(adminActor, {
        name: 'Meds',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260701T000000Z',
        windowMinutes: 120,
      });

      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Early log',
        scheduleId: schedule.id,
        occurredAt: '2026-07-02T07:10:00Z',
      });

      const result = await getAdherence(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-03T23:59:59Z',
      });

      const occurrences = result[0].occurrences;
      expect(occurrences[0].onTime).toBe(false);
      expect(occurrences[1].onTime).toBe(true);
      expect(occurrences[2].onTime).toBe(false);
    });
  });

  describe('mood trends', () => {
    it('aggregates mood scores by day and flags incidents', async () => {
      const { adminActor, patient, adminUser } = await seed();

      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Good mood',
        category: EventCategory.mood_behavior,
        occurredAt: '2026-07-01T10:00:00Z',
        structuredData: { moodScore: 4 },
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Great mood',
        category: EventCategory.mood_behavior,
        occurredAt: '2026-07-01T14:00:00Z',
        structuredData: { moodScore: 5 },
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Pain noted',
        category: EventCategory.mood_behavior,
        occurredAt: '2026-07-02T10:00:00Z',
        structuredData: { moodScore: 2 },
        aiFlags: ['mentions_pain'],
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Fall',
        category: EventCategory.incident,
        occurredAt: '2026-07-02T16:00:00Z',
      });

      const result = await getMoodTrends(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-02T23:59:59Z',
      });

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-07-01');
      expect(result[0].averageMood).toBe(4.5);
      expect(result[0].count).toBe(2);
      expect(result[0].incidents).toBe(0);

      expect(result[1].date).toBe('2026-07-02');
      expect(result[1].averageMood).toBe(2);
      expect(result[1].count).toBe(1);
      expect(result[1].incidents).toBe(1);
      expect(result[1].painFlags).toBe(1);
    });
  });

  describe('meal / hydration summary', () => {
    it('counts meal and hydration events per day', async () => {
      const { adminActor, patient, adminUser } = await seed();

      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Breakfast',
        category: EventCategory.meal,
        occurredAt: '2026-07-01T08:00:00Z',
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Lunch',
        category: EventCategory.meal,
        occurredAt: '2026-07-01T12:00:00Z',
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Water',
        category: EventCategory.hydration,
        occurredAt: '2026-07-01T15:00:00Z',
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Breakfast day 2',
        category: EventCategory.meal,
        occurredAt: '2026-07-02T08:00:00Z',
      });

      const result = await getMealHydrationSummary(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-02T23:59:59Z',
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2026-07-01', meals: 2, hydration: 1 });
      expect(result[1]).toEqual({ date: '2026-07-02', meals: 1, hydration: 0 });
    });
  });

  describe('CSV export', () => {
    it('produces a shaped CSV with patient, adherence, mood, and event sections', async () => {
      const { adminActor, patient, adminUser } = await seed();
      await createSchedule(adminActor, {
        name: 'Meds',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260701T000000Z',
        windowMinutes: 60,
      });
      await makeEvent(patient.id, adminUser.id, {
        rawInput: 'Good mood',
        category: EventCategory.mood_behavior,
        occurredAt: '2026-07-01T10:00:00Z',
        structuredData: { moodScore: 4 },
      });

      const data = await getDoctorVisitExport(adminActor, {
        patientId: patient.id,
        start: '2026-07-01T00:00:00Z',
        end: '2026-07-01T23:59:59Z',
      });
      const csv = exportToCsv(data);

      expect(csv).toContain('CareLog Doctor Visit Report');
      expect(csv).toContain('Mom');
      expect(csv).toContain('Adherence');
      expect(csv).toContain('Mood Trends');
      expect(csv).toContain('Meal / Hydration');
      expect(csv).toContain('Event Log');
      expect(csv).toContain('Good mood');
    });
  });
});
