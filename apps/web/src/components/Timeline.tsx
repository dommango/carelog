'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { localDb, type LocalEvent, type LocalTemplate } from '@/lib/localDb';
import { pullDelta, getSyncCursor } from '@/lib/sync';
import { EventStatus } from '@carelog/db';
import { Icon } from '@/components/Icon';
import { CATEGORY_META, STATUS_META, categoryMeta, tierStyle, initials } from '@/lib/categoryTheme';

function formatChipValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatChipValue).join(', ');
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function StatusBadge({ status }: { status: EventStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`cc-badge cc-badge--${meta.kind}`}>
      <span className="cc-dot" />
      {meta.label}
    </span>
  );
}

export default function Timeline() {
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [templates, setTemplates] = useState<LocalTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [localEvents, localTemplates, cursor] = await Promise.all([
        localDb.events.filter((e) => e.deletedAt === null).reverse().sortBy('occurredAt'),
        localDb.templates.toArray(),
        getSyncCursor(),
      ]);

      if (!mounted) return;
      setEvents(localEvents.slice(0, 50));
      setTemplates(localTemplates);
      setLoading(false);

      try {
        await pullDelta(cursor);
      } catch (err) {
        console.error('Initial delta sync failed', err);
      }
    }

    load();

    const eventsObservable = liveQuery(() =>
      localDb.events.filter((e) => e.deletedAt === null).reverse().sortBy('occurredAt')
    );
    const eventsSubscription = eventsObservable.subscribe({
      next: (items) => {
        if (mounted) setEvents(items.slice(0, 50));
      },
      error: (err) => console.error('Events live query error', err),
    });

    const templatesObservable = liveQuery(() => localDb.templates.toArray());
    const templatesSubscription = templatesObservable.subscribe({
      next: (items) => {
        if (mounted) setTemplates(items);
      },
      error: (err) => console.error('Templates live query error', err),
    });

    return () => {
      mounted = false;
      eventsSubscription.unsubscribe();
      templatesSubscription.unsubscribe();
    };
  }, []);

  const confirmEvent = async (id: string) => {
    try {
      const res = await fetch(`/api/events/${id}/confirm`, { method: 'POST' });
      if (!res.ok) throw new Error('Confirm failed');
      await localDb.events.update(id, { status: EventStatus.confirmed });
    } catch (err) {
      console.error('Failed to confirm event', err);
    }
  };

  const fixEvent = async (id: string, currentRawInput: string | null) => {
    const rawInput = window.prompt('Edit entry:', currentRawInput ?? '');
    if (rawInput === null) return;
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput }),
      });
      if (!res.ok) throw new Error('Update failed');
      const updated = (await res.json()) as { rawInput: string | null; version: number };
      await localDb.events.update(id, { rawInput: updated.rawInput, version: updated.version });
    } catch (err) {
      console.error('Failed to update event', err);
    }
  };

  const needsReview = events.filter((e) => e.status === EventStatus.needs_review).slice(0, 20);

  if (loading) {
    return <div className="py-12 text-center text-ink-faint">Loading…</div>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <div className="cc-eyebrow mb-[9px]">Quick log</div>
        <div className="flex flex-wrap gap-2">
          {templates.map((template) => {
            const meta = CATEGORY_META[template.category] ?? categoryMeta(template.category);
            return (
              <Link
                key={template.id}
                href={`/events/new?templateId=${template.id}`}
                className="cc-btn cc-btn--secondary cc-btn--sm"
              >
                <span style={{ color: 'var(--accent)' }}>
                  <Icon name={meta.icon} size={15} />
                </span>
                {template.name}
              </Link>
            );
          })}
          <Link href="/events/new" className="cc-btn cc-btn--sm">
            <Icon name="plus" size={15} />
            Note
          </Link>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div
          className="cc-card"
          style={{ background: 'var(--alert-tint)', border: '1px solid var(--accent-tint)', boxShadow: 'none' }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <div className="text-sm font-extrabold text-accent-deep">Needs your review</div>
            <span className="text-xs font-bold text-accent-deep">{needsReview.length} awaiting</span>
          </div>
          <div className="space-y-2">
            {needsReview.map((event) => {
              const meta = categoryMeta(event.category);
              return (
                <div key={event.id} className="flex items-center justify-between gap-2.5 text-[13.5px]">
                  <span className="truncate font-semibold text-ink">
                    {meta.label} — {event.rawInput?.slice(0, 60) ?? ''}
                    {event.rawInput && event.rawInput.length > 60 && '…'}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => confirmEvent(event.id)}
                      className="cc-btn cc-btn--primary cc-btn--sm"
                      style={{ minHeight: 34, padding: '6px 14px' }}
                    >
                      <Icon name="check" size={14} />
                      Confirm
                    </button>
                    <button
                      onClick={() => fixEvent(event.id, event.rawInput)}
                      className="cc-btn cc-btn--secondary cc-btn--sm"
                      style={{ minHeight: 34, padding: '6px 14px' }}
                    >
                      Fix
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h1 className="cc-serif mb-3 text-[22px]">Today</h1>

        <div className="flex flex-col gap-3">
          {events.length === 0 && (
            <div className="py-12 text-center text-ink-faint">No events yet.</div>
          )}
          {events.map((event) => {
            const meta = categoryMeta(event.category);
            const dataEntries =
              event.structuredData && event.status !== 'pending_ai'
                ? Object.entries(event.structuredData).filter(([, v]) => formatChipValue(v) !== '')
                : [];

            return (
              <div key={event.id} data-testid="event-card" className="cc-card">
                <div className="mb-2.5 flex items-center justify-between">
                  <span className="cc-tier" style={tierStyle(meta.tier)}>
                    <Icon name={meta.icon} size={13} />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    {event.hasConflict && (
                      <span
                        className="cc-badge cc-badge--gap"
                        title="Another caregiver edited this entry"
                      >
                        <span className="cc-dot" />
                        Conflict
                      </span>
                    )}
                    <StatusBadge status={event.status} />
                  </div>
                </div>

                <p className="mb-2.5 whitespace-pre-wrap text-[15px] leading-[1.45] text-ink">
                  {event.rawInput}
                </p>

                {dataEntries.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {dataEntries.map(([key, value]) => (
                      <span key={key} className="cc-data-chip">
                        <span className="cc-data-chip-key">{key}</span>
                        {formatChipValue(value)}
                      </span>
                    ))}
                  </div>
                )}

                {event.attachments.length > 0 && (
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    {event.attachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-start gap-1.5 text-sm text-ink-soft">
                        {attachment.kind === 'photo' && (
                          <>
                            <Icon name="phone" size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                            <span>
                              Photo
                              {attachment.visionSummary && (
                                <span className="italic text-ink-soft"> — {attachment.visionSummary}</span>
                              )}
                            </span>
                          </>
                        )}
                        {attachment.kind === 'audio' && (
                          <>
                            <Icon name="bell" size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                            <span>
                              Voice memo
                              {attachment.transcript && (
                                <span className="italic text-ink-soft"> — “{attachment.transcript}”</span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 text-[12.5px] font-bold text-ink-faint">
                  <span className="cc-avatar cc-avatar--caregiver">{initials(event.authorName)}</span>
                  {event.authorName ?? 'Unknown'} · {new Date(event.occurredAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
