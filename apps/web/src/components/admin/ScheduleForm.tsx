'use client';

import { useActionState } from 'react';
import { scheduleAction, type AdminFormState } from '@/app/admin/actions';
import { Field, FieldGroup } from '@/components/admin/Field';
import { FormAlert } from '@/components/admin/FormAlert';

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

const initialState: AdminFormState = { error: null };

function asText(value: string | string[] | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asList(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return typeof value === 'string' ? [value] : [];
}

/**
 * Create-a-schedule form.
 *
 * Every field here maps to something the reminder engine genuinely needs, but
 * the old version exposed them as bare numbers ("Window minutes", "Escalation
 * user IDs, comma separated"). Same fields, said in caregiver language, and
 * the escalation targets are picked from the actual care team instead of typed
 * out as UUIDs. What was typed survives a rejected submission, because this is
 * a ten-field form and losing it all over one bad minute count is punishing.
 */
export function ScheduleForm({
  templates,
  caregivers,
}: {
  templates: Option[];
  caregivers: Option[];
}) {
  const [state, formAction, pending] = useActionState(scheduleAction, initialState);
  const values = state.values ?? {};
  const days = asList(values.days);
  const notify = asList(values.escalationNotify);

  return (
    <form action={formAction} className="space-y-3.5">
      <FormAlert state={state} />

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
          defaultValue={asText(values.name, '')}
          className="cc-input"
        />
      </Field>

      <Field label="How often?" htmlFor="schedule-recurrence">
        <select
          id="schedule-recurrence"
          name="recurrence"
          required
          defaultValue={asText(values.recurrence, 'daily')}
          className="cc-input"
        >
          <option value="daily">Every day</option>
          <option value="weekly">Certain days of the week</option>
          <option value="hourly">Every few hours</option>
        </select>
      </Field>

      <Field label="At what time?" hint="Used for daily and weekly schedules." htmlFor="schedule-time">
        <input
          id="schedule-time"
          name="time"
          type="time"
          defaultValue={asText(values.time, '08:00')}
          className="cc-input"
        />
      </Field>

      <FieldGroup legend="On which days?" hint="Weekly schedules only — ignored otherwise.">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {WEEKDAYS.map((day) => (
            <label
              key={day.value}
              className="flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-bold text-ink-soft"
            >
              <input
                type="checkbox"
                name="days"
                value={day.value}
                defaultChecked={days.includes(day.value)}
              />
              {day.label}
            </label>
          ))}
        </div>
      </FieldGroup>

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
          max={24}
          placeholder="hours"
          defaultValue={asText(values.interval, '')}
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
          max={1440}
          defaultValue={asText(values.windowMinutes, '90')}
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
          placeholder="0,15"
          defaultValue={asText(values.remindOffsets, '0')}
          className="cc-input"
        />
      </Field>

      <Field
        label="Start from a template?"
        hint="Picks the category and any pre-filled details, so logging it is one tap."
        htmlFor="schedule-template"
      >
        <select
          id="schedule-template"
          name="templateId"
          defaultValue={asText(values.templateId, '')}
          className="cc-input"
        >
          <option value="">No template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-[var(--r-lg)] bg-card-sunk p-3.5">
        <p className="cc-field-label !mb-1">If nobody logs it</p>
        <p className="mb-3 text-[13px] font-semibold text-ink-soft">
          Optional. Text someone else when the window passes with nothing logged. Leave the minutes
          empty to skip this.
        </p>

        <Field label="Wait this long first" hint="Minutes." htmlFor="schedule-escalate-after">
          <input
            id="schedule-escalate-after"
            name="escalationAfter"
            type="number"
            min={1}
            placeholder="e.g. 30"
            defaultValue={asText(values.escalationAfter, '')}
            className="cc-input"
          />
        </Field>

        <div className="mt-3">
          {caregivers.length === 0 ? (
            <>
              <p className="cc-field-label">Then text</p>
              <p className="text-[13px] font-semibold text-ink-soft">
                Invite another caregiver first and they will show up here.
              </p>
            </>
          ) : (
            <FieldGroup legend="Then text">
              <div className="flex flex-col gap-1">
                {caregivers.map((person) => (
                  <label
                    key={person.id}
                    className="flex min-h-[44px] items-center gap-2 text-[13.5px] font-bold text-ink-soft"
                  >
                    <input
                      type="checkbox"
                      name="escalationNotify"
                      value={person.id}
                      defaultChecked={notify.includes(person.id)}
                    />
                    {person.label}
                  </label>
                ))}
              </div>
            </FieldGroup>
          )}
        </div>
      </div>

      <button type="submit" disabled={pending} className="cc-btn cc-btn--primary">
        {pending ? 'Saving…' : 'Create schedule'}
      </button>
    </form>
  );
}
