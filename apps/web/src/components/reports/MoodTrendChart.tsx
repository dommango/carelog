'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MoodPoint } from '@/lib/services/reports';
import { themeColors } from '@/lib/theme-colors';
import { formatDayKey, formatDayKeyShort } from './report-dates';
import { summarizeMood } from './mood-summary';
import ChartDataTable from './ChartDataTable';
import { axisTick, gridStroke, tooltipStyles } from './chart-theme';

export default function MoodTrendChart({ mood }: { mood: MoodPoint[] }) {
  const summary = summarizeMood(mood);
  const plotted = mood.filter((point) => point.averageMood !== null);

  const description =
    summary.average === null
      ? 'Line chart of average daily mood. No mood was recorded in this range.'
      : `Line chart of average daily mood on a scale of 1 to 5. Average ${summary.average}. ` +
        `Lowest ${summary.lowest!.value} on ${formatDayKey(summary.lowest!.date)}. ` +
        `Highest ${summary.highest!.value} on ${formatDayKey(summary.highest!.date)}.`;

  return (
    <section className="cc-card">
      <h2 className="cc-eyebrow mb-1">Mood trend</h2>
      <p className="text-sm text-ink-soft">Average mood each day, from 1 (worst) to 5 (best).</p>

      {summary.average === null ? (
        <p className="mt-3 text-ink-soft">No mood was recorded in this range.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-ink-soft">
            Average <span className="font-bold text-ink">{summary.average}</span> · lowest{' '}
            <span className="font-bold text-ink">{summary.lowest!.value}</span> on{' '}
            {formatDayKey(summary.lowest!.date)} · highest{' '}
            <span className="font-bold text-ink">{summary.highest!.value}</span> on{' '}
            {formatDayKey(summary.highest!.date)}
          </p>

          <div className="mt-3 h-72" role="img" aria-label={description}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={plotted} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => formatDayKeyShort(value)}
                  stroke={themeColors.inkSoft}
                  tick={axisTick}
                  tickMargin={8}
                />
                <YAxis
                  domain={[1, 5]}
                  ticks={[1, 2, 3, 4, 5]}
                  stroke={themeColors.inkSoft}
                  tick={axisTick}
                  tickMargin={8}
                  width={32}
                />
                <Tooltip
                  {...tooltipStyles}
                  labelFormatter={(value) => formatDayKey(String(value))}
                />
                <Line
                  type="monotone"
                  dataKey="averageMood"
                  name="Average mood"
                  stroke={themeColors.accent}
                  strokeWidth={2}
                  dot={{ r: 4, fill: themeColors.accent, stroke: themeColors.card, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <ChartDataTable
        label="Show mood as a table"
        caption="Average mood and number of entries for each day in the selected range."
        rows={mood}
        rowKey={(row) => row.date}
        columns={[
          { key: 'date', label: 'Day', value: (row) => formatDayKey(row.date) },
          {
            key: 'mood',
            label: 'Average mood',
            value: (row) => (row.averageMood === null ? 'Not recorded' : `${row.averageMood}`),
          },
          { key: 'count', label: 'Entries', value: (row) => `${row.count}` },
        ]}
      />
    </section>
  );
}
