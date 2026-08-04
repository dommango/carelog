import { prisma } from '@/lib/prisma';
import { Actor, can } from '@/lib/policy';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { ReportQueryInput } from '@/lib/zod';
import { expandSchedule } from '@/lib/services/schedules';
import { EventCategory, EventStatus, Prisma } from '@carelog/db';
import { dayKeyForOffset } from '@/components/reports/report-dates';

export type TimelineFilters = {
  category?: EventCategory;
  authorId?: string;
};

export type TimelineEvent = {
  id: string;
  category: EventCategory | null;
  status: EventStatus;
  occurredAt: Date;
  rawInput: string | null;
  structuredData: Prisma.JsonValue | null;
  authorName: string | null;
  scheduleName: string | null;
  templateName: string | null;
  aiFlags: string[];
};

export type AdherenceResult = {
  scheduleId: string;
  scheduleName: string;
  scheduled: number;
  logged: number;
  onTime: number;
  missed: number;
  onTimePercent: number;
  occurrences: Array<{
    dueAt: Date;
    windowStart: Date;
    windowEnd: Date;
    loggedAt: Date | null;
    onTime: boolean;
  }>;
};

export type MoodPoint = {
  date: string;
  averageMood: number | null;
  count: number;
  incidents: number;
  painFlags: number;
};

export type MealHydrationDay = {
  date: string;
  meals: number;
  hydration: number;
};

export type IncidentItem = {
  id: string;
  occurredAt: Date;
  category: EventCategory | null;
  rawInput: string | null;
  aiFlags: string[];
};

export type DoctorVisitExport = {
  patient: { id: string; name: string };
  range: { start: Date; end: Date };
  adherence: AdherenceResult[];
  mood: MoodPoint[];
  mealHydration: MealHydrationDay[];
  incidents: IncidentItem[];
  timeline: TimelineEvent[];
  needsReviewCount: number;
};

function resolvePatientId(actor: Actor, input: ReportQueryInput): string {
  const patientId = input.patientId ?? actor.assignment.patientId;
  if (!can(actor, 'report:read', { type: 'report', patientId })) {
    throw new ForbiddenError();
  }
  return patientId;
}

function toDateRange(input: ReportQueryInput): { start: Date; end: Date } {
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new NotFoundError('Invalid date range');
  }
  return { start, end };
}

function confirmedEventWhere(
  patientId: string,
  range: { start: Date; end: Date }
): Prisma.CareEventWhereInput {
  return {
    patientId,
    deletedAt: null,
    status: EventStatus.confirmed,
    occurredAt: { gte: range.start, lte: range.end },
  };
}

export async function getTimeline(
  actor: Actor,
  input: ReportQueryInput,
  filters: TimelineFilters = {}
): Promise<TimelineEvent[]> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);

  const where: Prisma.CareEventWhereInput = {
    patientId,
    deletedAt: null,
    occurredAt: { gte: range.start, lte: range.end },
  };

  if (filters.category) {
    where.category = filters.category;
  }
  if (filters.authorId) {
    where.authorId = filters.authorId;
  }

  const events = await prisma.careEvent.findMany({
    where,
    orderBy: { occurredAt: 'asc' },
    include: {
      author: { select: { name: true } },
      schedule: { select: { name: true } },
      template: { select: { name: true } },
    },
  });

  return events.map((e) => ({
    id: e.id,
    category: e.category,
    status: e.status,
    occurredAt: e.occurredAt,
    rawInput: e.rawInput,
    structuredData: e.structuredData,
    authorName: e.author.name,
    scheduleName: e.schedule?.name ?? null,
    templateName: e.template?.name ?? null,
    aiFlags: e.aiFlags,
  }));
}

export async function getAdherence(
  actor: Actor,
  input: ReportQueryInput
): Promise<AdherenceResult[]> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);

  const schedules = await prisma.schedule.findMany({
    where: { patientId, status: 'active', deletedAt: null },
  });

  const confirmedEvents = await prisma.careEvent.findMany({
    where: {
      ...confirmedEventWhere(patientId, range),
      scheduleId: { not: null },
    },
    orderBy: { occurredAt: 'asc' },
  });

  const results: AdherenceResult[] = [];

  for (const schedule of schedules) {
    const occurrences = expandSchedule(schedule, range.start, range.end);
    const mapped = occurrences.map((o) => {
      const match = confirmedEvents.find(
        (e) =>
          e.scheduleId === schedule.id &&
          e.occurredAt >= o.windowStart &&
          e.occurredAt <= o.windowEnd
      );
      return {
        dueAt: o.dueAt,
        windowStart: o.windowStart,
        windowEnd: o.windowEnd,
        loggedAt: match?.occurredAt ?? null,
        onTime: Boolean(match),
      };
    });

    const logged = mapped.filter((o) => o.loggedAt).length;
    const onTime = mapped.filter((o) => o.onTime).length;
    const scheduled = mapped.length;

    results.push({
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      scheduled,
      logged,
      onTime,
      missed: scheduled - logged,
      onTimePercent: scheduled > 0 ? Math.round((onTime / scheduled) * 100) : 100,
      occurrences: mapped,
    });
  }

  return results;
}

