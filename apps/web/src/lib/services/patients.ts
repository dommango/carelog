import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { ForbiddenError } from '@/lib/errors';

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
