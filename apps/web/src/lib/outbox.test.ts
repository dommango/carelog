import { config } from 'dotenv';
config({ path: '.env.local' });

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localDb } from './localDb';
import { queueOutbox, drainOutbox, mergeServerEvent } from './outbox';

describe('outbox drain', () => {
  beforeEach(async () => {
    await localDb.delete();
    await localDb.open();
    vi.restoreAllMocks();
  });

  it('creates an event via POST and merges the server response', async () => {
    const eventId = 'evt-1';
    const idempotencyKey = 'idem-1';
    const serverEvent = {
      id: eventId,
      patientId: 'p1',
      authorId: 'u1',
      status: 'pending_ai',
      occurredAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      rawInput: 'Test event',
      clientId: 'web',
      idempotencyKey,
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ event: serverEvent, uploads: [] }),
    } as unknown as Response);

    await queueOutbox({
      id: eventId,
      type: 'event:create',
      payload: {
        id: eventId,
        rawInput: 'Test event',
        occurredAt: new Date().toISOString(),
        clientId: 'web',
        idempotencyKey,
        attachments: [],
      },
      idempotencyKey,
      clientId: 'web',
    });

    await drainOutbox();

    const outbox = await localDb.outbox.toArray();
    expect(outbox).toHaveLength(0);

    const saved = await localDb.events.get(eventId);
    expect(saved).toBeDefined();
    expect(saved?.rawInput).toBe('Test event');
    expect(saved?.synced).toBe(true);
  });

  it('fetches existing event on 409 and merges without duplicating', async () => {
    const eventId = 'evt-2';
    const idempotencyKey = 'idem-2';
    const serverEvent = {
      id: eventId,
      patientId: 'p1',
      authorId: 'u1',
      status: 'pending_ai',
      occurredAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      rawInput: 'Existing event',
      clientId: 'web',
      idempotencyKey,
      version: 1,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
    };

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Conflict' }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ event: serverEvent }),
      } as unknown as Response);

    await queueOutbox({
      id: eventId,
      type: 'event:create',
      payload: {
        id: eventId,
        rawInput: 'Test event',
        occurredAt: new Date().toISOString(),
        clientId: 'web',
        idempotencyKey,
        attachments: [],
      },
      idempotencyKey,
      clientId: 'web',
    });

    await drainOutbox();

    const saved = await localDb.events.get(eventId);
    expect(saved?.rawInput).toBe('Existing event');
    expect(await localDb.outbox.count()).toBe(0);
  });

  it('retries network errors up to max retries', async () => {
    const eventId = 'evt-3';
    const idempotencyKey = 'idem-3';

    global.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    await queueOutbox({
      id: eventId,
      type: 'event:create',
      payload: {
        id: eventId,
        rawInput: 'Test event',
        occurredAt: new Date().toISOString(),
        clientId: 'web',
        idempotencyKey,
        attachments: [],
      },
      idempotencyKey,
      clientId: 'web',
    });

    // Drain multiple times to exhaust retries.
    for (let i = 0; i < 6; i++) {
      await drainOutbox();
    }

    const item = await localDb.outbox.get(eventId);
    expect(item?.retries).toBe(5);
    expect(item?.error).toContain('Network failure');
  });

  it('uploads queued attachment blobs', async () => {
    const eventId = 'evt-4';
    const attachmentId = 'att-4';
    const idempotencyKey = 'idem-4';
    const blobId = `${eventId}:blob:${attachmentId}`;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as unknown as Response);

    await localDb.blobs.put({
      id: blobId,
      blob: new Blob(['fake-image'], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      eventId,
    });

    await queueOutbox({
      id: `${eventId}:upload:${attachmentId}`,
      type: 'attachment:upload',
      payload: {
        eventId,
        attachmentId,
        url: '/api/upload/att-1',
        method: 'PUT',
        blobId,
      },
      idempotencyKey: `${idempotencyKey}:upload:${attachmentId}`,
      clientId: 'web',
    });

    await drainOutbox();

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/upload/att-1',
      expect.objectContaining({ method: 'PUT', body: expect.any(Blob) })
    );
    expect(await localDb.blobs.get(blobId)).toBeUndefined();
  });
});

describe('mergeServerEvent', () => {
  beforeEach(async () => {
    await localDb.delete();
    await localDb.open();
  });

  it('preserves local authorName when server response omits it', async () => {
    const eventId = 'evt-merge';
    await localDb.events.put({
      id: eventId,
      patientId: 'p1',
      authorId: 'u1',
      authorName: 'Local Name',
      category: null,
      status: 'pending_ai',
      occurredAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      rawInput: 'Local',
      structuredData: null,
      aiConfidence: null,
      aiFlags: [],
      aiModelVersion: null,
      scheduleId: null,
      templateId: null,
      hasConflict: false,
      version: 1,
      clientId: 'web',
      idempotencyKey: 'idem-merge',
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
      synced: false,
    });

    await mergeServerEvent({
      id: eventId,
      patientId: 'p1',
      authorId: 'u1',
      status: 'confirmed',
      occurredAt: new Date().toISOString(),
      capturedAt: new Date().toISOString(),
      rawInput: 'Server',
      clientId: 'web',
      idempotencyKey: 'idem-merge',
      version: 2,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
    });

    const saved = await localDb.events.get(eventId);
    expect(saved?.authorName).toBe('Local Name');
    expect(saved?.status).toBe('confirmed');
    expect(saved?.synced).toBe(true);
  });
});
