/**
 * Turns the RRULE strings the admin schedule form builds into a sentence a
 * caregiver can read. The admin list used to print the raw rule
 * (`FREQ=DAILY;BYHOUR=8;...`), which is the main reason schedules read as
 * inscrutable.
 *
 * Anything this does not recognise falls back to the raw rule rather than a
 * guess — a wrong-but-friendly description of when a medication is due would
 * be worse than an ugly one.
 */

const DAY_LABELS: Record<string, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const DAY_ORDER = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function parseParts(rrule: string): Record<string, string> {
  return rrule
    .replace(/^RRULE:/i, '')
    .split(';')
    .reduce<Record<string, string>>((acc, chunk) => {
      const [key, value] = chunk.split('=');
      if (!key || value === undefined) return acc;
      return { ...acc, [key.trim().toUpperCase()]: value.trim() };
    }, {});
}

/** 8, 0 -> "8:00 AM"; 13, 5 -> "1:05 PM". Deliberately locale-free. */
export function formatClockTime(hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const suffix = hour < 12 ? 'AM' : 'PM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatDayList(byday: string): string | null {
  const days = byday
    .split(',')
    .map((d) => d.trim().toUpperCase())
    .filter((d) => d in DAY_LABELS);

  if (days.length === 0) return null;

  const unique = DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_LABELS[d]);
  if (unique.length === 1) return unique[0];
  if (unique.length === 7) return 'every day';

  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

function timeOf(parts: Record<string, string>): string | null {
  const hour = Number(parts.BYHOUR);
  const minute = parts.BYMINUTE === undefined ? 0 : Number(parts.BYMINUTE);
  if (parts.BYHOUR === undefined) return null;
  return formatClockTime(hour, minute);
}

export function describeRrule(rrule: string): string {
  if (!rrule) return '';

  const parts = parseParts(rrule);

  if (parts.FREQ === 'DAILY') {
    const time = timeOf(parts);
    return time ? `Every day at ${time}` : 'Every day';
  }

  if (parts.FREQ === 'WEEKLY') {
    const days = parts.BYDAY ? formatDayList(parts.BYDAY) : null;
    if (!days) return rrule;
    const time = timeOf(parts);
    const when = days === 'every day' ? 'Every day' : `Every ${days}`;
    return time ? `${when} at ${time}` : when;
  }

  if (parts.FREQ === 'HOURLY') {
    const interval = parts.INTERVAL === undefined ? 1 : Number(parts.INTERVAL);
    if (!Number.isInteger(interval) || interval < 1) return rrule;
    return interval === 1 ? 'Every hour' : `Every ${interval} hours`;
  }

  return rrule;
}
