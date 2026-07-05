import { expandSchedule } from '@carelog/queue';

export function resolveScheduleId(
  occurredAt: Date,
  suggestedScheduleId: string | null | undefined,
  schedules: Array<{ id: string; rrule: string; windowMinutes: number }>
): string | null {
  if (!suggestedScheduleId) return null;

  const schedule = schedules.find((s) => s.id === suggestedScheduleId);
  if (!schedule) return null;

  const start = new Date(occurredAt.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(occurredAt.getTime() + 24 * 60 * 60 * 1000);
  const occurrences = expandSchedule(schedule, start, end);

  return occurrences.some(
    (o) => occurredAt >= o.windowStart && occurredAt <= o.windowEnd
  )
    ? schedule.id
    : null;
}
