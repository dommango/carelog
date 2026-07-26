import { describe, it, expect, beforeEach } from 'vitest';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma } from '@/lib/prisma';
import { createPatient, listPatients } from '@/lib/services/patients';
import { getActor } from '@/lib/policy';
import { Role } from '@carelog/db';
import { ForbiddenError } from '@/lib/errors';

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens", "push_subscriptions"
    RESTART IDENTITY CASCADE;
  `);
}

async function newUser(email = 'new@test.local') {
  return prisma.user.create({ data: { email, name: 'New User' } });
}

describe('patients service', () => {
  beforeEach(async () => {
    await resetDb();
  });

  it('creates a patient and makes the signup its admin', async () => {
    const user = await newUser();

    const patient = await createPatient(user.id, {
      name: 'Mom',
      dateOfBirth: '1948-03-02',
      medicalNotes: 'COPD, albuterol nebulizer twice daily',
    });

    expect(patient.name).toBe('Mom');
    expect(patient.dateOfBirth?.toISOString().slice(0, 10)).toBe('1948-03-02');
    expect(patient.medicalNotes).toBe('COPD, albuterol nebulizer twice daily');

    const assignment = await prisma.caregiverAssignment.findFirst({
      where: { userId: user.id, patientId: patient.id },
    });
    expect(assignment?.role).toBe(Role.admin);
    expect(assignment?.revokedAt).toBeNull();
  });

  it('leaves optional fields null when omitted', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Dad' });

    expect(patient.dateOfBirth).toBeNull();
    expect(patient.medicalNotes).toBeNull();
  });

  it('gives the creator a usable actor that can read the new patient', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Mom' });

    const actor = await getActor(user.id);
    expect(actor?.role).toBe(Role.admin);
    expect(actor?.assignment.patientId).toBe(patient.id);

    const patients = await listPatients(actor!);
    expect(patients.map((p) => p.id)).toEqual([patient.id]);
  });

  it('refuses a second patient for a user who already belongs to a care team', async () => {
    const user = await newUser();
    await createPatient(user.id, { name: 'Mom' });

    await expect(createPatient(user.id, { name: 'Dad' })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await prisma.patient.count()).toBe(1);
  });

  it('allows a user whose only assignment was revoked to create a patient', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Mom' });
    await prisma.caregiverAssignment.updateMany({
      where: { userId: user.id, patientId: patient.id },
      data: { revokedAt: new Date() },
    });

    const second = await createPatient(user.id, { name: 'Dad' });
    expect(second.name).toBe('Dad');
  });

  it('writes an audit row for the creation', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Mom' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'patient.create', entityId: patient.id },
    });
    expect(audit?.actorId).toBe(user.id);
    expect(audit?.entityType).toBe('patient');
  });
});
