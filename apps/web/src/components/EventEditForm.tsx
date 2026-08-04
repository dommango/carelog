'use client';

import { useEffect, useRef, useState } from 'react';
import { EventCategory } from '@carelog/db';
import type { LocalEvent } from '@/lib/localDb';
import { CATEGORY_META } from '@/lib/categoryTheme';
import { toLocalDatetimeInputValue } from '@/lib/datetime-local';

export type EventEditValues = {
  rawInput: string;
  category: EventCategory | null;
  occurredAt: string;
};

const categories = Object.values(EventCategory);

export function EventEditForm({
  event,
  saving,
  error,
  onSave,
  onCancel,
}: {
  event: LocalEvent;
  saving: boolean;
  error: string | null;
  onSave: (values: EventEditValues) => void;
  onCancel: () => void;
}) {
  const [rawInput, setRawInput] = useState(event.rawInput ?? '');
  const [category, setCategory] = useState<string>(event.category ?? '');
  const [occurredAt, setOccurredAt] = useState(() => toLocalDatetimeInputValue(event.occurredAt));
  const [validationError, setValidationError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.stopPropagation();
      onCancel();
    };

    form.addEventListener('keydown', handleKeyDown);
    return () => form.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const submit = (formEvent: React.FormEvent) => {
    formEvent.preventDefault();
    const trimmed = rawInput.trim();
    // The server never blanks an existing note (updates require min 1 char),
    // so allowing an empty save here would fork the local copy from the
    // server's. Empty stays valid for photo/voice-only entries, which have no
    // note to lose.
    if (!trimmed && event.rawInput) {
      setValidationError('Please add a note — or press Cancel to keep what was written.');
      textareaRef.current?.focus();
      return;
    }
    setValidationError(null);
    const when = new Date(occurredAt);
    onSave({
      rawInput: trimmed,
      category: category ? (category as EventCategory) : null,
      occurredAt: Number.isNaN(when.getTime()) ? event.occurredAt : when.toISOString(),
    });
  };

  const noteId = `edit-note-${event.id}`;
  const categoryId = `edit-category-${event.id}`;
  const whenId = `edit-when-${event.id}`;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      aria-label="Edit this entry"
      className="mt-3 flex flex-col gap-3 border-t border-line pt-3"
    >
      <div>
        <label htmlFor={noteId} className="cc-field-label">
          What happened
        </label>
        <textarea
          id={noteId}
          ref={textareaRef}
          value={rawInput}
          onChange={(changeEvent) => {
            setRawInput(changeEvent.target.value);
            setValidationError(null);
          }}
          aria-invalid={validationError ? true : undefined}
          rows={4}
          className="cc-input resize-none"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={categoryId} className="cc-field-label">
            Kind of entry
          </label>
          <select
            id={categoryId}
            value={category}
            onChange={(changeEvent) => setCategory(changeEvent.target.value)}
            className="cc-input"
          >
            <option value="">Let CareLog decide</option>
            {categories.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_META[value].label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={whenId} className="cc-field-label">
            When it happened
          </label>
          <input
            id={whenId}
            type="datetime-local"
            value={occurredAt}
            onChange={(changeEvent) => setOccurredAt(changeEvent.target.value)}
            required
            className="cc-input"
          />
        </div>
      </div>

      {(validationError ?? error) && (
        <p role="alert" className="rounded-lg bg-alert-tint px-3 py-2.5 text-[14px] font-semibold text-accent-deep">
          {validationError ?? error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving} className="cc-btn cc-btn--primary">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="cc-btn cc-btn--secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
