import { prisma, NotifChannel, NotifDelivery, NotifKind, ScheduleStatus, Prisma } from '@carelog/db';
import {
  expandSchedule,
  sendPush,
  sendSms,
  PushSubscription,
} from '@carelog/queue';
import { parseEscalation } from './escalation.js';

/**
 * Create a notification unless an identical one already exists.
 *
 * The dedupe used to be a findFirst followed by a create, which two overlapping
 * ticks — a pg-boss retry, or a second worker — could both pass before either
 * wrote, double-notifying. The unique index on
 * (scheduleId, userId, dueAt, channel, kind) decides it now; P2002 means
 * somebody else got there first, which is success, not failure.
 */
async function createNotificationOnce(
  data: Prisma.NotificationUncheckedCreateInput
): Promise<{ id: string } | null> {
  try {
    return await prisma.notification.create({ data, select: { id: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return null;
    }
    throw error;
  }
}

const HORIZON_MINUTES = 4 * 60; // evaluate 4 hours ahead
const LOOKBACK_MINUTES = 2 * 60;

export async function runNotificationTick(now: Date = new Date()): Promise<{
  notificationsCreated: number;
  escalationsCreated: number;
}> {
  const schedules = await prisma.schedule.findMany({
    where: {
      status: ScheduleStatus.active,
      deletedAt: null,
    },
    include: {
      patient: {
        include: {
          assignments: {
            where: { revokedAt: null },
            include: { user: { include: { pushSubscriptions: true } } },
          },
        },
      },
    },
  });

  let notificationsCreated = 0;
  let escalationsCreated = 0;

  for (const schedule of schedules) {
    const caregivers = schedule.patient.assignments.map((a) => a.user);
    const maxOffset = Math.max(0, ...schedule.remindOffsets);
    const start = new Date(now.getTime() - (maxOffset + LOOKBACK_MINUTES) * 60_000);
    const end = new Date(now.getTime() + HORIZON_MINUTES * 60_000);

    const occurrences = expandSchedule(schedule, start, end);

    for (const occurrence of occurrences) {
      for (const offset of schedule.remindOffsets) {
        const remindAt = new Date(occurrence.dueAt.getTime() - offset * 60_000);
        if (remindAt > now) continue;

        // Skip if already acknowledged by a linked event.
        const acknowledged = await isAcknowledged(schedule.id, occurrence.dueAt, schedule.windowMinutes);
        if (acknowledged) continue;

        for (const user of caregivers) {
          const title = `${schedule.name} due`;
          const body = `It's time for ${schedule.name.toLowerCase()}.`;

          const notification = await createNotificationOnce({
            scheduleId: schedule.id,
            userId: user.id,
            channel: NotifChannel.push,
            kind: NotifKind.reminder,
            dueAt: occurrence.dueAt,
            title,
            body,
            deliveryStatus: NotifDelivery.logged_only,
            sentAt: now,
          });
          if (!notification) continue;
          notificationsCreated++;

          for (const sub of user.pushSubscriptions) {
            const result = await sendPush(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              } as PushSubscription,
              { title, body }
            );

            if (result.status === 'sent') {
              await prisma.notification.update({
                where: { id: notification.id },
                data: { deliveryStatus: NotifDelivery.sent },
              });
            } else if (result.status === 'failed') {
              await prisma.notification.update({
                where: { id: notification.id },
                data: { deliveryStatus: NotifDelivery.failed },
              });
            }
            // logged_only stays as created.
          }

          // Fallback SMS if user has a phone number. Claimed before sending, so
          // a concurrent tick cannot also send it — an SMS is not retractable.
          if (user.phone) {
            const smsRow = await createNotificationOnce({
              scheduleId: schedule.id,
              userId: user.id,
              channel: NotifChannel.sms,
              kind: NotifKind.reminder,
              dueAt: occurrence.dueAt,
              title,
              body,
              deliveryStatus: NotifDelivery.logged_only,
              sentAt: now,
            });

            if (smsRow) {
              notificationsCreated++;
              const smsResult = await sendSms(user.phone, body);
              if (smsResult.status !== 'logged_only') {
                await prisma.notification.update({
                  where: { id: smsRow.id },
                  data: {
                    deliveryStatus:
                      smsResult.status === 'sent' ? NotifDelivery.sent : NotifDelivery.failed,
                  },
                });
              }
            }
          }
        }
      }

      // Escalation
      const escalation = parseEscalation(schedule.escalation, schedule.id);
      if (escalation) {
        const escalateAt = new Date(
          occurrence.dueAt.getTime() + escalation.afterMinutes * 60_000
        );
        if (now >= escalateAt) {
          const acknowledged = await isAcknowledged(
            schedule.id,
            occurrence.dueAt,
            schedule.windowMinutes
          );
          if (acknowledged) continue;

          // Only people still on this patient's care team. `notify` is a bare
          // list of user ids on the schedule, so a caregiver whose assignment
          // was revoked — or who was never on this patient at all — would
          // otherwise keep receiving that patient's escalations, which is a
          // PHI leak as much as a correctness bug.
          const eligible = await prisma.caregiverAssignment.findMany({
            where: {
              patientId: schedule.patientId,
              userId: { in: escalation.notify },
              revokedAt: null,
            },
            select: { userId: true },
          });
          const eligibleIds = new Set(eligible.map((a) => a.userId));

          for (const userId of escalation.notify) {
            if (!eligibleIds.has(userId)) {
              console.warn(
                `[worker] Schedule ${schedule.id} escalates to user ${userId}, who has no active assignment to this patient; skipping`
              );
              continue;
            }

            const user = await prisma.user.findUnique({
              where: { id: userId },
              include: { pushSubscriptions: true },
            });
            if (!user) continue;

            const title = `Escalation: ${schedule.name} not logged`;
            const body = `The ${schedule.name.toLowerCase()} scheduled for ${occurrence.dueAt.toLocaleTimeString()} has not been logged.`;
            const channel = escalation.channel === 'sms' ? NotifChannel.sms : NotifChannel.push;

            const escalationRow = await createNotificationOnce({
              scheduleId: schedule.id,
              userId: user.id,
              channel,
              kind: NotifKind.escalation,
              dueAt: occurrence.dueAt,
              title,
              body,
              deliveryStatus: NotifDelivery.logged_only,
              sentAt: now,
              escalatedAt: now,
            });
            if (!escalationRow) continue;
            escalationsCreated++;

            if (channel === NotifChannel.push) {
              for (const sub of user.pushSubscriptions) {
                await sendPush(
                  {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dh, auth: sub.auth },
                  } as PushSubscription,
                  { title, body }
                );
              }
            } else if (channel === NotifChannel.sms && user.phone) {
              await sendSms(user.phone, body);
            }
          }
        }
      }
    }
  }

  return { notificationsCreated, escalationsCreated };
}

async function isAcknowledged(
  scheduleId: string,
  dueAt: Date,
  windowMinutes: number
): Promise<boolean> {
  const halfWindow = Math.floor(windowMinutes / 2);
  const windowStart = new Date(dueAt.getTime() - halfWindow * 60_000);
  const windowEnd = new Date(dueAt.getTime() + halfWindow * 60_000);

  const event = await prisma.careEvent.findFirst({
    where: {
      scheduleId,
      occurredAt: { gte: windowStart, lte: windowEnd },
      deletedAt: null,
    },
  });

  return Boolean(event);
}
