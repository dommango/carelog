'use client';

import { useEffect, useRef } from 'react';
import type { AdminFormState } from '@/app/admin/actions';

/**
 * What an admin form has to say after being submitted.
 *
 * These forms used to fail silently — a bad value made the server action return
 * early and the page just sat there. Failures are announced (`role="alert"`) and
 * take focus, so the reason is both read out and scrolled to; confirmations are
 * polite, because nothing needs fixing.
 */
export function FormAlert({ state }: { state: AdminFormState }) {
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state]);

  if (state.error) {
    return (
      <div
        ref={errorRef}
        role="alert"
        tabIndex={-1}
        className="rounded-[var(--r-lg)] border border-alert bg-alert-tint p-3 text-[14px] font-semibold text-accent-deep focus:outline-none"
      >
        {state.error}
      </div>
    );
  }

  if (state.success) {
    return (
      <div
        role="status"
        className="rounded-[var(--r-lg)] border border-covered bg-covered-tint p-3 text-[14px] font-semibold text-covered-ink"
      >
        {state.success}
      </div>
    );
  }

  return null;
}
