'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { OnboardingChecklist as Checklist } from '@/lib/onboarding-checklist';
import {
  getSkipServerSnapshot,
  getSkipSnapshot,
  isSkipped,
  recordSkip,
  subscribeToSkip,
} from '@/lib/setup-checklist-skip';

/**
 * Setup prompt for a new care circle. It opens as a single-line toast above the
 * timeline rather than a full card: the timeline is what people came for, and
 * the steps are a nudge, not the page. Tapping opens the steps; "Skip for now"
 * puts it away on this device until setup moves on.
 *
 * Server-rendered collapsed, so the skip check (which needs localStorage) only
 * ever removes the bar after mount — it never pops one in.
 */
export function OnboardingChecklist({ checklist }: { checklist: Checklist }) {
  const [open, setOpen] = useState(false);
  const skipRaw = useSyncExternalStore(subscribeToSkip, getSkipSnapshot, getSkipServerSnapshot);

  if (checklist.isComplete || isSkipped(skipRaw, checklist.completeCount)) return null;

  const nextStep = checklist.items.find((item) => !item.done);
  const skip = () => recordSkip(checklist.completeCount);

  if (!open) {
    return (
      <section className="cc-card !py-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span
              className="cc-badge shrink-0"
              style={{ background: 'var(--card-sunk)', color: 'var(--ink-soft)' }}
            >
              {checklist.completeCount} of {checklist.total}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">
                Finish setting up
              </span>
              {nextStep && (
                <span className="block truncate text-[12.5px] font-semibold text-ink-soft">
                  Next: {nextStep.label}
                </span>
              )}
            </span>
            <span className="shrink-0 text-ink-faint">
              <Icon name="chevR" size={16} />
            </span>
          </button>
          <button
            type="button"
            onClick={skip}
            aria-label="Skip setup steps for now"
            className="shrink-0 rounded-pill p-1.5 text-ink-faint hover:text-accent-deep"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="cc-card">
      <div className="mb-[9px] flex items-center justify-between gap-3">
        <h2 className="cc-eyebrow">Finish setting up</h2>
        <span
          className="cc-badge"
          style={{ background: 'var(--card-sunk)', color: 'var(--ink-soft)' }}
        >
          {checklist.completeCount} of {checklist.total}
        </span>
      </div>

      <ul className="space-y-1.5">
        {checklist.items.map((item) =>
          item.done ? (
            <li key={item.id} className="flex items-center gap-2.5 px-1 py-1.5">
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pill"
                style={{ background: 'var(--covered-tint)', color: 'var(--covered-ink)' }}
              >
                <Icon name="check" size={14} />
              </span>
              <span className="text-[14px] font-bold text-ink-faint">{item.label}</span>
            </li>
          ) : (
            <li key={item.id}>
              <Link
                href={item.href}
                className="cc-card cc-card--sunk flex items-center gap-3 !py-2.5"
              >
                <span className="shrink-0" style={{ color: 'var(--accent)' }}>
                  <Icon name={item.icon} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-ink">{item.label}</span>
                  <span className="block text-[12.5px] font-semibold text-ink-soft">
                    {item.hint}
                  </span>
                </span>
                <span className="shrink-0 text-ink-faint">
                  <Icon name="chevR" size={16} />
                </span>
              </Link>
            </li>
          )
        )}
      </ul>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={skip} className="cc-btn cc-btn--secondary cc-btn--sm">
          Skip for now
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-expanded
          className="cc-btn cc-btn--ghost cc-btn--sm"
        >
          Collapse
        </button>
      </div>
    </section>
  );
}