function getMoodScore(structuredData: Prisma.JsonValue | null): number | null {
  if (structuredData && typeof structuredData === 'object' && !Array.isArray(structuredData)) {
    const value = (structuredData as Record<string, unknown>).moodScore;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) return parsed;
    }
  }
  return null;
}

// Day buckets must land on the same calendar day the caller sees locally —
// the client sends its UTC offset alongside the range boundaries it computed.
function toDateKey(date: Date, tzOffsetMinutes = 0): string {
  return dayKeyForOffset(date, tzOffsetMinutes);
}

export async function getMoodTrends(
  actor: Actor,
  input: ReportQueryInput
): Promise<MoodPoint[]> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);
  const tz = input.tzOffsetMinutes ?? 0;

  const [moodEvents, incidentEvents] = await Promise.all([
    prisma.careEvent.findMany({
      where: {
        ...confirmedEventWhere(patientId, range),
        category: EventCategory.mood_behavior,
      },
      orderBy: { occurredAt: 'asc' },
    }),
    prisma.careEvent.findMany({
      where: {
        patientId,
        deletedAt: null,
        status: EventStatus.confirmed,
        occurredAt: { gte: range.start, lte: range.end },
        OR: [
          { category: EventCategory.incident },
          { aiFlags: { hasSome: ['incident', 'mentions_pain'] } },
        ],
      },
      orderBy: { occurredAt: 'asc' },
    }),
  ]);

  const byDay = new Map<string, { scores: number[]; incidents: number; painFlags: number }>();

  for (const event of moodEvents) {
    const key = toDateKey(event.occurredAt, tz);
    const bucket = byDay.get(key) ?? { scores: [], incidents: 0, painFlags: 0 };
    const score = getMoodScore(event.structuredData);
    if (score !== null) bucket.scores.push(score);
    byDay.set(key, bucket);
  }

  for (const event of incidentEvents) {
    const key = toDateKey(event.occurredAt, tz);
    const bucket = byDay.get(key) ?? { scores: [], incidents: 0, painFlags: 0 };
    bucket.incidents += event.category === EventCategory.incident ? 1 : 0;
    if (event.aiFlags.includes('mentions_pain')) bucket.painFlags += 1;
    byDay.set(key, bucket);
  }

  const points: MoodPoint[] = [];
  const cursor = new Date(range.start);
  while (cursor <= range.end) {
    const key = toDateKey(cursor, tz);
    const bucket = byDay.get(key);
    const avg = bucket?.scores.length
      ? Math.round((bucket.scores.reduce((a, b) => a + b, 0) / bucket.scores.length) * 10) / 10
      : null;
    points.push({
      date: key,
      averageMood: avg,
      count: bucket?.scores.length ?? 0,
      incidents: bucket?.incidents ?? 0,
      painFlags: bucket?.painFlags ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

export async function getMealHydrationSummary(
  actor: Actor,
  input: ReportQueryInput
): Promise<MealHydrationDay[]> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);
  const tz = input.tzOffsetMinutes ?? 0;

  const events = await prisma.careEvent.findMany({
    where: {
      ...confirmedEventWhere(patientId, range),
      category: { in: [EventCategory.meal, EventCategory.hydration] },
    },
    orderBy: { occurredAt: 'asc' },
  });

  const byDay = new Map<string, { meals: number; hydration: number }>();

  for (const event of events) {
    const key = toDateKey(event.occurredAt, tz);
    const bucket = byDay.get(key) ?? { meals: 0, hydration: 0 };
    if (event.category === EventCategory.meal) bucket.meals += 1;
    if (event.category === EventCategory.hydration) bucket.hydration += 1;
    byDay.set(key, bucket);
  }

  const summary: MealHydrationDay[] = [];
  const cursor = new Date(range.start);
  while (cursor <= range.end) {
    const key = toDateKey(cursor, tz);
    const bucket = byDay.get(key);
    summary.push({
      date: key,
      meals: bucket?.meals ?? 0,
      hydration: bucket?.hydration ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return summary;
}

export async function getIncidents(
  actor: Actor,
  input: ReportQueryInput
): Promise<IncidentItem[]> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);

  const events = await prisma.careEvent.findMany({
    where: {
      patientId,
      deletedAt: null,
      status: EventStatus.confirmed,
      occurredAt: { gte: range.start, lte: range.end },
      OR: [
        { category: EventCategory.incident },
        { aiFlags: { hasSome: ['incident', 'mentions_pain'] } },
      ],
    },
    orderBy: { occurredAt: 'desc' },
  });

  return events.map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    category: e.category,
    rawInput: e.rawInput,
    aiFlags: e.aiFlags,
  }));
}

