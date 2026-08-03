import { EventCategory } from '@carelog/db';
import { Field } from '@/components/admin/Field';
import { categoryMeta } from '@/lib/categoryTheme';

const categories = Object.values(EventCategory);

/**
 * Create-a-template form. The JSON `defaults` field is real but scares people
 * off, so it sits behind an "Advanced" disclosure — a template with a name and
 * a category is already useful on its own.
 */
export function TemplateForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-3.5">
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
          className="cc-input"
        />
      </Field>

      <Field
        label="What kind of care is it?"
        hint="Used to file the log in the right place and to colour it on the timeline."
        htmlFor="template-category"
      >
        <select id="template-category" name="category" required className="cc-input">
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryMeta(c).label}
            </option>
          ))}
        </select>
      </Field>

      <details className="rounded-[var(--r-lg)] bg-card-sunk px-3.5 py-2.5">
        <summary className="cursor-pointer text-[13.5px] font-bold text-ink-soft">
          Advanced: pre-fill some details
        </summary>
        <p className="mt-2 text-[12.5px] font-semibold text-ink-soft">
          Optional. Values to fill in every time this template is used, written as JSON. Leave it
          empty if you are not sure.
        </p>
        <textarea
          name="defaults"
          placeholder={'{"medication": "Albuterol"}'}
          rows={3}
          className="cc-input mt-2"
        />
      </details>

      <button type="submit" className="cc-btn cc-btn--primary">
        Create template
      </button>
    </form>
  );
}
