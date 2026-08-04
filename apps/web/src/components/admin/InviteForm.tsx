'use client';

import { useActionState } from 'react';
import { inviteAction, type AdminFormState } from '@/app/admin/actions';
import { Field } from '@/components/admin/Field';
import { FormAlert } from '@/components/admin/FormAlert';

const initialState: AdminFormState = { error: null };

export function InviteForm({ patientId }: { patientId: string }) {
  const [state, formAction, pending] = useActionState(inviteAction, initialState);
  const values = state.values ?? {};

  return (
    <form action={formAction} className="space-y-3.5">
      <FormAlert state={state} />

      <Field
        label="Their email"
        hint="They sign in with this address and see the log straight away."
        htmlFor="invite-email"
      >
        <input
          id="invite-email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
          defaultValue={(values.email as string) ?? ''}
          className="cc-input"
        />
      </Field>

      <Field label="What can they do?" htmlFor="invite-role">
        <select
          id="invite-role"
          name="role"
          required
          defaultValue={(values.role as string) ?? 'caregiver'}
          className="cc-input"
        >
          <option value="caregiver">Caregiver — can log care and see everything</option>
          <option value="viewer">Viewer — can read the log, but not add to it</option>
          <option value="admin">Admin — can also manage templates, schedules and people</option>
        </select>
      </Field>

      <input type="hidden" name="patientId" value={patientId} />
      <button type="submit" disabled={pending} className="cc-btn cc-btn--primary">
        {pending ? 'Adding…' : 'Send invite'}
      </button>
    </form>
  );
}
