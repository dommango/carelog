import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { CreateTemplateInput } from '@/lib/zod';
import { Prisma } from '@carelog/db';

export async function createTemplate(actor: Actor, input: CreateTemplateInput) {
  if (!can(actor, 'template:create', { type: 'template', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const template = await prisma.$transaction(async (tx) => {
    return tx.template.create({
      data: {
        patientId: actor.assignment.patientId,
        name: input.name,
        category: input.category,
        defaults: input.defaults as Prisma.InputJsonValue,
        createdBy: actor.userId,
      },
    });
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'template.create',
    entityType: 'template',
    entityId: template.id,
    after: template as unknown as Record<string, unknown>,
    clientId: actor.assignment.patientId,
  });

  return template;
}

export async function listTemplates(actor: Actor) {
  if (!can(actor, 'template:read', { type: 'template', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  return prisma.template.findMany({
    where: { patientId: actor.assignment.patientId, isActive: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getTemplate(actor: Actor, id: string) {
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) throw new NotFoundError();

  if (!can(actor, 'template:read', { type: 'template', patientId: template.patientId })) {
    throw new ForbiddenError();
  }

  return template;
}
