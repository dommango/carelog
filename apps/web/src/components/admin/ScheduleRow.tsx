'use client';

import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { scheduleDeleteAction, type AdminFormState } from '@/app/admin/actions';
import { FormAlert } from '@/components/admin/FormAlert';

const initialState: AdminFormState = { error: null };

/**
 * One schedule in the admin list, with the only thing you can do to it.
 *
 * That button used to say "Pause" while calling the delete path. The row is
 * soft-deleted — the record survives for the audit trail — but nothing in the
 * app can bring it back, so from here it is gone: the wording, and the
 * confirmation, describe what the caregiver will actually experience.
 */
export function ScheduleRow({
  id,
  name,
  description,
}: {
  id: string;
  name: string;
  description: string;
}) {
  const [state, formAction, pending] = useActionState(scheduleDeleteAction, initialState);
  const [confirming, setConfirming] = useState(false);
  const questionId = useId();
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[14px] font-bold text-ink">{name}</span>
          <span className="block text-sm text-ink-faint">{description}</span>
        </div>

        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="cc-btn cc-btn--ghost shrink-0 text-accent-deep"
          >
            Delete
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-2 rounded-[var(--r-lg)] bg-card-sunk p-3.5">
          <p id={questionId} className="text-[13.5px] font-semibold text-ink-soft">
            Delete “{name}”? Its reminders stop and it leaves this list for good, and the adherence
            numbers in Reports stop counting it. Care already logged against it stays in the
            timeline.
          </p>

          <form action={formAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="id" value={id} />
            <button
              type="submit"
              disabled={pending}
              aria-describedby={questionId}
              className="cc-btn cc-btn--secondary text-accent-deep"
            >
              {pending ? 'Deleting…' : 'Yes, delete it'}
            </button>
            <button
              ref={keepRef}
              type="button"
              onClick={() => setConfirming(false)}
              aria-describedby={questionId}
              className="cc-btn cc-btn--primary"
            >
              Keep it
            </button>
          </form>

          <div className="mt-2">
            <FormAlert state={state} />
          </div>
        </div>
      )}
    </li>
  );
}
