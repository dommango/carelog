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

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        You do not have access to a patient profile yet.
      </div>
    );
  }

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);

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
      initialStart={toDateInput(start)}
      initialEnd={toDateInput(end)}
      initialData={initialData}
    />
  );
}
