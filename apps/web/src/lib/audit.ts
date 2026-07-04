import { prisma } from '@/lib/prisma';
import { Prisma } from '@carelog/db';

export type AuditInput = {
  actorType: 'user' | 'system';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string;
  clientId?: string;
};

export async function writeAudit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? null) as Prisma.InputJsonValue,
      after: (input.after ?? null) as Prisma.InputJsonValue,
      requestId: input.requestId ?? null,
      clientId: input.clientId ?? null,
    },
  });
}
