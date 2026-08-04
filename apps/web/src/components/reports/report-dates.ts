const LONG_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
};

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDayKey(key: string): Date | null {
  const match = DAY_KEY.exec(key);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return isNaN(date.getTime()) ? null : date;
}

// Locale strings can arrive from an Accept-Language header, whose first entry
// is valid HTTP but not always a well-formed BCP 47 tag ("*", "en;q=0.9") —
// Intl throws RangeError on those, so fall back to the default locale instead.
function safeLocale(locale?: string): string | undefined {
  if (!locale) return undefined;
  try {
    return Intl.getCanonicalLocales(locale)[0];
  } catch {
    return undefined;
  }
}

export function formatReportDate(value: Date | string, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(safeLocale(locale), LONG_DATE);
}

export function formatDayKey(key: string, locale?: string): string {
  const date = parseDayKey(key);
  return date ? date.toLocaleDateString(safeLocale(locale), LONG_DATE) : key;
}

export function formatDayKeyShort(key: string, locale?: string): string {
  const date = parseDayKey(key);
  return date ? date.toLocaleDateString(safeLocale(locale), SHORT_DATE) : key;
}

// Buckets an instant into the day it falls on in the caller's timezone,
// expressed as the offset `Date#getTimezoneOffset` reports (minutes behind
// UTC). Must stay the inverse of `parseDayKey` for the client that sent the
// offset, so day labels round-trip without shifting.
export function dayKeyForOffset(date: Date, tzOffsetMinutes: number): string {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}
