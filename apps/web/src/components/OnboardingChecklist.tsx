import Link from 'next/link';
import { Icon } from '@/components/Icon';
import type { OnboardingChecklist as Checklist } from '@/lib/onboarding-checklist';

export function OnboardingChecklist({ checklist }: { checklist: Checklist }) {
  if (checklist.isComplete) return null;

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
    </section>
  );
}
