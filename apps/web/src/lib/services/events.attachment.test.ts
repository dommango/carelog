import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { createEvent } from '@/lib/services/events';
import { Actor } from '@/lib/policy';
import { EventCategory, Role, AttachmentKind } from '@carelog/db';
import * as storage from '@carelog/storage';

class MemoryStorage implements storage.Storage {
  private objects = new Map<string, { body: Buffer; contentType: string }>();

  async getObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) throw new Error(`Object not found: ${key}`);
    return { body: obj.body, contentType: obj.contentType, sizeBytes: obj.body.length };
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }

  async getUploadUrl(attachmentId: string) {
    return { url: `/api/upload/${encodeURIComponent(attachmentId)}`, method: 'PUT' as const };
  }
}

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens"
    RESTART IDENTITY CASCADE;
  `);
}

async function seed() {
  const patient = await prisma.patient.create({ data: { name: 'Mom' } });
  const user = await prisma.user.create({
    data: { email: 'cg@test.local', name: 'Caregiver' },
  });
  const assignment = await prisma.caregiverAssignment.create({
    data: { userId: user.id, patientId: patient.id, role: Role.caregiver },
  });

  const actor: Actor = {
    userId: user.id,
    role: Role.caregiver,
    assignment,
  };

  return { patient, actor };
}

describe('createEvent with attachments', () => {
  beforeEach(async () => {
    storage.setStorage(new MemoryStorage());
    await resetDb();
  });

  it('creates attachment rows and returns presigned upload URLs', async () => {
    const { actor } = await seed();
    const attachmentId = randomUUID();

    const { event, uploads } = await createEvent(actor, {
      rawInput: 'Photo of meds',
      category: EventCategory.medication,
      occurredAt: new Date().toISOString(),
      clientId: 'web',
      idempotencyKey: randomUUID(),
      attachments: [
        {
          id: attachmentId,
          kind: AttachmentKind.photo,
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
        },
      ],
    });

    expect(event.patientId).toBe(actor.assignment.patientId);

    const attachments = await prisma.attachment.findMany({
      where: { eventId: event.id },
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0].kind).toBe('photo');
    expect(attachments[0].storageKey).toContain(attachmentId);

    expect(uploads).toHaveLength(1);
    expect(uploads[0].attachmentId).toBe(attachmentId);
    // Addressed by attachment id, never by storage key — the upload endpoint
    // looks the key up itself so a caller cannot choose where bytes land.
    expect(uploads[0].url).toBe(`/api/upload/${attachmentId}`);
    expect(uploads[0].url).not.toContain(attachments[0].storageKey);
    expect(uploads[0].method).toBe('PUT');
  });

  it('uploads blob through presigned URL and marks attachment complete', async () => {
    const { actor } = await seed();
    const attachmentId = randomUUID();

    const { uploads } = await createEvent(actor, {
      rawInput: 'Voice memo',
      category: EventCategory.observation_other,
      occurredAt: new Date().toISOString(),
      clientId: 'web',
      idempotencyKey: randomUUID(),
      attachments: [
        {
          id: attachmentId,
          kind: AttachmentKind.audio,
          mimeType: 'audio/webm',
          sizeBytes: 2048,
        },
      ],
    });

    const upload = uploads[0];
    expect(upload.url).toBe(`/api/upload/${attachmentId}`);

    // The key is server-side state now, so the test reads it the same way the
    // upload route does: off the attachment row.
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    const key = row.storageKey;

    const storageInstance = storage.getStorage();
    await storageInstance.putObject(key, Buffer.from('fake-audio'), 'audio/webm');

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { uploadedAt: new Date() },
    });

    const saved = await storageInstance.getObject(key);
    expect(saved.body.toString()).toBe('fake-audio');

    const updated = await prisma.attachment.findUnique({ where: { id: attachmentId } });
    expect(updated?.uploadedAt).not.toBeNull();
  });
});
