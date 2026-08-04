import { describe, expect, it } from 'vitest';
import { toLocalDatetimeInputValue } from './datetime-local';

describe('toLocalDatetimeInputValue', () => {
  it('formats a date in local wall-clock time for a datetime-local input', () => {
    const date = new Date(2026, 0, 5, 9, 7);
    expect(toLocalDatetimeInputValue(date)).toBe('2026-01-05T09:07');
  });

  it('round-trips through the Date constructor without shifting', () => {
    const date = new Date(2026, 7, 4, 23, 30);
    expect(new Date(toLocalDatetimeInputValue(date)).getTime()).toBe(date.getTime());
  });

  it('returns an empty string for an unparseable value', () => {
    expect(toLocalDatetimeInputValue('not-a-date')).toBe('');
  });
});
