import { describe, expect, it } from 'vitest';
import { describeRrule, formatClockTime } from '@/lib/rrule-describe';

describe('formatClockTime', () => {
  it('renders midnight and noon as 12, not 0', () => {
    expect(formatClockTime(0, 0)).toBe('12:00 AM');
    expect(formatClockTime(12, 0)).toBe('12:00 PM');
  });

  it('pads minutes and picks the right half of the day', () => {
    expect(formatClockTime(8, 5)).toBe('8:05 AM');
    expect(formatClockTime(13, 30)).toBe('1:30 PM');
    expect(formatClockTime(23, 59)).toBe('11:59 PM');
  });

  it('rejects out-of-range and non-integer values instead of wrapping them', () => {
    expect(formatClockTime(24, 0)).toBeNull();
    expect(formatClockTime(-1, 0)).toBeNull();
    expect(formatClockTime(8, 60)).toBeNull();
    expect(formatClockTime(NaN, 0)).toBeNull();
  });
});

describe('describeRrule', () => {
  it('describes the daily rule the admin form builds', () => {
    expect(describeRrule('FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0')).toBe('Every day at 8:00 AM');
    expect(describeRrule('FREQ=DAILY;BYHOUR=20;BYMINUTE=30;BYSECOND=0')).toBe(
      'Every day at 8:30 PM'
    );
  });

  it('describes weekly rules with the days in week order, not the order given', () => {
    expect(describeRrule('FREQ=WEEKLY;BYDAY=WE,MO;BYHOUR=9;BYMINUTE=0;BYSECOND=0')).toBe(
      'Every Mon and Wed at 9:00 AM'
    );
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=9;BYMINUTE=0;BYSECOND=0')).toBe(
      'Every Mon, Wed and Fri at 9:00 AM'
    );
  });

  it('collapses a seven-day weekly rule to "Every day"', () => {
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU;BYHOUR=7;BYMINUTE=0')).toBe(
      'Every day at 7:00 AM'
    );
  });

  it('describes hourly rules, treating a missing interval as every hour', () => {
    expect(describeRrule('FREQ=HOURLY;INTERVAL=4')).toBe('Every 4 hours');
    expect(describeRrule('FREQ=HOURLY;INTERVAL=1')).toBe('Every hour');
    expect(describeRrule('FREQ=HOURLY')).toBe('Every hour');
  });

  it('tolerates an RRULE: prefix and lowercase parts', () => {
    expect(describeRrule('RRULE:freq=DAILY;byhour=6;byminute=0')).toBe('Every day at 6:00 AM');
  });

  it('falls back to the raw rule rather than guessing at what it cannot parse', () => {
    expect(describeRrule('FREQ=MONTHLY;BYMONTHDAY=1')).toBe('FREQ=MONTHLY;BYMONTHDAY=1');
    expect(describeRrule('FREQ=WEEKLY;BYHOUR=9')).toBe('FREQ=WEEKLY;BYHOUR=9');
    expect(describeRrule('FREQ=HOURLY;INTERVAL=0')).toBe('FREQ=HOURLY;INTERVAL=0');
    expect(describeRrule('')).toBe('');
  });

  it('omits the time when the rule carries none', () => {
    expect(describeRrule('FREQ=DAILY')).toBe('Every day');
  });
});
