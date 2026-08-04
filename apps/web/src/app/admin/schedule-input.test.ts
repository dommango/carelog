import { describe, expect, it } from 'vitest';
import {
  buildRrule,
  parseEscalation,
  parseRemindOffsets,
  parseWindowMinutes,
} from '@/app/admin/schedule-input';

const base = { recurrence: 'daily', time: '08:00', days: [] as string[], interval: '' };

describe('buildRrule', () => {
  it('builds the daily and weekly rules the describer reads back', () => {
    expect(buildRrule(base)).toEqual({
      ok: true,
      value: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });
    expect(
      buildRrule({ ...base, recurrence: 'weekly', time: '20:30', days: ['MO', 'FR'] })
    ).toEqual({
      ok: true,
      value: 'FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=20;BYMINUTE=30;BYSECOND=0',
    });
  });

  it('accepts the seconds a time input may include', () => {
    expect(buildRrule({ ...base, time: '07:15:00' })).toEqual({
      ok: true,
      value: 'FREQ=DAILY;BYHOUR=7;BYMINUTE=15;BYSECOND=0',
    });
  });

  it('refuses a blank or impossible time instead of emitting BYHOUR=NaN', () => {
    expect(buildRrule({ ...base, time: '' }).ok).toBe(false);
    expect(buildRrule({ ...base, time: '25:00' }).ok).toBe(false);
    expect(buildRrule({ ...base, time: '08:70' }).ok).toBe(false);
  });

  it('refuses a weekly schedule with no day ticked rather than assuming Monday', () => {
    const result = buildRrule({ ...base, recurrence: 'weekly', days: [] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/at least one day/);
  });

  it('drops days it does not recognise and fails if none survive', () => {
    expect(buildRrule({ ...base, recurrence: 'weekly', days: ['MO', 'XX'] })).toEqual({
      ok: true,
      value: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0;BYSECOND=0',
    });
    expect(buildRrule({ ...base, recurrence: 'weekly', days: ['XX'] }).ok).toBe(false);
  });

  it('requires an explicit interval for hourly rather than defaulting to every hour', () => {
    expect(buildRrule({ ...base, recurrence: 'hourly', interval: '4' })).toEqual({
      ok: true,
      value: 'FREQ=HOURLY;INTERVAL=4',
    });
    expect(buildRrule({ ...base, recurrence: 'hourly', interval: '' }).ok).toBe(false);
    expect(buildRrule({ ...base, recurrence: 'hourly', interval: '0' }).ok).toBe(false);
    expect(buildRrule({ ...base, recurrence: 'hourly', interval: '48' }).ok).toBe(false);
  });

  it('ignores the time when the schedule is hourly', () => {
    expect(buildRrule({ ...base, recurrence: 'hourly', time: '', interval: '6' })).toEqual({
      ok: true,
      value: 'FREQ=HOURLY;INTERVAL=6',
    });
  });

  it('rejects a recurrence it does not know', () => {
    expect(buildRrule({ ...base, recurrence: 'monthly' }).ok).toBe(false);
  });
});

describe('parseWindowMinutes', () => {
  it('falls back to 90 minutes when the field is left empty', () => {
    expect(parseWindowMinutes('')).toEqual({ ok: true, value: 90 });
    expect(parseWindowMinutes('  ')).toEqual({ ok: true, value: 90 });
  });

  it('takes a whole number of minutes within a day', () => {
    expect(parseWindowMinutes('30')).toEqual({ ok: true, value: 30 });
    expect(parseWindowMinutes('1440')).toEqual({ ok: true, value: 1440 });
  });

  it('rejects zero, fractions, negatives and anything over a day', () => {
    expect(parseWindowMinutes('0').ok).toBe(false);
    expect(parseWindowMinutes('1.5').ok).toBe(false);
    expect(parseWindowMinutes('-10').ok).toBe(false);
    expect(parseWindowMinutes('1441').ok).toBe(false);
    expect(parseWindowMinutes('soon').ok).toBe(false);
  });
});

describe('parseRemindOffsets', () => {
  it('reads a comma separated list, treating empty as a nudge on time', () => {
    expect(parseRemindOffsets('0,15')).toEqual({ ok: true, value: [0, 15] });
    expect(parseRemindOffsets(' 0 , 15 ')).toEqual({ ok: true, value: [0, 15] });
    expect(parseRemindOffsets('')).toEqual({ ok: true, value: [0] });
    expect(parseRemindOffsets(',')).toEqual({ ok: true, value: [0] });
  });

  it('names the entry it could not read instead of silently dropping it', () => {
    const result = parseRemindOffsets('0,soon');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('soon');
  });

  it('rejects negatives, which would nudge before care is due', () => {
    expect(parseRemindOffsets('-15').ok).toBe(false);
  });
});

describe('parseEscalation', () => {
  it('is off when neither the wait nor anyone to text is given', () => {
    expect(parseEscalation('', [])).toEqual({ ok: true, value: undefined });
  });

  it('builds an sms escalation when both halves are given', () => {
    expect(parseEscalation('30', ['user-1', 'user-2'])).toEqual({
      ok: true,
      value: { afterMinutes: 30, notify: ['user-1', 'user-2'], channel: 'sms' },
    });
  });

  it('refuses a wait time with nobody to text rather than dropping it silently', () => {
    const result = parseEscalation('30', []);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/at least one person/);
  });

  it('refuses people to text with no wait time', () => {
    const result = parseEscalation('', ['user-1']);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/how long to wait/);
  });

  it('rejects a wait that is not a whole positive number of minutes', () => {
    expect(parseEscalation('0', ['user-1']).ok).toBe(false);
    expect(parseEscalation('-5', ['user-1']).ok).toBe(false);
    expect(parseEscalation('later', ['user-1']).ok).toBe(false);
  });
});
