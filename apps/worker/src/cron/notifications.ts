import { prisma, NotifChannel, NotifDelivery, ScheduleStatus } from '@carelog/db';
import {
  expandSchedule,
  sendPush,
  sendSms,
  PushSubscription,
} from '@carelog/queue';

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
          const existing = await prisma.notification.findFirst({
            where: {
              scheduleId: schedule.id,
              userId: user.id,
              dueAt: occurrence.dueAt,
              channel: NotifChannel.push,
            },
          });
          if (existing) continue;

          const title = `${schedule.name} due`;
          const body = `It's time for ${schedule.name.toLowerCase()}.`;

          const notification = await prisma.notification.create({
            data: {
              scheduleId: schedule.id,
              userId: user.id,
              channel: NotifChannel.push,
              dueAt: occurrence.dueAt,
              title,
              body,
              deliveryStatus: NotifDelivery.logged_only,
              sentAt: now,
            },
          });
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

          // Fallback SMS if user has a phone number.
          if (user.phone) {
            const smsResult = await sendSms(user.phone, body);
            await prisma.notification.create({
              data: {
                scheduleId: schedule.id,
                userId: user.id,
                channel: NotifChannel.sms,
                dueAt: occurrence.dueAt,
                title,
                body,
                deliveryStatus:
                  smsResult.status === 'sent'
                    ? NotifDelivery.sent
                    : smsResult.status === 'failed'
                    ? NotifDelivery.failed
                    : NotifDelivery.logged_only,
                sentAt: now,
              },
            });
            notificationsCreated++;
          }
        }
      }

      // Escalation
      if (schedule.escalation) {
        const escalation = schedule.escalation as {
          afterMinutes: number;
          notify: string[];
          channel?: 'push' | 'sms';
        };
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

          for (const userId of escalation.notify) {
            const existingEscalation = await prisma.notification.findFirst({
              where: {
                scheduleId: schedule.id,
                userId,
                dueAt: occurrence.dueAt,
                escalatedAt: { not: null },
              },
            });
            if (existingEscalation) continue;

            const user = await prisma.user.findUnique({
              where: { id: userId },
              include: { pushSubscriptions: true },
            });
            if (!user) continue;

            const title = `Escalation: ${schedule.name} not logged`;
            const body = `The ${schedule.name.toLowerCase()} scheduled for ${occurrence.dueAt.toLocaleTimeString()} has not been logged.`;
            const channel = escalation.channel === 'sms' ? NotifChannel.sms : NotifChannel.push;

            await prisma.notification.create({
              data: {
                scheduleId: schedule.id,
                userId: user.id,
                channel,
                dueAt: occurrence.dueAt,
                title,
                body,
                deliveryStatus: NotifDelivery.logged_only,
                sentAt: now,
                escalatedAt: now,
              },
            });
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
