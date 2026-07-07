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
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-gray-500">Aggregates include only confirmed events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="border rounded p-2 text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="border rounded p-2 text-sm"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Update'}
          </button>
          <a
            href={downloadUrl('csv')}
            className="bg-white border px-4 py-2 rounded text-sm hover:bg-gray-50"
          >
            Download CSV
          </a>
          <a
            href={downloadUrl('pdf')}
            className="bg-white border px-4 py-2 rounded text-sm hover:bg-gray-50"
          >
            Download PDF
          </a>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200">{error}</div>
      )}

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Adherence</h2>
        {data.adherence.length === 0 ? (
          <p className="text-gray-500">No active schedules in this range.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.adherence.map((row) => (
              <div key={row.scheduleId} className="border rounded p-4">
                <div className="font-medium">{row.scheduleName}</div>
                <div className="mt-2 text-2xl font-semibold">{row.onTimePercent}%</div>
                <div className="text-sm text-gray-500">on time</div>
                <div className="mt-2 text-sm text-gray-600">
                  {row.logged} / {row.scheduled} logged · {row.missed} missed
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Mood Trend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={moodData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[1, 5]} allowDecimals />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="averageMood"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Meals & Hydration</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.mealHydration}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="meals" fill="#3b82f6" />
              <Bar dataKey="hydration" fill="#06b6d4" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Incidents</h2>
        {data.incidents.length === 0 ? (
          <p className="text-gray-500">No incidents recorded.</p>
        ) : (
          <ul className="divide-y">
            {data.incidents.map((item) => (
              <li key={item.id} className="py-2 text-sm">
                <span className="text-gray-500">{formatDateLocal(item.occurredAt)}</span>
                {' · '}
                <span className="font-medium">{item.category ?? 'note'}</span>
                {' · '}
                {item.rawInput ?? ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium">Event Log</h2>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            View timeline
          </Link>
        </div>
        <ul className="divide-y">
          {data.timeline.slice(0, 20).map((event) => (
            <li key={event.id} className="py-2 text-sm">
              <span className="text-gray-500">{formatDateLocal(event.occurredAt)}</span>
              {' · '}
              <span className="font-medium">{event.category ?? 'note'}</span>
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
