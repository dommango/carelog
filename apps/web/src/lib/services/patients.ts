import { Role } from '@carelog/db';
import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { writeAudit } from '@/lib/audit';
import { ForbiddenError } from '@/lib/errors';
import { CreatePatientInput } from '@/lib/zod';

export async function getPatient(actor: Actor, id: string) {
  if (!can(actor, 'patient:read', { type: 'patient', patientId: id })) {
    throw new ForbiddenError();
  }

  return prisma.patient.findUnique({ where: { id } });
}

export async function listPatients(actor: Actor) {
  const patient = await prisma.patient.findUnique({
    where: { id: actor.assignment.patientId },
  });

  if (!patient) return [];
  if (!can(actor, 'patient:read', { type: 'patient', patientId: patient.id })) {
    throw new ForbiddenError();
  }

  return [patient];
}

/**
 * Onboarding path for a freshly signed-up user: there is no Actor yet, so
 * authorization is "the caller has no active assignment" rather than `can()`.
 * The creator becomes the patient's admin.
 */
export async function createPatient(userId: string, input: CreatePatientInput) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.caregiverAssignment.findFirst({
      where: { userId, revokedAt: null },
    });
    if (existing) {
      throw new ForbiddenError('You already belong to a care team');
    }

    const patient = await tx.patient.create({
      data: {
        name: input.name,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        medicalNotes: input.medicalNotes || null,
      },
    });

    const assignment = await tx.caregiverAssignment.create({
      data: { userId, patientId: patient.id, role: Role.admin },
    });

    return { patient, assignment };
  });

  await writeAudit({
    actorType: 'user',
    actorId: userId,
    action: 'patient.create',
    entityType: 'patient',
    entityId: result.patient.id,
    after: result.patient as unknown as Record<string, unknown>,
    clientId: result.patient.id,
  });

  return result.patient;
}
