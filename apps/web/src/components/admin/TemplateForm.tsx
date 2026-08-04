'use client';

import { useActionState } from 'react';
import { templateAction, type AdminFormState } from '@/app/admin/actions';
import { Field } from '@/components/admin/Field';
import { FormAlert } from '@/components/admin/FormAlert';

type Option = { id: string; label: string };

const initialState: AdminFormState = { error: null };

/**
 * Create-a-template form.
 *
 * There used to be a third field here: `defaults`, typed as raw JSON. Nothing in
 * the app reads a template's defaults — the capture form uses only its name and
 * category — so the field asked a family member to hand-write JSON in exchange
 * for no behaviour at all. New templates are created with empty defaults.
 */
export function TemplateForm({ categories }: { categories: Option[] }) {
  const [state, formAction, pending] = useActionState(templateAction, initialState);
  const values = state.values ?? {};

  return (
    <form action={formAction} className="space-y-3.5">
      <FormAlert state={state} />

      <Field
        label="What is it called?"
        hint="This is the button a caregiver taps, so name it the way you'd say it out loud."
        htmlFor="template-name"
      >
        <input
          id="template-name"
          name="name"
          placeholder="e.g. Morning nebulizer"
          required
          defaultValue={(values.name as string) ?? ''}
          className="cc-input"
        />
      </Field>

      <Field
        label="What kind of care is it?"
        hint="Used to file the log in the right place and to colour it on the timeline."
        htmlFor="template-category"
      >
        <select
          id="template-category"
          name="category"
          required
          defaultValue={(values.category as string) ?? categories[0]?.id}
          className="cc-input"
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </select>
      </Field>

      <button type="submit" disabled={pending} className="cc-btn cc-btn--primary">
        {pending ? 'Saving…' : 'Create template'}
      </button>
    </form>
  );
}
