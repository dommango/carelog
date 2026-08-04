import { redirect } from 'next/navigation';
import { EventCategory } from '@carelog/db';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { listTemplateUsage } from '@/lib/services/reports';
import { listAssignments } from '@/lib/services/invites';
import { listSchedules } from '@/lib/services/schedules';
import { describeRrule } from '@/lib/rrule-describe';
import { categoryMeta } from '@/lib/categoryTheme';
import { Icon } from '@/components/Icon';
import { InviteForm } from '@/components/admin/InviteForm';
import { TemplateForm } from '@/components/admin/TemplateForm';
import { ScheduleForm } from '@/components/admin/ScheduleForm';
import { ScheduleRow } from '@/components/admin/ScheduleRow';

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const actor = await getActor(session.user.id as string);
  if (!actor || actor.role !== 'admin') {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-accent-deep">Admin access only.</div>
    );
  }

  const adminActor = actor;

  const [patient] = await listPatients(adminActor);
  const templates = await listTemplateUsage(adminActor);
  const schedules = await listSchedules(adminActor);

  const caregivers = await listAssignments(adminActor, patient.id);

  const templateOptions = templates.map((t) => ({
    id: t.id,
    label: `${t.name} · ${categoryMeta(t.category).label}`,
  }));

  const categoryOptions = Object.values(EventCategory).map((category) => ({
    id: category,
    label: categoryMeta(category).label,
  }));

  const caregiverOptions = caregivers.map((assignment) => ({
    id: assignment.userId,
    label: assignment.user.name ?? assignment.user.email ?? 'Caregiver',
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="cc-serif text-[22px]">Admin</h1>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">How this fits together</h2>
        <ol className="space-y-2.5">
          <li className="flex gap-3">
            <span className="shrink-0 pt-0.5" style={{ color: 'var(--accent)' }}>
              <Icon name="pill" size={18} />
            </span>
            <span className="text-[14px] text-ink-soft">
              <strong className="text-ink">Templates</strong> are shortcuts for the things you log
              over and over. Make one for “Morning nebulizer” and logging it becomes a single tap
              instead of a sentence.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 pt-0.5" style={{ color: 'var(--accent)' }}>
              <Icon name="clock" size={18} />
            </span>
            <span className="text-[14px] text-ink-soft">
              <strong className="text-ink">Schedules</strong> say when that should happen. They are
              what produces reminders, what marks something missed, and what the adherence numbers
              in Reports are measured against.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 pt-0.5" style={{ color: 'var(--accent)' }}>
              <Icon name="users" size={18} />
            </span>
            <span className="text-[14px] text-ink-soft">
              <strong className="text-ink">Caregivers</strong> are everyone who shares the log. A
              schedule can text one of them if a dose goes unlogged.
            </span>
          </li>
        </ol>
        <p className="mt-3 text-[13px] font-semibold text-ink-faint">
          You do not need all three. A template on its own is useful; add a schedule when you want
          to be reminded.
        </p>
      </section>

      <section id="templates" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-1">Templates</h2>
        <p className="mb-3 text-[13px] font-semibold text-ink-soft">
          One-tap shortcuts for the care you log most.
        </p>

        {templates.length === 0 ? (
          <p className="text-[14px] text-ink-soft">No templates yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="text-[14px] font-bold text-ink">{template.name}</span>
                  <span className="ml-2 text-sm text-ink-faint">
                    {categoryMeta(template.category).label}
                  </span>
                </div>
                <span className="shrink-0 text-sm text-ink-faint">
                  {template.usageCount === 1 ? '1 use' : `${template.usageCount} uses`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="new-template" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-3">New template</h2>
        <TemplateForm categories={categoryOptions} />
      </section>

      <section id="schedules" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-1">Schedules</h2>
        <p className="mb-3 text-[13px] font-semibold text-ink-soft">
          When care is expected — the source of reminders and adherence.
        </p>

        {schedules.length === 0 ? (
          <p className="text-[14px] text-ink-soft">
            No schedules yet, so nothing is being reminded or tracked for adherence.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <span className="block text-[14px] font-bold text-ink">{schedule.name}</span>
                  <span className="block text-sm text-ink-faint">
                    {describeRrule(schedule.rrule)}
                  </span>
                </div>
                <form action={scheduleDeleteAction} className="shrink-0">
                  <input type="hidden" name="id" value={schedule.id} />
                  <button
                    type="submit"
                    className="text-sm font-bold text-accent-deep hover:underline"
                  >
                    Pause
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="new-schedule" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-3">New schedule</h2>
        <ScheduleForm
          action={scheduleAction}
          templates={templateOptions}
          caregivers={caregiverOptions}
        />
      </section>

      <section id="caregivers" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-1">Caregivers</h2>
        <p className="mb-3 text-[13px] font-semibold text-ink-soft">
          Everyone who shares this log.
        </p>
        <ul className="divide-y divide-line">
          {caregivers.map((assignment) => (
            <li key={assignment.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-[14px] text-ink">
                {assignment.user.name ?? assignment.user.email}
              </span>
              <span className="shrink-0 text-sm text-ink-faint">{assignment.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="invite-caregiver" className="cc-card scroll-mt-4">
        <h2 className="cc-eyebrow mb-3">Invite caregiver</h2>
        <InviteForm action={inviteAction} patientId={patient.id} />
      </section>
    </div>
  );
}
