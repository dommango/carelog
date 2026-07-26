import { Role } from '@carelog/db';
import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
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
  return prisma.$transaction(async (tx) => {
    // Serialize concurrent onboarding for this user. Two parallel requests
    // would otherwise both read zero assignments under READ COMMITTED and
    // each create its own patient — and the (userId, patientId) unique
    // constraint can't catch that, because the patient ids differ.
    await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

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

    await tx.caregiverAssignment.create({
      data: { userId, patientId: patient.id, role: Role.admin },
    });

    // Audited inside the transaction: an audit failure must not leave a
    // committed patient behind that the caller was told didn't happen.
    // `medicalNotes` is deliberately excluded — audit_log is append-only,
    // so PHI written here could never be scrubbed.
    await tx.auditLog.create({
      data: {
        actorType: 'user',
        actorId: userId,
        action: 'patient.create',
        entityType: 'patient',
        entityId: patient.id,
        after: {
          id: patient.id,
          name: patient.name,
          dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
          hasMedicalNotes: Boolean(patient.medicalNotes),
        },
      },
    });

    return patient;
  });
}
