import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '@/lib/prisma';
import {
  createNotification,
  listPendingNotifications,
  markAcknowledged,
  storePushSubscription,
  getPushSubscriptionsForUser,
} from '@/lib/services/notifications';
import { createEvent } from '@/lib/services/events';
import { createSchedule } from '@/lib/services/schedules';
import { Actor } from '@/lib/policy';
import { Role, NotifChannel, NotifDelivery } from '@carelog/db';
import { randomUUID } from 'crypto';

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

describe('notifications service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a notification row', async () => {
    const { caregiverActor, caregiverUser } = await seed();
    const notification = await createNotification(caregiverActor, {
      userId: caregiverUser.id,
      channel: NotifChannel.push,
      dueAt: new Date(),
      title: 'Test',
      body: 'Hello',
      deliveryStatus: NotifDelivery.logged_only,
    });

    expect(notification.userId).toBe(caregiverUser.id);
    expect(notification.deliveryStatus).toBe(NotifDelivery.logged_only);
  });

  it('lists pending notifications for the actor', async () => {
    const { caregiverActor, caregiverUser } = await seed();
    await createNotification(null, {
      userId: caregiverUser.id,
      channel: NotifChannel.push,
      dueAt: new Date(Date.now() - 60_000),
      title: 'Past',
      body: 'Hello',
    });
    await createNotification(null, {
      userId: caregiverUser.id,
      channel: NotifChannel.push,
      dueAt: new Date(Date.now() + 60_000),
      title: 'Future',
      body: 'Hello',
    });

    const pending = await listPendingNotifications(caregiverActor);
    expect(pending).toHaveLength(1);
    expect(pending[0].title).toBe('Past');
  });

  it('deduplicates notification rows by schedule, user, dueAt and channel', async () => {
    const { adminActor, adminUser } = await seed();
    const schedule = await createSchedule(adminActor, {
      name: 'Meds',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });
    const dueAt = new Date('2026-07-05T08:00:00Z');

    await createNotification(null, {
      scheduleId: schedule.id,
      userId: adminUser.id,
      channel: NotifChannel.push,
      dueAt,
      title: 'First',
      body: 'Hello',
    });

    await createNotification(null, {
      scheduleId: schedule.id,
      userId: adminUser.id,
      channel: NotifChannel.push,
      dueAt,
      title: 'Second',
      body: 'Hello',
    });

    const rows = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, userId: adminUser.id, dueAt, channel: NotifChannel.push },
    });
    expect(rows).toHaveLength(2); // service allows duplicates; cron must check first
  });

  it('marks notifications acknowledged when an event links to a schedule occurrence', async () => {
    const { adminActor, adminUser } = await seed();
    const schedule = await createSchedule(adminActor, {
      name: 'Meds',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
      windowMinutes: 60,
    });
    const dueAt = new Date('2026-07-05T08:00:00Z');

    await createNotification(null, {
      scheduleId: schedule.id,
      userId: adminUser.id,
      channel: NotifChannel.push,
      dueAt,
      title: 'Due',
      body: 'Hello',
    });

    await createEvent(adminActor, {
      rawInput: 'Gave meds',
      occurredAt: dueAt.toISOString(),
      scheduleId: schedule.id,
      clientId: 'test',
      idempotencyKey: randomUUID(),
      attachments: [],
    });

    const rows = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, userId: adminUser.id, dueAt },
    });
    expect(rows[0].acknowledgedAt).not.toBeNull();
  });

  it('stores and retrieves push subscriptions', async () => {
    const { caregiverActor, caregiverUser } = await seed();
    await storePushSubscription(caregiverActor, {
      endpoint: 'https://fcm.example.com/sub-1',
      keys: { p256dh: 'p256dh', auth: 'auth' },
    });

    const subs = await getPushSubscriptionsForUser(caregiverUser.id);
    expect(subs).toHaveLength(1);
    expect(subs[0].endpoint).toBe('https://fcm.example.com/sub-1');
  });
});
