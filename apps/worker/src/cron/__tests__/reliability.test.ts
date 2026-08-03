import { describe, it, expect, beforeEach } from 'vitest';
import { prisma, Role, NotifChannel, NotifKind, EventStatus } from '@carelog/db';
import { randomUUID } from 'crypto';
import { runNotificationTick } from '../notifications.js';
import { recordTick, HEARTBEAT_ID } from '../../health/heartbeat.js';

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens", "push_subscriptions",
    "worker_heartbeat"
    RESTART IDENTITY CASCADE;
  `);
}

async function seedCircle() {
  const patient = await prisma.patient.create({ data: { name: 'Mom' } });
  const caregiver = await prisma.user.create({
    data: { email: `cg-${randomUUID()}@test.local`, name: 'Caregiver' },
  });
  await prisma.caregiverAssignment.create({
    data: { userId: caregiver.id, patientId: patient.id, role: Role.caregiver },
  });
  return { patient, caregiver };
}

function dailyAt8(patientId: string, extra: Record<string, unknown> = {}) {
  return prisma.schedule.create({
    data: {
      patientId,
      name: 'Nebulizer',
      rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0;DTSTART=20260705T000000Z',
      windowMinutes: 60,
      remindOffsets: [0],
      ...extra,
    },
  });
}

const AT_8 = new Date('2026-07-05T08:00:00Z');

describe('notification tick reliability', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('does not double-notify when two ticks run concurrently', async () => {
    // The dedupe was a findFirst followed by a create. Two overlapping ticks —
    // a pg-boss retry, or a second worker — could both read "nothing yet"
    // before either wrote. Telling a caregiver the same dose is due twice reads
    // as a second dose.
    const { patient } = await seedCircle();
    const schedule = await dailyAt8(patient.id);

    await Promise.all([runNotificationTick(AT_8), runNotificationTick(AT_8)]);

    const pushRows = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, channel: NotifChannel.push, kind: NotifKind.reminder },
    });
    expect(pushRows).toHaveLength(1);
  });

  it('is idempotent across sequential ticks', async () => {
    const { patient } = await seedCircle();
    const schedule = await dailyAt8(patient.id);

    await runNotificationTick(AT_8);
    await runNotificationTick(AT_8);
    await runNotificationTick(new Date('2026-07-05T08:30:00Z'));

    const rows = await prisma.notification.findMany({ where: { scheduleId: schedule.id } });
    expect(rows).toHaveLength(1);
  });

  it('evaluates each tick at the time it is given', async () => {
    // The frozen-cron regression: the schedule was registered with a
    // `{ now }` payload built once at worker boot, so every subsequent tick
    // re-evaluated that same instant and reminders stopped firing. The payload
    // is gone and the handler reads the current time, so a later tick must be
    // able to see an occurrence an earlier one could not.
    const { patient } = await seedCircle();
    const schedule = await dailyAt8(patient.id);

    const beforeDue = await runNotificationTick(new Date('2026-07-05T06:00:00Z'));
    expect(beforeDue.notificationsCreated).toBe(0);

    const afterDue = await runNotificationTick(AT_8);
    expect(afterDue.notificationsCreated).toBeGreaterThan(0);

    const rows = await prisma.notification.findMany({ where: { scheduleId: schedule.id } });
    expect(rows).toHaveLength(1);
  });

  it('skips escalation targets whose assignment was revoked', async () => {
    const { patient, caregiver } = await seedCircle();

    const removed = await prisma.user.create({
      data: { email: `ex-${randomUUID()}@test.local`, name: 'Former caregiver' },
    });
    await prisma.caregiverAssignment.create({
      data: {
        userId: removed.id,
        patientId: patient.id,
        role: Role.caregiver,
        revokedAt: new Date('2026-07-01T00:00:00Z'),
      },
    });

    const outsider = await prisma.user.create({
      data: { email: `out-${randomUUID()}@test.local`, name: 'Never assigned' },
    });

    const schedule = await dailyAt8(patient.id, {
      escalation: { afterMinutes: 30, notify: [caregiver.id, removed.id, outsider.id] },
    });

    await runNotificationTick(new Date('2026-07-05T09:00:00Z'));

    const escalations = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, kind: NotifKind.escalation },
    });

    // Someone removed from the care team must stop receiving that patient's
    // escalations — a PHI leak as much as a correctness bug.
    expect(escalations.map((row) => row.userId)).toEqual([caregiver.id]);
  });

  it('does not let a malformed escalation config abort the tick', async () => {
    const { patient } = await seedCircle();
    const schedule = await dailyAt8(patient.id, {
      escalation: { notify: ['whoever'] }, // no afterMinutes
    });

    const result = await runNotificationTick(new Date('2026-07-05T09:00:00Z'));

    // Reminders still went out; only the escalation was skipped.
    expect(result.notificationsCreated).toBeGreaterThan(0);
    const escalations = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, kind: NotifKind.escalation },
    });
    expect(escalations).toHaveLength(0);
  });

  it('records an escalation alongside the reminder it follows', async () => {
    const { patient, caregiver } = await seedCircle();
    const schedule = await dailyAt8(patient.id, {
      escalation: { afterMinutes: 30, notify: [caregiver.id] },
    });

    await runNotificationTick(new Date('2026-07-05T09:00:00Z'));

    const rows = await prisma.notification.findMany({
      where: { scheduleId: schedule.id, userId: caregiver.id, dueAt: AT_8 },
    });

    // Both survive: they differ only by `kind`, which is exactly why the dedupe
    // key includes it.
    expect(rows.map((r) => r.kind).sort()).toEqual([NotifKind.escalation, NotifKind.reminder]);
  });
});

describe('worker heartbeat', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates then updates a single row', async () => {
    const first = new Date('2026-07-05T08:00:00Z');
    const second = new Date('2026-07-05T08:01:00Z');

    await recordTick(first);
    await recordTick(second);

    const rows = await prisma.workerHeartbeat.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(HEARTBEAT_ID);
    expect(rows[0]!.tickedAt.toISOString()).toBe(second.toISOString());
  });
});

describe('AI claim', () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedPendingEvent() {
    const { patient, caregiver } = await seedCircle();
    return prisma.careEvent.create({
      data: {
        id: randomUUID(),
        patientId: patient.id,
        authorId: caregiver.id,
        status: EventStatus.pending_ai,
        occurredAt: new Date(),
        capturedAt: new Date(),
        rawInput: 'gave the morning nebulizer',
        clientId: 'web',
        idempotencyKey: randomUUID(),
      },
    });
  }

  // The claim is a conditional update, so it can be exercised directly without
  // standing up the whole AI pipeline.
  function claim(eventId: string, now: Date, ttlMs = 10 * 60_000) {
    return prisma.careEvent.updateMany({
      where: {
        id: eventId,
        status: EventStatus.pending_ai,
        OR: [{ aiClaimedAt: null }, { aiClaimedAt: { lt: new Date(now.getTime() - ttlMs) } }],
      },
      data: { aiClaimedAt: now },
    });
  }

  it('lets exactly one of two concurrent runs claim the event', async () => {
    const event = await seedPendingEvent();
    const now = new Date();

    const [a, b] = await Promise.all([claim(event.id, now), claim(event.id, now)]);

    expect([a.count, b.count].sort()).toEqual([0, 1]);
  });

  it('refuses a second claim while the first is still fresh', async () => {
    const event = await seedPendingEvent();
    const start = new Date('2026-07-05T08:00:00Z');

    expect((await claim(event.id, start)).count).toBe(1);
    // Nine minutes later, inside the ten-minute lease.
    expect((await claim(event.id, new Date('2026-07-05T08:09:00Z'))).count).toBe(0);
  });

  it('reclaims a stale lease so a crashed worker does not strand the event', async () => {
    const event = await seedPendingEvent();
    const start = new Date('2026-07-05T08:00:00Z');

    expect((await claim(event.id, start)).count).toBe(1);
    // Eleven minutes later: the worker holding it is presumed dead.
    expect((await claim(event.id, new Date('2026-07-05T08:11:00Z'))).count).toBe(1);
  });

  it('will not claim an event that is no longer pending', async () => {
    const event = await seedPendingEvent();
    await prisma.careEvent.update({
      where: { id: event.id },
      data: { status: EventStatus.confirmed },
    });

    expect((await claim(event.id, new Date())).count).toBe(0);
  });
});
