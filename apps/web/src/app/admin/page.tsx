import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getActor } from '@/lib/policy';
import { listPatients } from '@/lib/services/patients';
import { listTemplates, createTemplate } from '@/lib/services/templates';
import { inviteUser, listAssignments } from '@/lib/services/invites';
import { createTemplateSchema, inviteSchema } from '@/lib/zod';
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
  const templates = await listTemplates(adminActor);

  const caregivers = await listAssignments(adminActor, patient.id);

  async function inviteAction(formData: FormData) {
    'use server';
    const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return;
    await inviteUser(adminActor, parsed.data);
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
        <h2 className="font-medium mb-3">Templates</h2>
        <ul className="divide-y">
          {templates.map((template) => (
            <li
              key={template.id}
              className="py-2 flex items-center justify-between"
            >
              <span>{template.name}</span>
              <span className="text-sm text-gray-500">{template.category}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
