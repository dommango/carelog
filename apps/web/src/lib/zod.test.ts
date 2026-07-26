import { describe, it, expect } from 'vitest';
import { createPatientSchema } from '@/lib/zod';

describe('createPatientSchema', () => {
  it('accepts a name on its own', () => {
    const parsed = createPatientSchema.parse({ name: 'Mom' });
    expect(parsed).toEqual({ name: 'Mom' });
  });

  it('trims the name before length checks', () => {
    expect(createPatientSchema.parse({ name: '  Mom  ' }).name).toBe('Mom');
    expect(createPatientSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an empty or over-long name', () => {
    expect(createPatientSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createPatientSchema.safeParse({ name: 'a'.repeat(121) }).success).toBe(false);
    expect(createPatientSchema.safeParse({ name: 'a'.repeat(120) }).success).toBe(true);
  });

  it('rejects a malformed date of birth', () => {
    expect(createPatientSchema.safeParse({ name: 'Mom', dateOfBirth: '02-03-1948' }).success).toBe(
      false
    );
    expect(createPatientSchema.safeParse({ name: 'Mom', dateOfBirth: 'yesterday' }).success).toBe(
      false
    );
  });

  it('rejects a date of birth in the future or before 1900', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(createPatientSchema.safeParse({ name: 'Mom', dateOfBirth: future }).success).toBe(false);
    expect(createPatientSchema.safeParse({ name: 'Mom', dateOfBirth: '1899-12-31' }).success).toBe(
      false
    );
    expect(createPatientSchema.safeParse({ name: 'Mom', dateOfBirth: '1948-03-02' }).success).toBe(
      true
    );
  });

  it('rejects medical notes over the length cap', () => {
    expect(
      createPatientSchema.safeParse({ name: 'Mom', medicalNotes: 'x'.repeat(2001) }).success
    ).toBe(false);
  });

  // The onboarding authorization argument depends on this: a caller must not
  // be able to smuggle in a patientId, id or role via the request body.
  it('strips unknown keys', () => {
    const parsed = createPatientSchema.parse({
      name: 'Mom',
      id: 'attacker-supplied',
      patientId: 'someone-elses-patient',
      role: 'admin',
    });
    expect(parsed).toEqual({ name: 'Mom' });
  });
});
