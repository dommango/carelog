'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MealHydrationDay, MoodPoint } from '@/lib/services/reports';
import MoodTrendChart from './reports/MoodTrendChart';
import MealHydrationChart from './reports/MealHydrationChart';
import { formatReportDate, parseDayKey } from './reports/report-dates';

type AdherenceRow = {
  scheduleId: string;
  scheduleName: string;
  scheduled: number;
  logged: number;
  onTime: number;
  missed: number;
  onTimePercent: number;
};

type IncidentItem = {
  id: string;
  occurredAt: string;
  category: string | null;
  rawInput: string | null;
  aiFlags: string[];
};

type SummaryData = {
  adherence: AdherenceRow[];
  mood: MoodPoint[];
  mealHydration: MealHydrationDay[];
  incidents: IncidentItem[];
  timeline: Array<{
    id: string;
    occurredAt: string;
    category: string | null;
    status: string;
    rawInput: string | null;
    authorName: string | null;
  }>;
};

const LOAD_ERROR =
  'Couldn’t load the report. Check your connection and try Update again.';

function rangeBounds(start: string, end: string) {
  const startDate = parseDayKey(start) ?? new Date(start);
  const endDate = parseDayKey(end) ?? new Date(end);
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);
  return { start: startDate, end: endOfDay };
}

function buildQuery(patientId: string | undefined, start: string, end: string) {
  const bounds = rangeBounds(start, end);
  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  params.set('start', bounds.start.toISOString());
  params.set('end', bounds.end.toISOString());
  return params.toString();
}

export default function ReportsDashboard({
  patientId,
  initialStart,
  initialEnd,
  initialData,
}: {
  patientId: string | undefined;
  initialStart: string;
  initialEnd: string;
  initialData: SummaryData;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [data, setData] = useState<SummaryData>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownRange, setShownRange] = useState({ start: initialStart, end: initialEnd });

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/summary?${buildQuery(patientId, start, end)}`);
      if (!res.ok) throw new Error(LOAD_ERROR);
      const json = (await res.json()) as SummaryData;
      setData(json);
      setShownRange({ start, end });
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function downloadUrl(format: 'csv' | 'pdf') {
    return `/api/reports/export?format=${format}&${buildQuery(patientId, start, end)}`;
  }

  const status = loading
    ? 'Updating the report…'
    : `Showing ${formatReportDate(shownRange.start)} to ${formatReportDate(shownRange.end)}.`;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="cc-serif text-[22px]">Reports</h1>
          <p className="text-sm text-ink-soft">Aggregates include only confirmed events.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="report-start" className="cc-field-label">
              From
            </label>
            <input
              id="report-start"
              type="date"
              value={start}
              max={end}
              onChange={(e) => setStart(e.target.value)}
              className="cc-input"
              style={{ minWidth: 0 }}
            />
          </div>
          <div>
            <label htmlFor="report-end" className="cc-field-label">
              To
            </label>
            <input
              id="report-end"
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="cc-input"
              style={{ minWidth: 0 }}
            />
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            aria-busy={loading}
            className="cc-btn cc-btn--primary cc-btn--sm"
          >
            {loading ? 'Updating…' : 'Update'}
          </button>
          <a href={downloadUrl('csv')} className="cc-btn cc-btn--secondary cc-btn--sm">
            Download CSV
          </a>
          <a href={downloadUrl('pdf')} className="cc-btn cc-btn--secondary cc-btn--sm">
            Download PDF
          </a>
        </div>

        <p role="status" className="text-sm text-ink-soft">
          {status}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="cc-card"
          style={{
            background: 'var(--alert-tint)',
            border: '1px solid var(--accent-tint)',
            boxShadow: 'none',
            color: 'var(--accent-deep)',
          }}
        >
          {error}
        </div>
      )}

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Adherence</h2>
        {data.adherence.length === 0 ? (
          <p className="text-ink-soft">No active schedules in this range.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.adherence.map((row) => (
              <div key={row.scheduleId} className="cc-card cc-card--sunk">
                <div className="text-sm font-bold text-ink">{row.scheduleName}</div>
                <div className="cc-serif cc-mono mt-1.5 text-2xl text-accent-deep">
                  {row.onTimePercent}%
                </div>
                <div className="text-sm text-ink-soft">on time</div>
                <div className="mt-1.5 text-sm text-ink-soft">
                  {row.logged} / {row.scheduled} logged · {row.missed} missed
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <MoodTrendChart mood={data.mood} />

      <MealHydrationChart days={data.mealHydration} />

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Incidents</h2>
        {data.incidents.length === 0 ? (
          <p className="text-ink-soft">No incidents recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.incidents.map((item) => (
              <li key={item.id} className="py-2.5 text-sm text-ink">
                <span className="text-ink-soft">{formatReportDate(item.occurredAt)}</span>
                {' · '}
                <span className="font-bold">{item.category ?? 'note'}</span>
                {' · '}
                {item.rawInput ?? ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cc-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="cc-eyebrow">Event log</h2>
          <Link href="/" className="text-sm font-bold text-accent-deep hover:underline">
            View timeline
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {data.timeline.slice(0, 20).map((event) => (
            <li key={event.id} className="py-2.5 text-sm text-ink">
              <span className="text-ink-soft">{formatReportDate(event.occurredAt)}</span>
              {' · '}
              <span className="font-bold">{event.category ?? 'note'}</span>
              {' · '}
              {event.authorName ?? 'Unknown'}
              {' · '}
              {event.rawInput ?? ''}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
