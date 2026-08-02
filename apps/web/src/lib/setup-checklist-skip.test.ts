import { describe, expect, it } from 'vitest';
import { isSkipped, parseSkippedAt } from '@/lib/setup-checklist-skip';

describe('parseSkippedAt', () => {
  it('reads a stored progress count', () => {
    expect(parseSkippedAt('0')).toBe(0);
    expect(parseSkippedAt('3')).toBe(3);
  });

  it('treats nothing stored as never skipped', () => {
    expect(parseSkippedAt(null)).toBeNull();
  });

  it('treats junk as never skipped rather than hiding the prompt', () => {
    expect(parseSkippedAt('')).toBeNull();
    expect(parseSkippedAt('yes')).toBeNull();
    expect(parseSkippedAt('1.5')).toBeNull();
    expect(parseSkippedAt('-1')).toBeNull();
  });
});

describe('isSkipped', () => {
  it('shows the prompt when it was never skipped', () => {
    expect(isSkipped(null, 1)).toBe(false);
  });

  it('hides the prompt while setup has not moved on', () => {
    expect(isSkipped('1', 1)).toBe(true);
  });

  it('brings the prompt back once another step is finished', () => {
    expect(isSkipped('1', 2)).toBe(false);
  });

  it('stays hidden if progress somehow goes backwards', () => {
    // A schedule can be paused after skipping, which un-completes that item.
    // Re-showing the prompt on the way *down* would be nagging, not helping.
    expect(isSkipped('2', 1)).toBe(true);
  });

  it('honours a skip taken at zero progress', () => {
    expect(isSkipped('0', 0)).toBe(true);
    expect(isSkipped('0', 1)).toBe(false);
  });
});
