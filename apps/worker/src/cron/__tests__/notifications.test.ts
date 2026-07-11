import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, Role, NotifChannel, NotifDelivery } from '@carelog/db';
import { runNotificationTick } from '../notifications.js';

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
  const adminUser = await prisma.user.create({
    data: { email: 'admin@test.local', name: 'Admin', phone: '+15551234567' },
  });
  const caregiverUser = await prisma.user.create({
    data: { email: 'cg@test.local', name: 'Caregiver' },
  });

  await prisma.caregiverAssignment.create({
    data: { userId: adminUser.id, patientId: patient.id, role: Role.admin },
  });
  await prisma.caregiverAssignment.create({
    data: { userId: caregiverUser.id, patientId: patient.id, role: Role.caregiver },
  });

  return { patient, adminUser, caregiverUser };
}

describe('notification cron', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a notification row with logged_only when Twilio env unset', async () => {
    const { patient, caregiverUser } = await seed();
    const schedule = await prisma.schedule.create({
      data: {
        patientId: patient.id,
        name: 'Nebulizer',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260705T000000Z',
        windowMinutes: 60,
        remindOffsets: [0],
      },
    });

    const now = new Date('2026-07-05T08:00:00Z');
    const result = await runNotificationTick(now);

    expect(result.notificationsCreated).toBeGreaterThan(0);

    const notifications = await prisma.notification.findMany({
      where: { scheduleId: schedule.id },
    });
    expect(notifications.length).toBeGreaterThan(0);

    const pushNotification = notifications.find((n) => n.channel === NotifChannel.push);
    expect(pushNotification).toBeDefined();
    expect(pushNotification?.deliveryStatus).toBe(NotifDelivery.logged_only);
  });

  it('does not duplicate notifications for the same occurrence', async () => {
    const { patient } = await seed();
    await prisma.schedule.create({
      data: {
        patientId: patient.id,
        name: 'Nebulizer',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260705T000000Z',
        windowMinutes: 60,
        remindOffsets: [0],
      },
    });

    const now = new Date('2026-07-05T08:00:00Z');
    await runNotificationTick(now);
    const result2 = await runNotificationTick(now);

    expect(result2.notificationsCreated).toBe(0);
  });

  it('skips acknowledged occurrences', async () => {
    const { patient, caregiverUser } = await seed();
    const schedule = await prisma.schedule.create({
      data: {
        patientId: patient.id,
        name: 'Nebulizer',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260705T000000Z',
        windowMinutes: 60,
        remindOffsets: [0],
      },
    });

    await prisma.careEvent.create({
      data: {
        id: 'event-1',
        patientId: patient.id,
        authorId: caregiverUser.id,
        status: 'confirmed',
        occurredAt: new Date('2026-07-05T08:00:00Z'),
        capturedAt: new Date(),
        scheduleId: schedule.id,
        clientId: 'test',
        idempotencyKey: 'key-1',
      },
    });

    const now = new Date('2026-07-05T08:00:00Z');
    const result = await runNotificationTick(now);
    expect(result.notificationsCreated).toBe(0);
  });

  it('sends escalation for unacknowledged occurrences past threshold', async () => {
    const { patient, adminUser } = await seed();
    const schedule = await prisma.schedule.create({
      data: {
        patientId: patient.id,
        name: 'Nebulizer',
        rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260705T000000Z',
        windowMinutes: 60,
        remindOffsets: [0],
        escalation: {
          afterMinutes: 60,
          notify: [adminUser.id],
          channel: 'sms',
        },
      },
    });

    const now = new Date('2026-07-05T09:30:00Z');
    const result = await runNotificationTick(now);

    expect(result.escalationsCreated).toBeGreaterThan(0);

    const escalation = await prisma.notification.findFirst({
      where: { scheduleId: schedule.id, escalatedAt: { not: null } },
    });
    expect(escalation).toBeDefined();
    expect(escalation?.channel).toBe(NotifChannel.sms);
  });
});
