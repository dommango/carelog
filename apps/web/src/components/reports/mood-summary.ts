import type { MoodPoint } from '@/lib/services/reports';

export type MoodExtreme = { date: string; value: number };

export type MoodSummary = {
  daysWithData: number;
  totalEntries: number;
  average: number | null;
  lowest: MoodExtreme | null;
  highest: MoodExtreme | null;
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function summarizeMood(points: readonly MoodPoint[]): MoodSummary {
  const rated = points.filter(
    (point): point is MoodPoint & { averageMood: number } => point.averageMood !== null
  );

  const totalEntries = points.reduce((sum, point) => sum + point.count, 0);

  if (rated.length === 0) {
    return {
      daysWithData: 0,
      totalEntries,
      average: null,
      lowest: null,
      highest: null,
    };
  }

  const sum = rated.reduce((total, point) => total + point.averageMood, 0);

  const lowest = rated.reduce((best, point) =>
    point.averageMood < best.averageMood ? point : best
  );
  const highest = rated.reduce((best, point) =>
    point.averageMood > best.averageMood ? point : best
  );

  return {
    daysWithData: rated.length,
    totalEntries,
    average: round1(sum / rated.length),
    lowest: { date: lowest.date, value: round1(lowest.averageMood) },
    highest: { date: highest.date, value: round1(highest.averageMood) },
  };
}
