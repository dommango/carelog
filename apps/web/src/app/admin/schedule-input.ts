/**
 * Turns the schedule form's raw strings into the shape `createScheduleSchema`
 * wants, or into a sentence explaining what to fix.
 *
 * The form used to coerce silently: a blank time became `BYHOUR=NaN`, a weekly
 * schedule with no days chosen became Monday, and escalation minutes without
 * anyone ticked was dropped altogether. Every one of those produced a schedule
 * that reminded at the wrong time, or not at all, without saying so.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type Escalation = {
  afterMinutes: number;
  notify: string[];
  channel: 'sms';
};

const VALID_DAYS = new Set(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']);

const MAX_WINDOW_MINUTES = 24 * 60;
const MAX_INTERVAL_HOURS = 24;
const MAX_OFFSET_MINUTES = 24 * 60;

function parseWholeNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

function parseClock(raw: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return { hour, minute };
}

export function buildRrule(input: {
  recurrence: string;
  time: string;
  days: readonly string[];
  interval: string;
}): Parsed<string> {
  const { recurrence, time, days, interval } = input;

  if (recurrence === 'hourly') {
    const hours = parseWholeNumber(interval);
    if (hours === null || hours < 1 || hours > MAX_INTERVAL_HOURS) {
      return {
        ok: false,
        error: `Say how many hours apart this should repeat — a whole number from 1 to ${MAX_INTERVAL_HOURS}.`,
      };
    }
    return { ok: true, value: `FREQ=HOURLY;INTERVAL=${hours}` };
  }

  const clock = parseClock(time);
  if (!clock) {
    return { ok: false, error: 'Choose a time of day for this schedule.' };
  }

  const tail = `BYHOUR=${clock.hour};BYMINUTE=${clock.minute};BYSECOND=0`;

  if (recurrence === 'daily') {
    return { ok: true, value: `FREQ=DAILY;${tail}` };
  }

  if (recurrence === 'weekly') {
    const chosen = days.filter((day) => VALID_DAYS.has(day));
    if (chosen.length === 0) {
      return { ok: false, error: 'Tick at least one day of the week for this schedule.' };
    }
    return { ok: true, value: `FREQ=WEEKLY;BYDAY=${chosen.join(',')};${tail}` };
  }

  return { ok: false, error: 'Choose how often this should happen.' };
}

export function parseWindowMinutes(raw: string): Parsed<number> {
  if (raw.trim() === '') return { ok: true, value: 90 };

  const minutes = parseWholeNumber(raw);
  if (minutes === null || minutes < 1 || minutes > MAX_WINDOW_MINUTES) {
    return {
      ok: false,
      error: `The on-time window has to be a whole number of minutes between 1 and ${MAX_WINDOW_MINUTES}.`,
    };
  }

  return { ok: true, value: minutes };
}

export function parseRemindOffsets(raw: string): Parsed<number[]> {
  if (raw.trim() === '') return { ok: true, value: [0] };

  const parts = raw.split(',').map((part) => part.trim());
  const offsets: number[] = [];

  for (const part of parts) {
    if (part === '') continue;
    const minutes = parseWholeNumber(part);
    if (minutes === null || minutes > MAX_OFFSET_MINUTES) {
      return {
        ok: false,
        error: `“${part}” is not a number of minutes. Write them separated by commas, like 0,15.`,
      };
    }
    offsets.push(minutes);
  }

  return offsets.length === 0 ? { ok: true, value: [0] } : { ok: true, value: offsets };
}

export function parseEscalation(
  afterRaw: string,
  notify: readonly string[]
): Parsed<Escalation | undefined> {
  const wanted = afterRaw.trim() !== '';
  const chosen = notify.filter((id) => id !== '');

  if (!wanted && chosen.length === 0) return { ok: true, value: undefined };

  if (!wanted) {
    return {
      ok: false,
      error: 'Say how long to wait before texting, or untick everyone under “If nobody logs it”.',
    };
  }

  const afterMinutes = parseWholeNumber(afterRaw);
  if (afterMinutes === null || afterMinutes < 1) {
    return {
      ok: false,
      error: 'The wait before texting has to be a whole number of minutes, at least 1.',
    };
  }

  if (chosen.length === 0) {
    return {
      ok: false,
      error: 'Tick at least one person to text, or clear the wait time to turn this off.',
    };
  }

  return { ok: true, value: { afterMinutes, notify: chosen, channel: 'sms' } };
}
