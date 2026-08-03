import { Field } from '@/components/admin/Field';

const WEEKDAYS = [
  { value: 'MO', label: 'Mon' },
  { value: 'TU', label: 'Tue' },
  { value: 'WE', label: 'Wed' },
  { value: 'TH', label: 'Thu' },
  { value: 'FR', label: 'Fri' },
  { value: 'SA', label: 'Sat' },
  { value: 'SU', label: 'Sun' },
];

type Option = { id: string; label: string };

/**
 * Create-a-schedule form.
 *
 * Every field here maps to something the reminder engine genuinely needs, but
 * the old version exposed them as bare numbers ("Window minutes", "Escalation
 * user IDs, comma separated"). Same fields, said in caregiver language, and
 * the escalation targets are picked from the actual care team instead of typed
 * out as UUIDs.
 */
export function ScheduleForm({
  action,
  templates,
  caregivers,
}: {
  action: (formData: FormData) => Promise<void>;
  templates: Option[];
  caregivers: Option[];
}) {
  return (
    <form action={action} className="space-y-3.5">
      <Field
        label="What is being reminded?"
        hint="Shown in the reminder itself, e.g. “Morning nebulizer”."
        htmlFor="schedule-name"
      >
        <input
          id="schedule-name"
          name="name"
          placeholder="e.g. Morning nebulizer"
          required
          className="cc-input"
        />
      </Field>

      <Field label="How often?" htmlFor="schedule-recurrence">
        <select id="schedule-recurrence" name="recurrence" required className="cc-input">
          <option value="daily">Every day</option>
          <option value="weekly">Certain days of the week</option>
          <option value="hourly">Every few hours</option>
        </select>
      </Field>

      <Field
        label="At what time?"
        hint="Used for daily and weekly schedules."
        htmlFor="schedule-time"
      >
        <input id="schedule-time" name="time" type="time" defaultValue="08:00" className="cc-input" />
      </Field>

      <Field label="On which days?" hint="Weekly schedules only — ignored otherwise.">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex items-center gap-1.5 text-[13.5px] font-bold text-ink-soft"
            >
              <input type="checkbox" name="days" value={day.value} />
              {day.label}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Repeat every…"
        hint="Hourly schedules only. 4 means every four hours, around the clock."
        htmlFor="schedule-interval"
      >
        <input
          id="schedule-interval"
          name="interval"
          type="number"
          min={1}
          placeholder="hours"
          className="cc-input"
        />
      </Field>

      <Field
        label="How late can it be logged and still count as on time?"
        hint="Minutes. After this, the timeline marks it missed and adherence drops."
        htmlFor="schedule-window"
      >
        <input
          id="schedule-window"
          name="windowMinutes"
          type="number"
          min={1}
          defaultValue={90}
          className="cc-input"
        />
      </Field>

      <Field
        label="When should we nudge?"
        hint="Minutes after it is due, comma separated. 0 means right on time; “0,15” also nudges a quarter of an hour later."
        htmlFor="schedule-remind"
      >
        <input
          id="schedule-remind"
          name="remindOffsets"
          defaultValue="0"
          placeholder="0,15"
          className="cc-input"
        />
      </Field>

      <Field
        label="Start from a template?"
        hint="Picks the category and any pre-filled details, so logging it is one tap."
        htmlFor="schedule-template"
      >
        <select id="schedule-template" name="templateId" className="cc-input">
          <option value="">No template</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-[var(--r-lg)] bg-card-sunk p-3.5">
        <p className="cc-field-label !mb-1">If nobody logs it</p>
        <p className="mb-3 text-[12.5px] font-semibold text-ink-soft">
          Optional. Text someone else when the window passes with nothing logged. Leave the minutes
          empty to skip this.
        </p>

        <Field label="Wait this long first" hint="Minutes." htmlFor="schedule-escalate-after">
          <input
            id="schedule-escalate-after"
            name="escalationAfter"
            type="number"
            min={0}
            placeholder="e.g. 30"
            className="cc-input"
          />
        </Field>

        <div className="mt-3">
          <p className="cc-field-label">Then text</p>
          {caregivers.length === 0 ? (
            <p className="text-[12.5px] font-semibold text-ink-soft">
              Invite another caregiver first and they will show up here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {caregivers.map((person) => (
                <label
                  key={person.id}
                  className="flex items-center gap-2 text-[13.5px] font-bold text-ink-soft"
                >
                  <input type="checkbox" name="escalationNotify" value={person.id} />
                  {person.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <button type="submit" className="cc-btn cc-btn--primary">
        Create schedule
      </button>
    </form>
  );
}
