import { config } from 'dotenv';
config({ path: '.env.local' });

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { localDb } from './localDb';
import { mergeDelta, type DeltaResult } from './sync';

describe('mergeDelta', () => {
  beforeEach(async () => {
    await localDb.delete();
    await localDb.open();
  });

  it('inserts new events and updates existing ones', async () => {
    const now = new Date().toISOString();
    const delta: DeltaResult = {
      events: [
        {
          id: 'evt-1',
          patientId: 'p1',
          authorId: 'u1',
          author: { name: 'Alice' },
          status: 'confirmed',
          occurredAt: now,
          capturedAt: now,
          rawInput: 'Synced event',
          clientId: 'web',
          idempotencyKey: 'idem-1',
          version: 1,
          updatedAt: now,
          createdAt: now,
          deletedAt: null,
          attachments: [],
        },
      ],
      templates: [],
      schedules: [],
      cursor: now,
    };

    await mergeDelta(delta);

    const saved = await localDb.events.get('evt-1');
    expect(saved).toBeDefined();
    expect(saved?.rawInput).toBe('Synced event');
    expect(saved?.authorName).toBe('Alice');
  });

  it('deletes soft-deleted events locally', async () => {
    const now = new Date().toISOString();
    await localDb.events.put({
      id: 'evt-delete',
      patientId: 'p1',
      authorId: 'u1',
      authorName: null,
      category: null,
      status: 'confirmed',
      occurredAt: now,
      capturedAt: now,
      rawInput: 'To delete',
      structuredData: null,
      aiConfidence: null,
      aiFlags: [],
      aiModelVersion: null,
      scheduleId: null,
      templateId: null,
      hasConflict: false,
      version: 1,
      clientId: 'web',
      idempotencyKey: 'idem-delete',
      updatedAt: now,
      createdAt: now,
      deletedAt: null,
      attachments: [],
      synced: true,
    });

    const delta: DeltaResult = {
      events: [
        {
          id: 'evt-delete',
          patientId: 'p1',
          authorId: 'u1',
          status: 'confirmed',
          occurredAt: now,
          capturedAt: now,
          rawInput: 'To delete',
          clientId: 'web',
          idempotencyKey: 'idem-delete',
          version: 1,
          updatedAt: new Date(Date.now() + 1000).toISOString(),
          createdAt: now,
          deletedAt: now,
          attachments: [],
        },
      ],
      templates: [],
      schedules: [],
      cursor: new Date(Date.now() + 1000).toISOString(),
    };

    await mergeDelta(delta);

    expect(await localDb.events.get('evt-delete')).toBeUndefined();
  });

  it('caches templates and removes inactive ones', async () => {
    const now = new Date().toISOString();
    const delta: DeltaResult = {
      events: [],
      templates: [
        {
          id: 'tpl-1',
          patientId: 'p1',
          name: 'Morning nebulizer',
          category: 'nebulizer_treatment',
          defaults: {},
          icon: null,
          createdBy: 'u1',
          isActive: true,
          updatedAt: now,
          createdAt: now,
        },
      ],
      schedules: [],
      cursor: now,
    };

    await mergeDelta(delta);

    const saved = await localDb.templates.get('tpl-1');
    expect(saved?.name).toBe('Morning nebulizer');

    await mergeDelta({
      events: [],
      templates: [{ ...delta.templates[0], isActive: false }],
      schedules: [],
      cursor: new Date(Date.now() + 1000).toISOString(),
    });

    expect(await localDb.templates.get('tpl-1')).toBeUndefined();
  });
});
