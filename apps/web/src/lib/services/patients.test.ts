import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect, beforeEach } from 'vitest';

import { prisma } from '@/lib/prisma';
import { createPatient, listPatients } from '@/lib/services/patients';
import { listTemplates } from '@/lib/services/templates';
import { STARTER_TEMPLATES } from '@/lib/starter-templates';
import { getActor } from '@/lib/policy';
import { Role } from '@carelog/db';
import { ForbiddenError } from '@/lib/errors';

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

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

  it('creates only one care circle when two requests race', async () => {
    const user = await newUser();

    const results = await Promise.allSettled([
      createPatient(user.id, { name: 'Mom' }),
      createPatient(user.id, { name: 'Dad' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.patient.count()).toBe(1);
    expect(
      await prisma.caregiverAssignment.count({ where: { userId: user.id, revokedAt: null } })
    ).toBe(1);
    // The losing transaction must not leave its templates behind either.
    expect(await prisma.template.count()).toBe(STARTER_TEMPLATES.length);
  });

  it('seeds the starter templates for the new care circle', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Mom' });

    const templates = await prisma.template.findMany({ where: { patientId: patient.id } });

    expect(templates).toHaveLength(STARTER_TEMPLATES.length);
    expect(templates.every((t) => t.createdBy === user.id)).toBe(true);
    expect(templates.every((t) => t.isActive)).toBe(true);
    expect(templates.map((t) => ({ name: t.name, category: t.category })).sort(byName)).toEqual(
      STARTER_TEMPLATES.map((t) => ({ name: t.name, category: t.category })).sort(byName)
    );
  });

  it('seeds no clinical values into the starter templates', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, { name: 'Mom' });

    const templates = await prisma.template.findMany({ where: { patientId: patient.id } });
    for (const template of templates) {
      expect(template.defaults).toEqual({});
    }
  });

  it('exposes the seeded templates to the founding admin', async () => {
    const user = await newUser();
    await createPatient(user.id, { name: 'Mom' });

    const actor = await getActor(user.id);
    const templates = await listTemplates(actor!);

    // Proves they will reach the client through the delta-sync pull that feeds
    // the Quick log chips.
    expect(templates).toHaveLength(STARTER_TEMPLATES.length);
  });

  it('writes an audit row for the creation without copying PHI into it', async () => {
    const user = await newUser();
    const patient = await createPatient(user.id, {
      name: 'Mom',
      medicalNotes: 'COPD, penicillin allergy',
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'patient.create', entityId: patient.id },
    });
    expect(audit?.actorId).toBe(user.id);
    expect(audit?.entityType).toBe('patient');
    expect(JSON.stringify(audit?.after)).not.toContain('penicillin');
    expect((audit?.after as Record<string, unknown>).hasMedicalNotes).toBe(true);
    expect((audit?.after as Record<string, unknown>).starterTemplateCount).toBe(
      STARTER_TEMPLATES.length
    );
  });

  it('rolls the patient back if the audit write fails', async () => {
    const user = await newUser();
    // Force the audit insert to fail, then assert the patient it was meant to
    // describe never survives on its own.
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "audit_log" ADD CONSTRAINT audit_log_no_patient_create CHECK (action <> 'patient.create')`
    );

    try {
      await expect(createPatient(user.id, { name: 'Mom' })).rejects.toThrow();
      expect(await prisma.patient.count()).toBe(0);
      expect(await prisma.caregiverAssignment.count()).toBe(0);
      // Proves the seeding is genuinely inside the transaction, not merely
      // adjacent to it.
      expect(await prisma.template.count()).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "audit_log" DROP CONSTRAINT audit_log_no_patient_create`
      );
    }
  });
});
