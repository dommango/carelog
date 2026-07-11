import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { NotifChannel, NotifDelivery } from '@carelog/db';

export type CreateNotificationInput = {
  scheduleId?: string;
  userId: string;
  channel: NotifChannel;
  dueAt: Date;
  title: string;
  body: string;
  deliveryStatus?: NotifDelivery;
};

export async function createNotification(actor: Actor | null, input: CreateNotificationInput) {
  if (actor && !can(actor, 'schedule:read', { type: 'schedule', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const notification = await prisma.notification.create({
    data: {
      scheduleId: input.scheduleId ?? null,
      userId: input.userId,
      channel: input.channel,
      dueAt: input.dueAt,
      title: input.title,
      body: input.body,
      deliveryStatus: input.deliveryStatus ?? NotifDelivery.logged_only,
      sentAt: new Date(),
    },
  });

  await writeAudit({
    actorType: 'system',
    actorId: 'notification-service',
    action: 'notification.create',
    entityType: 'notification',
    entityId: notification.id,
    after: notification as unknown as Record<string, unknown>,
  });

  return notification;
}

export async function listPendingNotifications(actor: Actor) {
  if (!can(actor, 'schedule:read', { type: 'schedule', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  return prisma.notification.findMany({
    where: {
      userId: actor.userId,
      acknowledgedAt: null,
      dueAt: { lte: new Date() },
    },
    orderBy: { dueAt: 'asc' },
  });
}

export async function markAcknowledged(
  eventId: string,
  scheduleId: string,
  dueAt: Date
): Promise<number> {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return 0;

  const windowHalf = Math.floor(schedule.windowMinutes / 2);
  const windowStart = new Date(dueAt.getTime() - windowHalf * 60_000);
  const windowEnd = new Date(dueAt.getTime() + windowHalf * 60_000);

  const result = await prisma.notification.updateMany({
    where: {
      scheduleId,
      dueAt: { gte: windowStart, lte: windowEnd },
      acknowledgedAt: null,
    },
    data: {
      acknowledgedAt: new Date(),
    },
  });

  if (result.count > 0) {
    await writeAudit({
      actorType: 'system',
      actorId: 'notification-service',
      action: 'notification.acknowledge',
      entityType: 'notification',
      entityId: eventId,
      after: { scheduleId, dueAt: dueAt.toISOString(), acknowledgedAt: new Date().toISOString() },
    });
  }

  return result.count;
}

export async function storePushSubscription(actor: Actor, subscription: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  if (!can(actor, 'schedule:read', { type: 'schedule', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId: actor.userId,
    },
    create: {
      userId: actor.userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function getPushSubscriptionsForUser(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

export async function getUserPhone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  return user?.phone ?? null;
}

export async function findNotificationForOccurrence(
  scheduleId: string,
  dueAt: Date,
  channel: NotifChannel
) {
  return prisma.notification.findFirst({
    where: { scheduleId, dueAt, channel },
  });
}

export async function getActiveSchedules() {
  return prisma.schedule.findMany({
    where: { status: 'active', deletedAt: null },
    include: { patient: { include: { assignments: { where: { revokedAt: null }, include: { user: true } } } } },
  });
}
