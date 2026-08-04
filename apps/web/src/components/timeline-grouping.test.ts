import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import type { LocalEvent, OutboxItem } from '@/lib/localDb';
import {
  dayLabel,
  groupEventsByDay,
  eventIdForOutboxItem,
  failedSyncByEvent,
  failedSyncMessage,
} from './timeline-grouping';

const NOW = new Date(2026, 7, 4, 10, 0);

function event(id: string, occurredAt: Date): LocalEvent {
  return {
    id,
    patientId: 'p1',
    authorId: 'u1',
    authorName: 'Ada',
    category: null,
    status: 'confirmed' as LocalEvent['status'],
    occurredAt: occurredAt.toISOString(),
    capturedAt: occurredAt.toISOString(),
    rawInput: id,
    structuredData: null,
    aiConfidence: null,
    aiFlags: [],
    aiModelVersion: null,
    scheduleId: null,
    templateId: null,
    hasConflict: false,
    version: 1,
    clientId: 'web',
    idempotencyKey: `idem-${id}`,
    updatedAt: occurredAt.toISOString(),
    createdAt: occurredAt.toISOString(),
    deletedAt: null,
    attachments: [],
    synced: true,
  };
}

function outboxItem(overrides: Partial<OutboxItem>): OutboxItem {
  return {
    id: 'item-1',
    type: 'event:create',
    payload: {},
    idempotencyKey: 'idem-1',
    clientId: 'web',
    createdAt: NOW.toISOString(),
    retries: 0,
    error: null,
    ...overrides,
  };
}

describe('dayLabel', () => {
  it('names today and yesterday in plain language', () => {
    expect(dayLabel('2026-08-04', NOW)).toBe('Today');
    expect(dayLabel('2026-08-03', NOW)).toBe('Yesterday');
  });

  it('spells out older days and includes the year for other years', () => {
    expect(dayLabel('2026-08-01', NOW)).toBe(
      new Date(2026, 7, 1).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    );
    expect(dayLabel('2025-12-31', NOW)).toContain('2025');
  });

  it('handles a yesterday that crosses a month boundary', () => {
    expect(dayLabel('2026-07-31', new Date(2026, 7, 1, 9, 0))).toBe('Yesterday');
  });
});

describe('groupEventsByDay', () => {
  it('groups consecutive events of the same local day and keeps their order', () => {
    const events = [
      event('a', new Date(2026, 7, 4, 9, 0)),
      event('b', new Date(2026, 7, 4, 8, 0)),
      event('c', new Date(2026, 7, 3, 22, 0)),
      event('d', new Date(2026, 7, 1, 7, 0)),
    ];

    const groups = groupEventsByDay(events, NOW);

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', groups[2].label]);
    expect(groups[0].events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['c']);
    expect(groups[2].events.map((e) => e.id)).toEqual(['d']);
  });

  it('returns nothing for an empty list', () => {
    expect(groupEventsByDay([], NOW)).toEqual([]);
  });
});

describe('failedSyncByEvent', () => {
  it('ignores items that have retries left', () => {
    const items = [outboxItem({ id: 'evt-1', payload: { id: 'evt-1' }, retries: 4 })];
    expect(failedSyncByEvent(items)).toEqual({});
  });

  it('maps a failed create to its event id', () => {
    const items = [
      outboxItem({ id: 'evt-1', payload: { id: 'evt-1' }, retries: 5, error: 'Create failed: 500' }),
    ];

    expect(failedSyncByEvent(items)).toEqual({
      'evt-1': { itemId: 'evt-1', type: 'event:create', error: 'Create failed: 500' },
    });
  });

  it('prefers a failed write over a failed attachment upload for the same event', () => {
    const items = [
      outboxItem({
        id: 'evt-1:upload:a1',
        type: 'attachment:upload',
        payload: { eventId: 'evt-1', attachmentId: 'a1' },
        retries: 5,
      }),
      outboxItem({
        id: 'evt-1:update',
        type: 'event:update',
        payload: { eventId: 'evt-1' },
        retries: 5,
      }),
    ];

    expect(failedSyncByEvent(items)['evt-1'].type).toBe('event:update');
  });

  it('skips items whose payload carries no event id', () => {
    expect(failedSyncByEvent([outboxItem({ retries: 5, payload: {} })])).toEqual({});
  });
});

describe('eventIdForOutboxItem', () => {
  it('reads eventId first, then id', () => {
    expect(eventIdForOutboxItem(outboxItem({ payload: { eventId: 'e1', id: 'other' } }))).toBe('e1');
    expect(eventIdForOutboxItem(outboxItem({ payload: { id: 'e2' } }))).toBe('e2');
    expect(eventIdForOutboxItem(outboxItem({ payload: {} }))).toBeNull();
  });
});

describe('failedSyncMessage', () => {
  it('distinguishes a failed attachment from a failed entry', () => {
    expect(failedSyncMessage({ itemId: 'x', type: 'attachment:upload', error: null })).toContain(
      'photo or voice memo'
    );
    expect(failedSyncMessage({ itemId: 'x', type: 'event:create', error: null })).toContain(
      'shared log'
    );
  });
});
