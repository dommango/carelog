import { RRule } from 'rrule';

export type ScheduleOccurrence = {
  dueAt: Date;
  windowStart: Date;
  windowEnd: Date;
};

export function expandSchedule(
  schedule: { rrule: string; windowMinutes: number },
  start: Date,
  end: Date
): ScheduleOccurrence[] {
  const rule = RRule.fromString(schedule.rrule);
  const dues = rule.between(start, end, true);
  const halfWindow = Math.floor(schedule.windowMinutes / 2);

  return dues.map((dueAt) => ({
    dueAt,
    windowStart: new Date(dueAt.getTime() - halfWindow * 60_000),
    windowEnd: new Date(dueAt.getTime() + halfWindow * 60_000),
  }));
}
