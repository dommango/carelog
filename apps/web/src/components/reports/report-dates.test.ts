import { describe, expect, it } from 'vitest';
import {
  dayKeyForOffset,
  formatDayKey,
  formatDayKeyShort,
  formatReportDate,
  parseDayKey,
  toDateInputValue,
} from './report-dates';

describe('toDateInputValue', () => {
  it('uses the local calendar day just after midnight', () => {
    expect(toDateInputValue(new Date(2026, 7, 3, 0, 30))).toBe('2026-08-03');
  });

  it('uses the local calendar day just before midnight', () => {
    expect(toDateInputValue(new Date(2026, 7, 3, 23, 30))).toBe('2026-08-03');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toDateInputValue(new Date(2026, 0, 9, 12, 0))).toBe('2026-01-09');
  });
});

describe('parseDayKey', () => {
  it('parses a day key to local midnight', () => {
    const parsed = parseDayKey('2026-08-03');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(7);
    expect(parsed!.getDate()).toBe(3);
    expect(parsed!.getHours()).toBe(0);
  });

  it('rejects anything that is not a day key', () => {
    expect(parseDayKey('2026-08-03T10:00:00.000Z')).toBeNull();
    expect(parseDayKey('03/08/2026')).toBeNull();
    expect(parseDayKey('')).toBeNull();
  });
});

describe('formatDayKey', () => {
  it('does not shift the day across timezones', () => {
    expect(formatDayKey('2026-08-03', 'en-US')).toBe('Aug 3, 2026');
  });

  it('follows the requested locale', () => {
    expect(formatDayKey('2026-08-03', 'en-GB')).toBe('3 Aug 2026');
  });

  it('returns the key unchanged when it cannot be parsed', () => {
    expect(formatDayKey('not-a-date', 'en-US')).toBe('not-a-date');
  });
});

describe('formatDayKeyShort', () => {
  it('omits the year', () => {
    expect(formatDayKeyShort('2026-08-03', 'en-US')).toBe('Aug 3');
  });
});

describe('formatReportDate', () => {
  it('spells the month out so the date is never ambiguous', () => {
    expect(formatReportDate(new Date(2026, 7, 3, 9, 0), 'en-US')).toBe('Aug 3, 2026');
  });

  it('accepts an ISO string', () => {
    const iso = new Date(2026, 7, 3, 9, 0).toISOString();
    expect(formatReportDate(iso, 'en-US')).toBe('Aug 3, 2026');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatReportDate('nonsense', 'en-US')).toBe('');
  });
});

describe('malformed locales from Accept-Language', () => {
  it.each(['*', 'en;q=0.9', 'en_US'])('falls back instead of throwing for %s', (locale) => {
    expect(() => formatReportDate(new Date(2026, 7, 3), locale)).not.toThrow();
    expect(formatReportDate(new Date(2026, 7, 3), locale)).not.toBe('');
    expect(() => formatDayKey('2026-08-03', locale)).not.toThrow();
    expect(() => formatDayKeyShort('2026-08-03', locale)).not.toThrow();
  });
});

describe('dayKeyForOffset', () => {
  it('buckets an instant into the local day for a zone behind UTC (New York, +240)', () => {
    // Aug 1 21:00 in New York is Aug 2 01:00 UTC — the local day is still Aug 1.
    expect(dayKeyForOffset(new Date('2026-08-02T01:00:00Z'), 240)).toBe('2026-08-01');
  });

  it('buckets an instant into the local day for a zone ahead of UTC (Tokyo, -540)', () => {
    // Jul 31 15:00 UTC is Aug 1 00:00 in Tokyo.
    expect(dayKeyForOffset(new Date('2026-07-31T15:00:00Z'), -540)).toBe('2026-08-01');
  });

  it('is the inverse of parseDayKey for the offset the client sent', () => {
    const key = '2026-08-01';
    const clientLocalMidnight = parseDayKey(key)!;
    const clientOffset = clientLocalMidnight.getTimezoneOffset();
    expect(dayKeyForOffset(clientLocalMidnight, clientOffset)).toBe(key);
  });
});
