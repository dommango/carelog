import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseEscalation } from '../escalation.js';

let errors: unknown[][];

beforeEach(() => {
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseEscalation', () => {
  it('accepts a well-formed config', () => {
    expect(parseEscalation({ afterMinutes: 30, notify: ['u1'], channel: 'sms' }, 'sched-1')).toEqual({
      afterMinutes: 30,
      notify: ['u1'],
      channel: 'sms',
    });
  });

  it('treats an absent escalation as simply not configured, without logging', () => {
    expect(parseEscalation(null, 'sched-1')).toBeNull();
    expect(parseEscalation(undefined, 'sched-1')).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it('rejects a missing afterMinutes loudly instead of computing NaN', () => {
    // The regression: this was cast straight to its expected type, so
    // `undefined * 60_000` produced NaN, `now >= new Date(NaN)` was false, and
    // the escalation silently never fired — with nothing logged to explain it.
    expect(parseEscalation({ notify: ['u1'] }, 'sched-1')).toBeNull();
    expect(errors).toHaveLength(1);
    expect(String(errors[0]![0])).toContain('sched-1');
  });

  const malformed: Array<[string, unknown]> = [
    ['afterMinutes as a string', { afterMinutes: '30', notify: [] }],
    ['negative afterMinutes', { afterMinutes: -5, notify: [] }],
    ['NaN afterMinutes', { afterMinutes: Number.NaN, notify: [] }],
    ['notify missing', { afterMinutes: 30 }],
    ['notify not an array', { afterMinutes: 30, notify: 'u1' }],
    ['unknown channel', { afterMinutes: 30, notify: [], channel: 'carrier-pigeon' }],
    ['not an object', 'nope'],
  ];

  for (const [name, value] of malformed) {
    it(`rejects ${name}`, () => {
      expect(parseEscalation(value, 'sched-1')).toBeNull();
      expect(errors).toHaveLength(1);
    });
  }

  it('allows an empty notify list', () => {
    expect(parseEscalation({ afterMinutes: 30, notify: [] }, 'sched-1')).toEqual({
      afterMinutes: 30,
      notify: [],
    });
  });
});
