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
      <div className="max-w-2xl mx-auto p-8 text-red-600">Admin access only.</div>
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
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-xl font-semibold">Admin</h1>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Invite caregiver</h2>
        <form action={inviteAction} className="space-y-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full border rounded p-2"
          />
          <select name="role" required className="w-full border rounded p-2">
            <option value="caregiver">Caregiver</option>
            <option value="viewer">Viewer</option>
            <option value="admin">Admin</option>
          </select>
          <input type="hidden" name="patientId" value={patient.id} />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Invite
          </button>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Caregivers</h2>
        <ul className="divide-y">
          {caregivers.map((assignment) => (
            <li
              key={assignment.id}
              className="py-2 flex items-center justify-between"
            >
              <span>{assignment.user.name ?? assignment.user.email}</span>
              <span className="text-sm text-gray-500">{assignment.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">New template</h2>
        <form action={templateAction} className="space-y-3">
          <input
            name="name"
            placeholder="Template name"
            required
            className="w-full border rounded p-2"
          />
          <select name="category" required className="w-full border rounded p-2">
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
            className="w-full border rounded p-2"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create template
          </button>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">New schedule</h2>
        <form action={scheduleAction} className="space-y-3">
          <input
            name="name"
            placeholder="Schedule name, e.g. Morning nebulizer"
            required
            className="w-full border rounded p-2"
          />
          <select name="recurrence" required className="w-full border rounded p-2">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="hourly">Every N hours</option>
          </select>
          <input
            name="time"
            type="time"
            defaultValue="08:00"
            className="w-full border rounded p-2"
          />
          <div className="flex flex-wrap gap-2">
            {['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'].map((d) => (
              <label key={d} className="text-sm">
                <input type="checkbox" name="days" value={d} /> {d}
              </label>
            ))}
          </div>
          <input
            name="interval"
            type="number"
            min={1}
            placeholder="Interval (hours, for hourly only)"
            className="w-full border rounded p-2"
          />
          <input
            name="windowMinutes"
            type="number"
            min={1}
            defaultValue={90}
            placeholder="Window minutes"
            className="w-full border rounded p-2"
          />
          <input
            name="remindOffsets"
            placeholder="Reminder offsets in minutes, e.g. 0,15"
            defaultValue="0"
            className="w-full border rounded p-2"
          />
          <select name="templateId" className="w-full border rounded p-2">
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
            className="w-full border rounded p-2"
          />
          <input
            name="escalationNotify"
            placeholder="Escalation user IDs, comma separated"
            className="w-full border rounded p-2"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Create schedule
          </button>
        </form>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Templates</h2>
        <ul className="divide-y">
          {templates.map((template) => (
            <li
              key={template.id}
              className="py-2 flex items-center justify-between"
            >
              <div>
                <span>{template.name}</span>
                <span className="text-sm text-gray-500 ml-2">{template.category}</span>
              </div>
              <span className="text-sm text-gray-500">{template.usageCount} uses</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white p-4 rounded-lg border">
        <h2 className="font-medium mb-3">Schedules</h2>
        <ul className="divide-y">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="py-2 flex items-center justify-between"
            >
              <div>
                <span>{schedule.name}</span>
                <span className="text-sm text-gray-500 ml-2">{schedule.rrule}</span>
              </div>
              <form action={scheduleDeleteAction}>
                <input type="hidden" name="id" value={schedule.id} />
                <button
                  type="submit"
                  className="text-sm text-red-600 hover:underline"
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
