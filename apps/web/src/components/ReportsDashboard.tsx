'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import Link from 'next/link';

type AdherenceRow = {
  scheduleId: string;
  scheduleName: string;
  scheduled: number;
  logged: number;
  onTime: number;
  missed: number;
  onTimePercent: number;
};

type MoodPoint = {
  date: string;
  averageMood: number | null;
  count: number;
  incidents: number;
  painFlags: number;
};

type MealHydrationDay = {
  date: string;
  meals: number;
  hydration: number;
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

function formatDateLocal(iso: string) {
  return new Date(iso).toLocaleDateString();
}

function buildQuery(patientId: string | undefined, start: string, end: string) {
  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  params.set('start', new Date(start).toISOString());
  params.set('end', new Date(end).toISOString());
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

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/summary?${buildQuery(patientId, start, end)}`);
      if (!res.ok) throw new Error('Failed to load reports');
      const json = (await res.json()) as SummaryData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function downloadUrl(format: 'csv' | 'pdf') {
    return `/api/reports/export?format=${format}&${buildQuery(patientId, start, end)}`;
  }

  const moodData = data.mood.map((d) => ({
    ...d,
    averageMood: d.averageMood ?? 0,
  }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="cc-serif text-[22px]">Reports</h1>
          <p className="text-sm text-ink-faint">Aggregates include only confirmed events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="cc-input"
            style={{ padding: '8px 12px', minWidth: 0 }}
          />
          <span className="text-ink-faint">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="cc-input"
            style={{ padding: '8px 12px', minWidth: 0 }}
          />
          <button onClick={loadData} disabled={loading} className="cc-btn cc-btn--primary cc-btn--sm">
            {loading ? 'Loading…' : 'Update'}
          </button>
          <a href={downloadUrl('csv')} className="cc-btn cc-btn--secondary cc-btn--sm">
            Download CSV
          </a>
          <a href={downloadUrl('pdf')} className="cc-btn cc-btn--secondary cc-btn--sm">
            Download PDF
          </a>
        </div>
      </div>

      {error && (
        <div className="cc-card" style={{ background: 'var(--alert-tint)', border: '1px solid var(--accent-tint)', boxShadow: 'none', color: 'var(--accent-deep)' }}>
          {error}
        </div>
      )}

      <section className="cc-card">
        <div className="cc-eyebrow mb-3">Adherence</div>
        {data.adherence.length === 0 ? (
          <p className="text-ink-faint">No active schedules in this range.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.adherence.map((row) => (
              <div key={row.scheduleId} className="cc-card cc-card--sunk">
                <div className="text-sm font-bold text-ink">{row.scheduleName}</div>
                <div className="cc-serif cc-mono mt-1.5 text-2xl text-accent-deep">{row.onTimePercent}%</div>
                <div className="text-sm text-ink-faint">on time</div>
                <div className="mt-1.5 text-sm text-ink-soft">
                  {row.logged} / {row.scheduled} logged · {row.missed} missed
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cc-card">
        <div className="cc-eyebrow mb-3">Mood trend</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={moodData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e0d1" />
              <XAxis dataKey="date" stroke="#9b9284" tick={{ fill: '#9b9284', fontSize: 12 }} />
              <YAxis domain={[1, 5]} allowDecimals stroke="#9b9284" tick={{ fill: '#9b9284', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#fffdf9',
                  border: '1px solid #e9e0d1',
                  borderRadius: 10,
                  fontFamily: 'Mulish, sans-serif',
                }}
              />
              <Line
                type="monotone"
                dataKey="averageMood"
                stroke="#d2694a"
                strokeWidth={2}
                dot={{ r: 4, fill: '#d2694a' }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-eyebrow mb-3">Meals &amp; hydration</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.mealHydration}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e9e0d1" />
              <XAxis dataKey="date" stroke="#9b9284" tick={{ fill: '#9b9284', fontSize: 12 }} />
              <YAxis allowDecimals={false} stroke="#9b9284" tick={{ fill: '#9b9284', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  background: '#fffdf9',
                  border: '1px solid #e9e0d1',
                  borderRadius: 10,
                  fontFamily: 'Mulish, sans-serif',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12.5, fontWeight: 700, color: '#6d655a' }} />
              <Bar dataKey="meals" fill="#b08968" radius={[4, 4, 0, 0]} />
              <Bar dataKey="hydration" fill="#6d8190" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="cc-card">
        <div className="cc-eyebrow mb-3">Incidents</div>
        {data.incidents.length === 0 ? (
          <p className="text-ink-faint">No incidents recorded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.incidents.map((item) => (
              <li key={item.id} className="py-2.5 text-sm text-ink">
                <span className="text-ink-faint">{formatDateLocal(item.occurredAt)}</span>
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
          <div className="cc-eyebrow">Event log</div>
          <Link href="/" className="text-sm font-bold text-accent-deep hover:text-accent">
            View timeline
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {data.timeline.slice(0, 20).map((event) => (
            <li key={event.id} className="py-2.5 text-sm text-ink">
              <span className="text-ink-faint">{formatDateLocal(event.occurredAt)}</span>
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
