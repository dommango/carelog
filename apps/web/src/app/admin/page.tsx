import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { createTemplate } from '@/lib/services/templates';
import { listTemplateUsage } from '@/lib/services/reports';
import { inviteUser, listAssignments } from '@/lib/services/invites';
import { listSchedules, createSchedule, deleteSchedule } from '@/lib/services/schedules';
import { createScheduleSchema, createTemplateSchema, inviteSchema } from '@/lib/zod';
import { EventCategory } from '@carelog/db';

const categories = Object.values(EventCategory);

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

  async function inviteAction(formData: FormData) {
    'use server';
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return;
    await inviteUser(adminActor, parsed.data);
    revalidatePath('/admin');
  }

  async function scheduleAction(formData: FormData) {
    'use server';

    const name = formData.get('name') as string;
    const recurrence = formData.get('recurrence') as 'daily' | 'weekly' | 'hourly';
    const time = formData.get('time') as string;
    const interval = parseInt(formData.get('interval') as string, 10);
    const days = formData.getAll('days') as string[];
    const windowMinutes = parseInt(formData.get('windowMinutes') as string, 10);
    const remindOffsets = (formData.get('remindOffsets') as string)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n));
    const templateId = (formData.get('templateId') as string) || undefined;
    const escalationAfter = parseInt(formData.get('escalationAfter') as string, 10);
    const escalationNotify = (formData.get('escalationNotify') as string)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const [hour, minute] = time.split(':').map((s) => parseInt(s, 10));

    let rrule = '';
    if (recurrence === 'daily') {
      rrule = `FREQ=DAILY;BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`;
    } else if (recurrence === 'weekly') {
      const byday = days.length > 0 ? days.join(',') : 'MO';
      rrule = `FREQ=WEEKLY;BYDAY=${byday};BYHOUR=${hour};BYMINUTE=${minute};BYSECOND=0`;
    } else if (recurrence === 'hourly') {
      rrule = `FREQ=HOURLY;INTERVAL=${interval || 1}`;
    }

    const escalation = escalationAfter > 0 && escalationNotify.length > 0
      ? { afterMinutes: escalationAfter, notify: escalationNotify, channel: 'sms' as const }
      : undefined;

    const parsed = createScheduleSchema.safeParse({
      patientId: patient.id,
      name,
      rrule,
      windowMinutes,
      remindOffsets,
      templateId,
      escalation,
    });
    if (!parsed.success) return;

    await createSchedule(adminActor, parsed.data);
    revalidatePath('/admin');
  }

  async function scheduleDeleteAction(formData: FormData) {
    'use server';
    const id = formData.get('id') as string;
    if (!id) return;
    await deleteSchedule(adminActor, id);
    revalidatePath('/admin');
  }

  async function templateAction(formData: FormData) {
    'use server';
    const defaultsRaw = formData.get('defaults') as string;
    let defaults: Record<string, unknown> = {};
    try {
      defaults = JSON.parse(defaultsRaw || '{}');
    } catch {
      return;
    }

    const parsed = createTemplateSchema.safeParse({
      name: formData.get('name'),
      category: formData.get('category'),
      defaults,
    });
    if (!parsed.success) return;

    await createTemplate(adminActor, parsed.data);
    revalidatePath('/admin');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="cc-serif text-[22px]">Admin</h1>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Invite caregiver</h2>
        <form action={inviteAction} className="space-y-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="cc-input"
          />
          <select name="role" required className="cc-input">
            <option value="caregiver">Caregiver</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <input type="hidden" name="patientId" value={patient.id} />
          <button
            type="submit"
            className="cc-btn cc-btn--primary"
          >
            Invite
          </button>
        </form>
      </section>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Caregivers</h2>
        <ul className="divide-y divide-line">
          {caregivers.map((assignment) => (
            <li
              key={assignment.id}
              className="py-2 flex items-center justify-between"
            >
              <span>{assignment.user.name ?? assignment.user.email}</span>
              <span className="text-sm text-ink-faint">{assignment.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">New template</h2>
        <form action={templateAction} className="space-y-3">
          <input
            name="name"
            placeholder="Template name"
            required
            className="cc-input"
          />
          <select name="category" required className="cc-input">
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            name="defaults"
            placeholder='JSON defaults, e.g. {"medication":"Albuterol"}'
            rows={3}
            className="cc-input"
          />
          <button
            type="submit"
            className="cc-btn cc-btn--primary"
          >
            Create template
          </button>
        </form>
      </section>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">New schedule</h2>
        <form action={scheduleAction} className="space-y-3">
          <input
            name="name"
            placeholder="Schedule name, e.g. Morning nebulizer"
            required
            className="cc-input"
          />
          <select name="recurrence" required className="cc-input">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="hourly">Every N hours</option>
          </select>
          <input
            name="time"
            type="time"
            defaultValue="08:00"
            className="cc-input"
          />
          <div className="flex flex-wrap gap-2">
            {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((d) => (
              <label key={d} className="text-sm font-semibold text-ink-soft">
                <input type="checkbox" name="days" value={d} /> {d}
              </label>
            ))}
          </div>
          <input
            name="interval"
            type="number"
            min={1}
            placeholder="Interval (hours, for hourly only)"
            className="cc-input"
          />
          <input
            name="windowMinutes"
            type="number"
            min={1}
            defaultValue={90}
            placeholder="Window minutes"
            className="cc-input"
          />
          <input
            name="remindOffsets"
            placeholder="Reminder offsets in minutes, e.g. 0,15"
            defaultValue="0"
            className="cc-input"
          />
          <select name="templateId" className="cc-input">
            <option value="">No linked template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.category})
              </option>
            ))}
          </select>
          <input
            name="escalationAfter"
            type="number"
            min={0}
            placeholder="Escalate after N minutes"
            className="cc-input"
          />
          <input
            name="escalationNotify"
            placeholder="Escalation user IDs, comma separated"
            className="cc-input"
          />
          <button
            type="submit"
            className="cc-btn cc-btn--primary"
          >
            Create schedule
          </button>
        </form>
      </section>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Templates</h2>
        <ul className="divide-y divide-line">
          {templates.map((template) => (
            <li
              key={template.id}
              className="py-2 flex items-center justify-between"
            >
              <div>
                <span>{template.name}</span>
                <span className="ml-2 text-sm text-ink-faint">{template.category}</span>
              </div>
              <span className="text-sm text-ink-faint">{template.usageCount} uses</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="cc-card">
        <h2 className="cc-eyebrow mb-3">Schedules</h2>
        <ul className="divide-y divide-line">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="py-2 flex items-center justify-between"
            >
              <div>
                <span>{schedule.name}</span>
                <span className="ml-2 text-sm text-ink-faint">{schedule.rrule}</span>
              </div>
              <form action={scheduleDeleteAction}>
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
      </section>
    </div>
  );
}
