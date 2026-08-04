import { describe, expect, it } from 'vitest';
import type { MoodPoint } from '@/lib/services/reports';
import { summarizeMood } from './mood-summary';

function point(date: string, averageMood: number | null, count = 1): MoodPoint {
  return { date, averageMood, count, incidents: 0, painFlags: 0 };
}

describe('summarizeMood', () => {
  it('returns empty extremes for no points', () => {
    expect(summarizeMood([])).toEqual({
      daysWithData: 0,
      totalEntries: 0,
      average: null,
      lowest: null,
      highest: null,
    });
  });

  it('counts entries on days with no mood rating', () => {
    const summary = summarizeMood([point('2026-08-01', null, 3)]);
    expect(summary.daysWithData).toBe(0);
    expect(summary.totalEntries).toBe(3);
    expect(summary.average).toBeNull();
  });

  it('averages only the days that have a rating', () => {
    const summary = summarizeMood([
      point('2026-08-01', 2, 2),
      point('2026-08-02', null, 1),
      point('2026-08-03', 4, 1),
    ]);
    expect(summary.daysWithData).toBe(2);
    expect(summary.totalEntries).toBe(4);
    expect(summary.average).toBe(3);
  });

  it('rounds the average to one decimal', () => {
    const summary = summarizeMood([
      point('2026-08-01', 1),
      point('2026-08-02', 2),
      point('2026-08-03', 4),
    ]);
    expect(summary.average).toBe(2.3);
  });

  it('reports the lowest and highest day', () => {
    const summary = summarizeMood([
      point('2026-08-01', 3.5),
      point('2026-08-02', 1.2),
      point('2026-08-03', 4.8),
    ]);
    expect(summary.lowest).toEqual({ date: '2026-08-02', value: 1.2 });
    expect(summary.highest).toEqual({ date: '2026-08-03', value: 4.8 });
  });

  it('keeps the first day when values tie', () => {
    const summary = summarizeMood([point('2026-08-01', 3), point('2026-08-02', 3)]);
    expect(summary.lowest!.date).toBe('2026-08-01');
    expect(summary.highest!.date).toBe('2026-08-01');
  });
});