export async function getDoctorVisitExport(
  actor: Actor,
  input: ReportQueryInput
): Promise<DoctorVisitExport> {
  const patientId = resolvePatientId(actor, input);
  const range = toDateRange(input);

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw new NotFoundError('Patient not found');

  const [adherence, mood, mealHydration, incidents, timeline, needsReviewCount] =
    await Promise.all([
      getAdherence(actor, input),
      getMoodTrends(actor, input),
      getMealHydrationSummary(actor, input),
      getIncidents(actor, input),
      getTimeline(actor, input),
      prisma.careEvent.count({
        where: {
          patientId,
          deletedAt: null,
          status: EventStatus.needs_review,
          occurredAt: { gte: range.start, lte: range.end },
        },
      }),
    ]);

  return {
    patient: { id: patient.id, name: patient.name },
    range,
    adherence,
    mood,
    mealHydration,
    incidents,
    timeline,
    needsReviewCount,
  };
}

export function exportToCsv(data: DoctorVisitExport): string {
  const lines: string[] = [];
  lines.push('CareLog Doctor Visit Report');
  lines.push(`Patient,${csvEscape(data.patient.name)}`);
  lines.push(
    `Range,${data.range.start.toISOString()},${data.range.end.toISOString()}`
  );
  lines.push(`Needs Review,${data.needsReviewCount}`);
  lines.push('');

  lines.push('Adherence');
  lines.push('Schedule,Scheduled,Logged,On Time,Missed,On-Time %');
  for (const row of data.adherence) {
    lines.push(
      [
        csvEscape(row.scheduleName),
        row.scheduled,
        row.logged,
        row.onTime,
        row.missed,
        `${row.onTimePercent}%`,
      ].join(',')
    );
  }
  lines.push('');

  lines.push('Mood Trends');
  lines.push('Date,Average Mood,Count,Incidents,Pain Flags');
  for (const row of data.mood) {
    lines.push(
      [row.date, row.averageMood ?? '', row.count, row.incidents, row.painFlags].join(',')
    );
  }
  lines.push('');

  lines.push('Meal / Hydration');
  lines.push('Date,Meals,Hydration');
  for (const row of data.mealHydration) {
    lines.push([row.date, row.meals, row.hydration].join(','));
  }
  lines.push('');

  lines.push('Incidents');
  lines.push('Date,Category,Raw Input');
  for (const row of data.incidents) {
    lines.push(
      [
        row.occurredAt.toISOString(),
        row.category ?? '',
        csvEscape(row.rawInput ?? ''),
      ].join(',')
    );
  }
  lines.push('');

  lines.push('Event Log');
  lines.push('Date,Category,Status,Author,Schedule,Template,Raw Input');
  for (const row of data.timeline) {
    lines.push(
      [
        row.occurredAt.toISOString(),
        row.category ?? '',
        row.status,
        csvEscape(row.authorName ?? ''),
        csvEscape(row.scheduleName ?? ''),
        csvEscape(row.templateName ?? ''),
        csvEscape(row.rawInput ?? ''),
      ].join(',')
    );
  }

  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function listTemplateUsage(actor: Actor) {
  if (!can(actor, 'template:read', { type: 'template', patientId: actor.assignment.patientId })) {
    throw new ForbiddenError();
  }

  const templates = await prisma.template.findMany({
    where: { patientId: actor.assignment.patientId, isActive: true },
    include: {
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return templates.map((t) => ({
    ...t,
    usageCount: t._count.events,
  }));
}
