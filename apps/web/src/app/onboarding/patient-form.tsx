'use client';

import { useActionState } from 'react';
import { createPatientAction, type PatientFormState } from './actions';

const initialState: PatientFormState = { error: null };

export default function PatientForm() {
  const [state, formAction, pending] = useActionState(createPatientAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      {state.error && (
        <div
          role="alert"
          className="rounded-[14px] border border-alert-tint bg-alert-tint p-3 text-sm text-accent-deep"
        >
          {state.error}
        </div>
      )}

      <label className="block space-y-1">
        <span className="cc-eyebrow">Who are you caring for?</span>
        <input
          name="name"
          type="text"
          placeholder="Name, e.g. Mom"
          required
          maxLength={120}
          className="cc-input"
        />
      </label>

      <label className="block space-y-1">
        <span className="cc-eyebrow">Date of birth (optional)</span>
        <input name="dateOfBirth" type="date" className="cc-input" />
      </label>

      <label className="block space-y-1">
        <span className="cc-eyebrow">Medical notes (optional)</span>
        <textarea
          name="medicalNotes"
          rows={3}
          maxLength={2000}
          placeholder="Conditions, allergies, anything the care circle should know"
          className="cc-input"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="cc-btn cc-btn--primary cc-btn--block cc-btn--xl"
      >
        {pending ? 'Creating…' : 'Create profile'}
      </button>
    </form>
  );
}
