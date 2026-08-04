import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listSchedules, expandSchedule } from '@/lib/services/schedules';
import { hasAnyEvent } from '@/lib/services/events';
import { listAssignments } from '@/lib/services/invites';
import { listPatients } from '@/lib/services/patients';
import { buildOnboardingChecklist, type OnboardingChecklist as Checklist } from '@/lib/onboarding-checklist';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { RemindersToggle } from '@/components/RemindersToggle';
import Timeline from '@/components/Timeline';
import Link from 'next/link';

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (!actor) {
    redirect('/onboarding');
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

  // Admins only, and not just for tidiness: listAssignments is gated on
  // `user:invite`, so a caregiver calling it throws and 500s this page. Two of
  // the four items are also actions `can()` refuses to non-admins, so showing
  // them a checklist they cannot finish would be a lie.
  let checklist: Checklist | null = null;
  if (actor.role === 'admin') {
    const [hasEvent, assignments] = await Promise.all([
      hasAnyEvent(actor),
      listAssignments(actor, actor.assignment.patientId),
    ]);

    checklist = buildOnboardingChecklist({
      hasEvent,
      hasSchedule: schedules.length > 0,
      // The founder's own assignment is always in this list.
      hasOtherCaregiver: assignments.length > 1,
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {checklist && <OnboardingChecklist checklist={checklist} />}

      {upcoming.length > 0 && (
        <section className="cc-card">
          <h2 className="cc-eyebrow mb-[9px]">Upcoming</h2>
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
                  className="cc-badge"
                  style={
                    item.inWindow
                      ? { background: 'var(--covered-tint)', color: 'var(--covered-ink)' }
                      : { background: 'var(--card-sunk)', color: 'var(--ink-soft)' }
                  }
                >
                  <span className="cc-dot" />
                  {item.schedule.name} · {item.dueAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {item.inWindow && ' · now'}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <RemindersToggle />

      <Timeline />
    </div>
  );
}
