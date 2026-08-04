'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MealHydrationDay } from '@/lib/services/reports';
import { themeColors } from '@/lib/theme-colors';
import { formatDayKey, formatDayKeyShort } from './report-dates';
import ChartDataTable from './ChartDataTable';
import { axisTick, gridStroke, seriesColors, tooltipStyles } from './chart-theme';

function total(days: readonly MealHydrationDay[], key: 'meals' | 'hydration') {
  return days.reduce((sum, day) => sum + day[key], 0);
}

export default function MealHydrationChart({ days }: { days: MealHydrationDay[] }) {
  const meals = total(days, 'meals');
  const hydration = total(days, 'hydration');

  const description =
    `Grouped bar chart of meals and drinks logged each day. ` +
    `${meals} meals and ${hydration} drinks across ${days.length} days.`;

  return (
    <section className="cc-card">
      <h2 className="cc-eyebrow mb-1">Meals &amp; hydration</h2>
      <p className="text-sm text-ink-soft">Number of meals and drinks logged each day.</p>

      {days.length === 0 ? (
        <p className="mt-3 text-ink-soft">No meals or drinks were logged in this range.</p>
      ) : (
        <div className="mt-3 h-72" role="img" aria-label={description}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={days} barGap={2} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatDayKeyShort(value)}
                stroke={themeColors.inkSoft}
                tick={axisTick}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={false}
                stroke={themeColors.inkSoft}
                tick={axisTick}
                tickMargin={8}
                width={32}
              />
              <Tooltip
                {...tooltipStyles}
                cursor={{ fill: themeColors.line, fillOpacity: 0.4 }}
                labelFormatter={(value) => formatDayKey(String(value))}
              />
              <Legend
                wrapperStyle={{ fontSize: 13, paddingTop: 8 }}
                formatter={(value: string) => (
                  <span style={{ color: themeColors.inkSoft, fontWeight: 700 }}>{value}</span>
                )}
              />
              <Bar
                dataKey="meals"
                name="Meals"
                fill={seriesColors.meals}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                dataKey="hydration"
                name="Drinks"
                fill={seriesColors.hydration}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <ChartDataTable
        label="Show meals and drinks as a table"
        caption="Meals and drinks logged for each day in the selected range."
        rows={days}
        rowKey={(row) => row.date}
        columns={[
          { key: 'date', label: 'Day', value: (row) => formatDayKey(row.date) },
          { key: 'meals', label: 'Meals', value: (row) => `${row.meals}` },
          { key: 'hydration', label: 'Drinks', value: (row) => `${row.hydration}` },
        ]}
      />
    </section>
  );
}
