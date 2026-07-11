import { prisma } from '@carelog/db';
import { Role, CaregiverAssignment } from '@carelog/db';

export type Actor = {
  userId: string;
  role: Role;
  assignment: CaregiverAssignment;
};

export type Action =
  | 'event:create'
  | 'event:read'
  | 'event:update'
  | 'event:confirm'
  | 'event:delete'
  | 'template:create'
  | 'template:read'
  | 'template:update'
  | 'template:delete'
  | 'schedule:create'
  | 'schedule:read'
  | 'schedule:update'
  | 'schedule:delete'
  | 'patient:read'
  | 'patient:admin'
  | 'user:invite'
  | 'user:revoke'
  | 'report:read'
  | 'audit:read';

export type Resource = {
  type: 'event' | 'template' | 'schedule' | 'patient' | 'user' | 'report' | 'audit';
  patientId: string;
  authorId?: string;
  createdAt?: Date;
};

export function can(actor: Actor | null, action: Action, resource?: Resource): boolean {
  if (!actor) return false;

  const { role } = actor;

  // Global admin can do anything within their assigned patient
  if (role === 'admin') {
    if (!resource) return true;
    return actor.assignment.patientId === resource.patientId;
  }

  if (!resource) return false;
  if (actor.assignment.patientId !== resource.patientId) return false;

  switch (action) {
    case 'event:create':
    case 'event:read':
      return role === 'caregiver';
    case 'event:update':
      if (role !== 'caregiver') return false;
      if (resource.authorId !== actor.userId) return false;
      if (!resource.createdAt) return false;
      // caregivers may edit own events within 24h
      return Date.now() - resource.createdAt.getTime() < 24 * 60 * 60 * 1000;
    case 'event:confirm':
      return role === 'caregiver';
    case 'event:delete':
      return false; // append-only; soft-delete is admin-only via patient:admin
    case 'template:create':
    case 'template:read':
      return role === 'caregiver';
    case 'template:update':
    case 'template:delete':
      return false;
    case 'schedule:create':
    case 'schedule:update':
    case 'schedule:delete':
      return false; // admin handled above
    case 'schedule:read':
      return role === 'caregiver';
    case 'patient:read':
      return true;
    case 'patient:admin':
    case 'user:invite':
    case 'user:revoke':
    case 'audit:read':
      return false;
    case 'report:read':
      return role === 'caregiver' || role === 'viewer';
    default:
      return false;
  }
}

export async function getActorForPatient(
  userId: string | undefined,
  patientId: string
): Promise<Actor | null> {
  if (!userId) return null;
  const assignment = await prisma.caregiverAssignment.findFirst({
    where: { userId, patientId, revokedAt: null },
  });
  if (!assignment) return null;
  return { userId, role: assignment.role, assignment };
}

export async function getDefaultPatientId(): Promise<string | null> {
  const patient = await prisma.patient.findFirst({ orderBy: { createdAt: 'asc' } });
  return patient?.id ?? null;
}

export async function getActor(userId: string | undefined): Promise<Actor | null> {
  if (!userId) return null;
  const assignment = await prisma.caregiverAssignment.findFirst({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!assignment) return null;
  return { userId, role: assignment.role, assignment };
}
