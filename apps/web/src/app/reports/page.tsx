import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import {
  getAdherence,
  getMoodTrends,
  getMealHydrationSummary,
  getIncidents,
  getTimeline,
} from '@/lib/services/reports';
import ReportsDashboard from '@/components/ReportsDashboard';
import { toDateInputValue } from '@/components/reports/report-dates';

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    redirect('/onboarding');
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const start = new Date(year, month, day - 6);
  const end = new Date(year, month, day, 23, 59, 59, 999);

  const query = {
    patientId: actor.assignment.patientId,
    start: start.toISOString(),
    end: end.toISOString(),
  };

  const [adherence, mood, mealHydration, incidents, timeline] = await Promise.all([
    getAdherence(actor, query),
    getMoodTrends(actor, query),
    getMealHydrationSummary(actor, query),
    getIncidents(actor, query),
    getTimeline(actor, query),
  ]);

  const initialData = {
    adherence,
    mood,
    mealHydration,
    incidents: incidents.map((i) => ({ ...i, occurredAt: i.occurredAt.toISOString() })),
    timeline: timeline.map((t) => ({ ...t, occurredAt: t.occurredAt.toISOString() })),
  };

  return (
    <ReportsDashboard
      patientId={actor.assignment.patientId}
      initialStart={toDateInputValue(start)}
      initialEnd={toDateInputValue(end)}
      initialData={initialData}
    />
  );
}
