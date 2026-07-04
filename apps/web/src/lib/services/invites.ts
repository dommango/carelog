import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/errors';
import { InviteInput } from '@/lib/zod';

export async function listAssignments(actor: Actor, patientId: string) {
  if (!can(actor, 'user:invite', { type: 'user', patientId })) {
    throw new ForbiddenError();
  }

  return prisma.caregiverAssignment.findMany({
    where: { patientId, revokedAt: null },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function inviteUser(actor: Actor, input: InviteInput) {
  if (!can(actor, 'user:invite', { type: 'user', patientId: input.patientId })) {
    throw new ForbiddenError();
  }

  const result = await prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: input.email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email: input.email,
          name: input.email.split('@')[0],
        },
      });
    }

    const assignment = await tx.caregiverAssignment.upsert({
      where: {
        userId_patientId: { userId: user.id, patientId: input.patientId },
      },
      update: { role: input.role, revokedAt: null },
      create: {
        userId: user.id,
        patientId: input.patientId,
        role: input.role,
      },
    });

    return { user, assignment };
  });

  await writeAudit({
    actorType: 'user',
    actorId: actor.userId,
    action: 'user.invite',
    entityType: 'user',
    entityId: result.user.id,
    after: result.assignment as unknown as Record<string, unknown>,
    clientId: input.patientId,
  });

  return result;
}
