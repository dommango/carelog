import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listSchedules, expandSchedule } from '@/lib/services/schedules';
import Timeline from '@/components/Timeline';
import Link from 'next/link';

export default async function HomePage() {
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

  const schedules = await listSchedules(actor);
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const horizonStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const upcoming = schedules.flatMap((schedule) => {
    const occurrences = expandSchedule(schedule, horizonStart, horizonEnd);
    return occurrences.map((o) => ({
      schedule,
      ...o,
      inWindow: now >= o.windowStart && now <= o.windowEnd,
    }));
  });

  upcoming.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {upcoming.length > 0 && (
        <section className="bg-white p-4 rounded-lg border">
          <h2 className="font-medium mb-3">Upcoming</h2>
          <div className="flex flex-wrap gap-2">
            {upcoming.slice(0, 6).map((item) => {
              const params = new URLSearchParams();
              if (item.schedule.templateId) params.set('templateId', item.schedule.templateId);
              params.set('scheduleId', item.schedule.id);
              params.set('dueAt', item.dueAt.toISOString());

              return (
                <Link
                  key={`${item.schedule.id}-${item.dueAt.toISOString()}`}
                  href={`/events/new?${params.toString()}`}
                  className={`px-3 py-1.5 rounded-full text-sm ${
                    item.inWindow
                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {item.schedule.name} · {item.dueAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {item.inWindow && ' · now'}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <Timeline />
    </div>
  );
}
