import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { createEventSchema, createPatientSchema } from '@/lib/zod';

describe('createEventSchema', () => {
  const base = {
    clientId: 'client-1',
    idempotencyKey: randomUUID(),
    occurredAt: '2026-08-04T09:30:00.000Z',
  };

  const audioAttachment = {
    id: randomUUID(),
    kind: 'audio' as const,
    mimeType: 'audio/webm',
    sizeBytes: 4096,
  };

  it('accepts text with no attachments', () => {
    const parsed = createEventSchema.parse({ ...base, rawInput: 'Gave the nebulizer' });
    expect(parsed.rawInput).toBe('Gave the nebulizer');
    expect(parsed.attachments).toEqual([]);
  });

  // Voice-only and photo-only logging.
  it('accepts an attachment with no text', () => {
    const parsed = createEventSchema.parse({ ...base, attachments: [audioAttachment] });
    expect(parsed.rawInput).toBeUndefined();
    expect(parsed.attachments).toHaveLength(1);
  });

  it('accepts an attachment with empty or whitespace-only text', () => {
    expect(
      createEventSchema.parse({ ...base, rawInput: '', attachments: [audioAttachment] }).rawInput
    ).toBeUndefined();
    expect(
      createEventSchema.parse({ ...base, rawInput: '   ', attachments: [audioAttachment] }).rawInput
    ).toBeUndefined();
  });

  it('rejects an event with neither text nor attachments', () => {
    expect(createEventSchema.safeParse(base).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, rawInput: '' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, rawInput: '  \n ' }).success).toBe(false);
    expect(createEventSchema.safeParse({ ...base, attachments: [] }).success).toBe(false);
  });

  it('reports the empty-event problem against the rawInput field', () => {
    const result = createEventSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.rawInput).toBeDefined();
    }
  });

  it('trims surrounding whitespace off the caregiver text', () => {
    expect(createEventSchema.parse({ ...base, rawInput: '  Lunch eaten  ' }).rawInput).toBe(
      'Lunch eaten'
    );
  });

  it('still caps attachments at five', () => {
    const many = Array.from({ length: 6 }, () => ({ ...audioAttachment, id: randomUUID() }));
    expect(createEventSchema.safeParse({ ...base, attachments: many }).success).toBe(false);
  });
});

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
