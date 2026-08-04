'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getActor, type Actor } from '@/lib/policy';
import { createTemplate } from '@/lib/services/templates';
import { inviteUser } from '@/lib/services/invites';
import { createSchedule, deleteSchedule } from '@/lib/services/schedules';
import { createScheduleSchema, createTemplateSchema, inviteSchema } from '@/lib/zod';
import { buildRrule, parseEscalation, parseRemindOffsets, parseWindowMinutes } from './schedule-input';

export type AdminFormState = {
  error: string | null;
  success?: string;
  values?: Record<string, string | string[]>;
};

const NOT_ADMIN = 'You need admin access to change this.';

async function adminActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const actor = await getActor(session.user.id as string);
  return actor && actor.role === 'admin' ? actor : null;
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).filter((value): value is string => typeof value === 'string');
}

export async function inviteAction(
  _prevState: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const actor = await adminActor();
  if (!actor) return { error: NOT_ADMIN };

  const values = { email: text(formData, 'email'), role: text(formData, 'role') };

  const parsed = inviteSchema.safeParse({
    email: values.email.trim().toLowerCase(),
    role: values.role,
    patientId: text(formData, 'patientId'),
  });

  if (!parsed.success) {
    return {
      error: 'That does not look like an email address we can send to. Check it and try again.',
      values,
    };
  }

  try {
    await inviteUser(actor, parsed.data);
  } catch (error) {
    console.error('Failed to invite caregiver:', error);
    return { error: 'Could not add that person just now. Please try again.', values };
  }

  revalidatePath('/admin');
  return { error: null, success: `${parsed.data.email} can now sign in and see the log.` };
}

export async function templateAction(
  _prevState: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const actor = await adminActor();
  if (!actor) return { error: NOT_ADMIN };

  const values = { name: text(formData, 'name'), category: text(formData, 'category') };

  const parsed = createTemplateSchema.safeParse({
    name: values.name.trim(),
    category: values.category,
    defaults: {},
  });

  if (!parsed.success) {
    return { error: 'Give the template a name and pick what kind of care it is.', values };
  }

  try {
    await createTemplate(actor, parsed.data);
  } catch (error) {
    console.error('Failed to create template:', error);
    return { error: 'Could not save that template just now. Please try again.', values };
  }

  revalidatePath('/admin');
  return { error: null, success: `“${parsed.data.name}” is ready to tap when logging care.` };
}

export async function scheduleAction(
  _prevState: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const actor = await adminActor();
  if (!actor) return { error: NOT_ADMIN };

  const values = {
    name: text(formData, 'name'),
    recurrence: text(formData, 'recurrence'),
    time: text(formData, 'time'),
    days: list(formData, 'days'),
    interval: text(formData, 'interval'),
    windowMinutes: text(formData, 'windowMinutes'),
    remindOffsets: text(formData, 'remindOffsets'),
    templateId: text(formData, 'templateId'),
    escalationAfter: text(formData, 'escalationAfter'),
    escalationNotify: list(formData, 'escalationNotify'),
  };

  const name = values.name.trim();
  if (name === '') {
    return { error: 'Give the schedule a name, so the reminder says what it is for.', values };
  }

  const rrule = buildRrule(values);
  if (!rrule.ok) return { error: rrule.error, values };

  const windowMinutes = parseWindowMinutes(values.windowMinutes);
  if (!windowMinutes.ok) return { error: windowMinutes.error, values };

  const remindOffsets = parseRemindOffsets(values.remindOffsets);
  if (!remindOffsets.ok) return { error: remindOffsets.error, values };

  const escalation = parseEscalation(values.escalationAfter, values.escalationNotify);
  if (!escalation.ok) return { error: escalation.error, values };

  const parsed = createScheduleSchema.safeParse({
    patientId: actor.assignment.patientId,
    name,
    rrule: rrule.value,
    windowMinutes: windowMinutes.value,
    remindOffsets: remindOffsets.value,
    templateId: values.templateId === '' ? undefined : values.templateId,
    escalation: escalation.value,
  });

  if (!parsed.success) {
    return { error: 'Something in this schedule did not add up. Check the fields and try again.', values };
  }

  try {
    await createSchedule(actor, parsed.data);
  } catch (error) {
    console.error('Failed to create schedule:', error);
    return { error: 'Could not save that schedule just now. Please try again.', values };
  }

  revalidatePath('/admin');
  return { error: null, success: `“${name}” is now being reminded and tracked.` };
}

export async function scheduleDeleteAction(
  _prevState: AdminFormState,
  formData: FormData
): Promise<AdminFormState> {
  const actor = await adminActor();
  if (!actor) return { error: NOT_ADMIN };

  const id = text(formData, 'id');
  if (id === '') return { error: 'Could not tell which schedule that was. Reload and try again.' };

  try {
    await deleteSchedule(actor, id);
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    return { error: 'Could not delete that schedule just now. Please try again.' };
  }

  revalidatePath('/admin');
  return { error: null };
}
