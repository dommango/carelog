import { config } from 'dotenv';
config({ path: '.env.local' });

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { localDb } from './localDb';
import {
  queueOutbox,
  drainOutbox,
  mergeServerEvent,
  retryOutboxItem,
  resetOutboxRetries,
  listFailedOutboxItems,
  MAX_RETRIES,
} from './outbox';

function eventPayload(eventId: string, idempotencyKey: string) {
  return {
    id: eventId,
    type: 'event:create' as const,
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
  };
}

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

  it('spends retries on server rejections up to max retries', async () => {
    const eventId = 'evt-3';
    const idempotencyKey = 'idem-3';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server exploded' }),
    } as unknown as Response);

    await queueOutbox(eventPayload(eventId, idempotencyKey));

    // Drain multiple times to exhaust retries.
    for (let i = 0; i < MAX_RETRIES + 1; i++) {
      await drainOutbox();
    }

    const item = await localDb.outbox.get(eventId);
    expect(item?.retries).toBe(MAX_RETRIES);
    expect(item?.error).toContain('500');
    expect(await listFailedOutboxItems()).toHaveLength(1);
  });

  it('does not spend retries when the connection drops mid-drain', async () => {
    const eventId = 'evt-net';
    const idempotencyKey = 'idem-net';

    // The drain starts while online; the request fails because the link went
    // down underneath it. Subsequent drains no-op on the offline guard.
    // (The node test env has no `navigator`, which isOnline treats as online.)
    global.fetch = vi.fn().mockImplementation(() => {
      vi.stubGlobal('navigator', { onLine: false });
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    await queueOutbox(eventPayload(eventId, idempotencyKey));

    try {
      for (let i = 0; i < MAX_RETRIES + 1; i++) {
        await drainOutbox();
      }
    } finally {
      vi.unstubAllGlobals();
    }

    const item = await localDb.outbox.get(eventId);
    expect(item?.retries).toBe(0);
    expect(item?.error).toContain('Failed to fetch');
    expect(await listFailedOutboxItems()).toHaveLength(0);
  });

  it('spends retries on requests that fail while the browser reports online', async () => {
    const eventId = 'evt-portal';
    const idempotencyKey = 'idem-portal';

    // Captive portal / server down: navigator.onLine stays true but every
    // fetch rejects. This must eventually surface as a failed item instead of
    // retrying invisibly forever.
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await queueOutbox(eventPayload(eventId, idempotencyKey));

    for (let i = 0; i < MAX_RETRIES + 1; i++) {
      await drainOutbox();
    }

    const item = await localDb.outbox.get(eventId);
    expect(item?.retries).toBe(MAX_RETRIES);
    expect(await listFailedOutboxItems()).toHaveLength(1);
  });

  it('retryOutboxItem clears an exhausted failure so the item sends again', async () => {
    const eventId = 'evt-retry';
    const idempotencyKey = 'idem-retry';

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server exploded' }),
    } as unknown as Response);

    await queueOutbox(eventPayload(eventId, idempotencyKey));
    for (let i = 0; i < MAX_RETRIES + 1; i++) {
      await drainOutbox();
    }
    expect((await localDb.outbox.get(eventId))?.retries).toBe(MAX_RETRIES);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        event: {
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
        },
        uploads: [],
      }),
    } as unknown as Response);

    await retryOutboxItem(eventId);
    expect((await localDb.outbox.get(eventId))?.retries).toBe(0);
    expect((await localDb.outbox.get(eventId))?.error).toBeNull();

    await drainOutbox();

    expect(await localDb.outbox.get(eventId)).toBeUndefined();
    expect((await localDb.events.get(eventId))?.synced).toBe(true);
  });

  it('resetOutboxRetries refills partial budgets and leaves exhausted items alone', async () => {
    await localDb.outbox.bulkPut([
      { ...eventPayload('evt-partial', 'idem-partial'), createdAt: new Date().toISOString(), retries: 2, error: 'Create failed: 500' },
      { ...eventPayload('evt-spent', 'idem-spent'), createdAt: new Date().toISOString(), retries: MAX_RETRIES, error: 'Create failed: 400' },
    ]);

    await resetOutboxRetries();

    expect((await localDb.outbox.get('evt-partial'))?.retries).toBe(0);
    expect((await localDb.outbox.get('evt-partial'))?.error).toBeNull();
    expect((await localDb.outbox.get('evt-spent'))?.retries).toBe(MAX_RETRIES);
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
