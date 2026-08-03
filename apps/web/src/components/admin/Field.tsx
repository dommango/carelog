import type { ReactNode } from 'react';

/**
 * A labelled admin field with an optional plain-language hint underneath.
 *
 * The admin forms used to rely on placeholder text alone ("Window minutes",
 * "Reminder offsets in minutes, e.g. 0,15"), which vanishes as soon as you
 * type and never explains what the number is for.
 */
export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="cc-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-[12.5px] font-semibold text-ink-soft">{hint}</p>}
    </div>
  );
}
