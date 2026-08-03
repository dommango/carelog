import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { EventStatus, AttachmentKind, Role } from '@carelog/db';
import * as storage from '@carelog/storage';

// The route resolves the signed-in user through auth(); everything downstream
// (policy, prisma, storage) is exercised for real.
const currentUserId = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('@/auth', () => ({
  auth: async () => (currentUserId.value ? { user: { id: currentUserId.value } } : null),
}));

const { PUT } = await import('./route');

class MemoryStorage implements storage.Storage {
  public objects = new Map<string, { body: Buffer; contentType: string }>();

  async getObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) throw new Error(`Object not found: ${key}`);
    return { body: obj.body, contentType: obj.contentType, sizeBytes: obj.body.length };
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType });
  }

  async getUploadUrl(attachmentId: string) {
    return { url: `/api/upload/${attachmentId}`, method: 'PUT' as const };
  }
}

let store: MemoryStorage;

async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "audit_log", "care_events", "templates", "schedules",
    "notifications", "attachments", "caregiver_assignments", "patients",
    "users", "sessions", "accounts", "verificationtokens"
    RESTART IDENTITY CASCADE;
  `);
}

/** One patient, one caregiver assigned to them, one photo attachment. */
async function seedCircle(label: string) {
  const patient = await prisma.patient.create({ data: { name: `Patient ${label}` } });
  const user = await prisma.user.create({
    data: { email: `${label}-${randomUUID()}@test.local`, name: `Caregiver ${label}` },
  });
  await prisma.caregiverAssignment.create({
    data: { userId: user.id, patientId: patient.id, role: Role.caregiver },
  });

  const event = await prisma.careEvent.create({
    data: {
      id: randomUUID(),
      patientId: patient.id,
      authorId: user.id,
      status: EventStatus.pending_ai,
      occurredAt: new Date(),
      capturedAt: new Date(),
      rawInput: 'photo of meds',
      clientId: 'web',
      idempotencyKey: randomUUID(),
    },
  });

  const attachmentId = randomUUID();
  const storageKey = `attachments/${event.id}/${attachmentId}`;
  await prisma.attachment.create({
    data: {
      id: attachmentId,
      eventId: event.id,
      kind: AttachmentKind.photo,
      storageKey,
      mimeType: 'image/jpeg',
    },
  });

  return { user, patient, attachmentId, storageKey };
}

function put(
  attachmentId: string,
  body: Buffer,
  headers: Record<string, string> = { 'content-type': 'image/jpeg' }
) {
  const request = new NextRequest(`http://localhost/api/upload/${attachmentId}`, {
    method: 'PUT',
    headers,
    body: new Uint8Array(body),
    duplex: 'half',
  });
  return PUT(request, { params: Promise.resolve({ id: attachmentId }) });
}

describe('PUT /api/upload/[id]', () => {
  beforeEach(async () => {
    store = new MemoryStorage();
    storage.setStorage(store);
    currentUserId.value = null;
    await resetDb();
  });

  it('stores bytes at the key held on the attachment row', async () => {
    const { user, attachmentId, storageKey } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('image-bytes'));

    expect(res.status).toBe(204);
    expect(store.objects.get(storageKey)?.body.toString()).toBe('image-bytes');
    // Exactly one object, at exactly the server-chosen key.
    expect([...store.objects.keys()]).toEqual([storageKey]);
  });

  it('refuses an unauthenticated caller', async () => {
    const { attachmentId } = await seedCircle('a');
    const res = await put(attachmentId, Buffer.from('x'));
    expect(res.status).toBe(401);
    expect(store.objects.size).toBe(0);
  });

  it("refuses a caregiver writing to another patient's attachment", async () => {
    const a = await seedCircle('a');
    const b = await seedCircle('b');

    // Caregiver A, authenticated, aiming at patient B's attachment.
    currentUserId.value = a.user.id;
    const res = await put(b.attachmentId, Buffer.from('cross-tenant'));

    expect(res.status).toBe(403);
    expect(store.objects.size).toBe(0);
  });

  it('404s an unknown attachment id rather than writing anything', async () => {
    const { user } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(randomUUID(), Buffer.from('x'));

    expect(res.status).toBe(404);
    expect(store.objects.size).toBe(0);
  });

  it('rejects a disallowed content type', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    for (const contentType of ['image/svg+xml', 'text/html', 'application/octet-stream']) {
      const res = await put(attachmentId, Buffer.from('<svg/>'), { 'content-type': contentType });
      expect(res.status, contentType).toBe(415);
    }
    expect(store.objects.size).toBe(0);
  });

  it('rejects an audio type on a photo attachment', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('x'), { 'content-type': 'audio/webm' });

    expect(res.status).toBe(415);
    expect(store.objects.size).toBe(0);
  });

  it('accepts a content-type carrying parameters', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('x'), {
      'content-type': 'image/jpeg; charset=binary',
    });

    expect(res.status).toBe(204);
  });

  it('rejects an oversized body even when Content-Length understates it', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const tooBig = Buffer.alloc(25 * 1024 * 1024 + 1, 0x41);
    const res = await put(attachmentId, tooBig, {
      'content-type': 'image/jpeg',
      'content-length': '10',
    });

    expect(res.status).toBe(413);
    expect(store.objects.size).toBe(0);
  });
});
