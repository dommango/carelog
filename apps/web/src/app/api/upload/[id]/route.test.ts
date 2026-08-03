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

/** One patient, one assigned user, one photo attachment. */
async function seedCircle(label: string, role: Role = Role.caregiver) {
  const patient = await prisma.patient.create({ data: { name: `Patient ${label}` } });
  const user = await prisma.user.create({
    data: { email: `${label}-${randomUUID()}@test.local`, name: `User ${label}` },
  });
  await prisma.caregiverAssignment.create({
    data: { userId: user.id, patientId: patient.id, role },
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

  it('stops pulling an oversized stream instead of draining it', async () => {
    // The point of the streaming read, and the part a status-code assertion
    // cannot see: `arrayBuffer()` would happily pull all 200MB before any size
    // check ran. Here the body is a stream that counts what was taken from it.
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const CHUNK = 1024 * 1024;
    const TOTAL_CHUNKS = 200;
    let chunksPulled = 0;

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunksPulled >= TOTAL_CHUNKS) {
          controller.close();
          return;
        }
        chunksPulled += 1;
        controller.enqueue(new Uint8Array(CHUNK));
      },
    });

    const request = new NextRequest(`http://localhost/api/upload/${attachmentId}`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg' },
      body,
      duplex: 'half',
    });
    const res = await PUT(request, { params: Promise.resolve({ id: attachmentId }) });

    expect(res.status).toBe(413);
    expect(store.objects.size).toBe(0);
    // Cancelled a hair past the 25MB cap rather than reading all 200MB.
    expect(chunksPulled).toBeLessThan(30);
    expect(chunksPulled).toBeGreaterThanOrEqual(25);
  });

  it('rejects an empty body rather than storing zero bytes', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.alloc(0));

    expect(res.status).toBe(400);
    expect(store.objects.size).toBe(0);
  });
});

describe('PUT /api/upload/[id] authorization', () => {
  beforeEach(async () => {
    store = new MemoryStorage();
    storage.setStorage(store);
    currentUserId.value = null;
    await resetDb();
  });

  it('refuses a viewer, who is read-only, in their own circle', async () => {
    // A viewer passes the patient-scope check — the attachment really is in
    // their circle — so scope alone is not authorization.
    const { user, attachmentId } = await seedCircle('v', Role.viewer);
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('overwritten'));

    expect(res.status).toBe(403);
    expect(store.objects.size).toBe(0);
  });

  it('allows an admin', async () => {
    const { user, attachmentId } = await seedCircle('adm', Role.admin);
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('bytes'));

    expect(res.status).toBe(204);
  });

  it('resolves the actor for the attachment’s patient, not an arbitrary one', async () => {
    // A caregiver in two circles must be judged by the assignment that matches
    // the attachment. Picking "the oldest assignment" would 403 this.
    const a = await seedCircle('a');
    const b = await seedCircle('b');
    await prisma.caregiverAssignment.create({
      data: { userId: a.user.id, patientId: b.patient.id, role: Role.caregiver },
    });

    currentUserId.value = a.user.id;
    const res = await put(b.attachmentId, Buffer.from('second-circle'));

    expect(res.status).toBe(204);
    expect(store.objects.get(b.storageKey)?.body.toString()).toBe('second-circle');
  });

  it('will not overwrite bytes once the attachment is uploaded', async () => {
    const { user, attachmentId, storageKey } = await seedCircle('a');
    currentUserId.value = user.id;

    expect((await put(attachmentId, Buffer.from('original'))).status).toBe(204);

    // Reports success so the offline outbox's at-least-once retries settle,
    // but the stored bytes are unchanged.
    const res = await put(attachmentId, Buffer.from('tampered'));

    expect(res.status).toBe(204);
    expect(store.objects.get(storageKey)?.body.toString()).toBe('original');
  });

  it('stamps uploadedAt only after the object is stored', async () => {
    // The stamp is the record that bytes exist. If anything else could set it,
    // write-once would start refusing the upload that was supposed to create
    // them — see the test below.
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const before = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(before.uploadedAt).toBeNull();

    await put(attachmentId, Buffer.from('bytes'));

    const after = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(after.uploadedAt).not.toBeNull();
  });

  it('still stores bytes for an attachment someone else marked complete first', async () => {
    // Regression: /api/attachments/[id]/complete used to stamp uploadedAt, and
    // anyone in the circle may call it for anyone's attachment. Combined with
    // write-once, marking a still-pending attachment complete made the author's
    // real upload no-op forever — the event kept showing an attachment whose
    // bytes never existed, unrecoverably, since retries were refused too.
    const { user, attachmentId, storageKey } = await seedCircle('a');
    currentUserId.value = user.id;

    const { POST: complete } = await import('../../attachments/[id]/complete/route');
    const completeRes = await complete(
      new NextRequest(`http://localhost/api/attachments/${attachmentId}/complete`, {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: attachmentId }) }
    );
    expect(completeRes.status).toBe(200);

    const res = await put(attachmentId, Buffer.from('real-bytes'));

    expect(res.status).toBe(204);
    expect(store.objects.get(storageKey)?.body.toString()).toBe('real-bytes');
  });

  it('records the content type it actually vetted', async () => {
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    await put(attachmentId, Buffer.from('bytes'), { 'content-type': 'image/webp' });

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
    expect(row.mimeType).toBe('image/webp');
  });

  it('accepts formats the capture UI really produces, like HEIC', async () => {
    // Rejecting these would not block an attack; it would silently lose a
    // caregiver's photo, because a failed upload only retries in the background.
    const { user, attachmentId } = await seedCircle('a');
    currentUserId.value = user.id;

    const res = await put(attachmentId, Buffer.from('heic-bytes'), {
      'content-type': 'image/heic',
    });

    expect(res.status).toBe(204);
  });
});
