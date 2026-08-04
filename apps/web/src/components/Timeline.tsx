'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { localDb, getClientId, isOnline, type LocalEvent, type LocalTemplate } from '@/lib/localDb';
import { pullDelta, getSyncCursor } from '@/lib/sync';
import { queueOutbox, retryOutboxItem } from '@/lib/outbox';
import { announce } from '@/lib/announcer';
import { EventStatus } from '@carelog/db';
import { Icon } from '@/components/Icon';
import { EventEditForm, type EventEditValues } from '@/components/EventEditForm';
import {
  failedSyncByEvent,
  failedSyncMessage,
  groupEventsByDay,
  type FailedSync,
} from '@/components/timeline-grouping';
import { CATEGORY_META, STATUS_META, categoryMeta, tierStyle, initials } from '@/lib/categoryTheme';

type ErrorMap = Record<string, string>;

const EDITABLE_STATUSES: EventStatus[] = [EventStatus.needs_review, EventStatus.ai_failed];

function withError(errors: ErrorMap, id: string, message: string): ErrorMap {
  return { ...errors, [id]: message };
}

function withoutError(errors: ErrorMap, id: string): ErrorMap {
  return Object.fromEntries(Object.entries(errors).filter(([key]) => key !== id));
}

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
  const [failedSync, setFailedSync] = useState<Record<string, FailedSync>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<ErrorMap>({});
  const [retryErrors, setRetryErrors] = useState<ErrorMap>({});
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const knownStatuses = useRef<Record<string, EventStatus> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [localEvents, localTemplates, outboxItems, cursor] = await Promise.all([
        localDb.events.filter((e) => e.deletedAt === null).reverse().sortBy('occurredAt'),
        localDb.templates.toArray(),
        localDb.outbox.toArray(),
        getSyncCursor(),
      ]);

      if (!mounted) return;
      setEvents(localEvents.slice(0, 50));
      setTemplates(localTemplates);
      setFailedSync(failedSyncByEvent(outboxItems));
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

    const outboxObservable = liveQuery(() => localDb.outbox.toArray());
    const outboxSubscription = outboxObservable.subscribe({
      next: (items) => {
        if (mounted) setFailedSync(failedSyncByEvent(items));
      },
      error: (err) => console.error('Outbox live query error', err),
    });

    return () => {
      mounted = false;
      eventsSubscription.unsubscribe();
      templatesSubscription.unsubscribe();
      outboxSubscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const current = Object.fromEntries(events.map((event) => [event.id, event.status]));
    const previous = knownStatuses.current;
    knownStatuses.current = current;
    if (!previous) return;

    const newlyFlagged = events.filter(
      (event) =>
        event.status === EventStatus.needs_review &&
        previous[event.id] !== undefined &&
        previous[event.id] !== EventStatus.needs_review
    );

    if (newlyFlagged.length === 1) {
      announce(`${categoryMeta(newlyFlagged[0].category).label} entry needs your review`);
    } else if (newlyFlagged.length > 1) {
      announce(`${newlyFlagged.length} entries need your review`);
    }
  }, [events]);

  const returnFocusToOpener = () => {
    openerRef.current?.focus();
    openerRef.current = null;
  };

  const confirmEvent = async (id: string) => {
    setBusyId(id);
    setActionErrors((prev) => withoutError(prev, id));
    try {
      const res = await fetch(`/api/events/${id}/confirm`, { method: 'POST' });
      if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
      await localDb.events.update(id, { status: EventStatus.confirmed });
      announce('Entry confirmed');
    } catch (err) {
      console.error('Failed to confirm event', err);
      setActionErrors((prev) =>
        withError(prev, id, "We couldn't mark this as confirmed. Check your connection and try again.")
      );
    } finally {
      setBusyId(null);
    }
  };

  const openEditor = (id: string, opener: HTMLButtonElement) => {
    openerRef.current = opener;
    setActionErrors((prev) => withoutError(prev, id));
    setEditingId(id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    returnFocusToOpener();
  };

  const saveEdit = async (event: LocalEvent, values: EventEditValues) => {
    setBusyId(event.id);
    setActionErrors((prev) => withoutError(prev, event.id));
    try {
      // Empty means a photo/voice-only entry whose note was never set — leave
      // rawInput alone locally and omit it from the PATCH (the server rejects
      // empty strings, and sending nothing means "unchanged").
      const rawInputChange = values.rawInput.length > 0 ? { rawInput: values.rawInput } : {};

      await localDb.events.update(event.id, {
        ...rawInputChange,
        category: values.category,
        occurredAt: values.occurredAt,
        synced: false,
      });

      await queueOutbox({
        id: `${event.id}:update`,
        type: 'event:update',
        payload: {
          eventId: event.id,
          ...rawInputChange,
          category: values.category ?? undefined,
          occurredAt: values.occurredAt,
          version: event.version,
        },
        idempotencyKey: `${event.idempotencyKey}:update:${event.version}`,
        clientId: getClientId(),
      });

      announce('Changes saved');
      setEditingId(null);
      returnFocusToOpener();
    } catch (err) {
      console.error('Failed to save event edit', err);
      setActionErrors((prev) =>
        withError(prev, event.id, "We couldn't save your changes. Please try again.")
      );
    } finally {
      setBusyId(null);
    }
  };

  const retrySync = async (eventId: string, itemId: string) => {
    setBusyId(eventId);
    setRetryErrors((prev) => withoutError(prev, eventId));
    if (!isOnline()) {
      setRetryErrors((prev) =>
        withError(prev, eventId, 'You are offline — connect to the internet, then try again.')
      );
      setBusyId(null);
      return;
    }
    try {
      await retryOutboxItem(itemId);
      announce('Trying to save this entry again');
    } catch (err) {
      console.error('Failed to retry outbox item', err);
      setRetryErrors((prev) =>
        withError(prev, eventId, "We couldn't start another attempt. Check your connection and try again.")
      );
    } finally {
      setBusyId(null);
    }
  };

  const needsReview = events.filter((e) => e.status === EventStatus.needs_review).slice(0, 20);
  const dayGroups = groupEventsByDay(events, new Date());

  if (loading) {
    return <div className="py-12 text-center text-[16px] text-ink-soft">Loading your log…</div>;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <section>
        <h2 className="cc-eyebrow mb-[9px]">Quick log</h2>
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
      </section>

      {needsReview.length > 0 && (
        <section
          className="cc-card"
          style={{ background: 'var(--alert-tint)', border: '1px solid var(--accent-tint)', boxShadow: 'none' }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-accent-deep">Needs your review</h2>
            <span className="text-xs font-bold text-accent-deep">{needsReview.length} awaiting</span>
          </div>
          <ul className="flex flex-col gap-4">
            {needsReview.map((event) => {
              const meta = categoryMeta(event.category);
              const error = actionErrors[event.id];
              const confirmLabel = error ? 'Try again' : 'Confirm';
              return (
                <li key={event.id} className="flex flex-col gap-2">
                  <span className="text-[14.5px] leading-[1.4] font-semibold text-ink">
                    {meta.label} — {event.rawInput?.slice(0, 60) ?? ''}
                    {event.rawInput && event.rawInput.length > 60 && '…'}
                  </span>
                  {error && editingId !== event.id && (
                    <p
                      role="alert"
                      className="rounded-lg bg-card px-3 py-2.5 text-[14px] font-semibold text-accent-deep"
                    >
                      {error}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => confirmEvent(event.id)}
                      disabled={busyId === event.id}
                      aria-label={`${confirmLabel} — ${meta.label} entry`}
                      className="cc-btn cc-btn--primary"
                    >
                      <Icon name="check" size={16} />
                      {confirmLabel}
                    </button>
                    <button
                      type="button"
                      onClick={(clickEvent) => openEditor(event.id, clickEvent.currentTarget)}
                      disabled={busyId === event.id}
                      aria-label={`Fix — ${meta.label} entry`}
                      className="cc-btn cc-btn--secondary"
                    >
                      Fix
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="cc-serif mb-3 text-[22px]">Recent entries</h2>

        {events.length === 0 && (
          <div className="cc-card cc-card--sunk px-5 py-10 text-center">
            <p className="text-[17px] font-bold text-ink">Nothing logged yet</p>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-[1.5] text-ink-soft">
              Tap one of the Quick log buttons above to add the first entry — a few words is enough.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {dayGroups.map((group) => (
            <div key={group.key}>
              <h3 className="cc-serif mb-2 text-[18px] text-ink">{group.label}</h3>
              <ul className="flex flex-col gap-3">
                {group.events.map((event) => {
                  const meta = categoryMeta(event.category);
                  const failure = failedSync[event.id];
                  const retryError = retryErrors[event.id];
                  const isEditing = editingId === event.id;
                  const isBusy = busyId === event.id;
                  const dataEntries =
                    event.structuredData && event.status !== 'pending_ai'
                      ? Object.entries(event.structuredData).filter(([, v]) => formatChipValue(v) !== '')
                      : [];

                  return (
                    <li key={event.id}>
                      <article data-testid="event-card" className="cc-card">
                        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="cc-tier" style={tierStyle(meta.tier)}>
                            <Icon name={meta.icon} size={13} />
                            {meta.label}
                          </span>
                          <div className="flex items-center gap-2">
                            {event.hasConflict && (
                              <span className="cc-badge cc-badge--gap">
                                <span className="cc-dot" />
                                Conflict
                              </span>
                            )}
                            <StatusBadge status={event.status} />
                          </div>
                        </div>

                        {event.hasConflict && (
                          <p className="mb-2.5 text-[13.5px] leading-[1.45] text-ink-soft">
                            Another caregiver edited this entry — check the details below still look right.
                          </p>
                        )}

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
                              <div
                                key={attachment.id}
                                className="flex items-start gap-1.5 text-sm text-ink-soft"
                              >
                                {attachment.kind === 'photo' && (
                                  <>
                                    <Icon name="camera" size={14} className="mt-0.5 shrink-0 text-ink-faint" />
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
                                    <Icon name="mic" size={14} className="mt-0.5 shrink-0 text-ink-faint" />
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

                        {failure && (
                          <div className="mb-2.5 flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => retrySync(event.id, failure.itemId)}
                              disabled={isBusy}
                              aria-label={`${failedSyncMessage(failure)} — ${meta.label} entry`}
                              className="cc-btn cc-btn--block"
                              style={{ background: 'var(--alert-tint)', color: 'var(--accent-deep)' }}
                            >
                              {failedSyncMessage(failure)}
                            </button>
                            <p className="text-[13.5px] leading-[1.45] text-ink-soft">
                              It is saved on this device, but the rest of the care circle cannot see it yet.
                            </p>
                            {retryError && (
                              <p
                                role="alert"
                                className="rounded-lg bg-alert-tint px-3 py-2.5 text-[14px] font-semibold text-accent-deep"
                              >
                                {retryError}
                              </p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[13px] font-bold text-ink-faint">
                          <span className="cc-avatar cc-avatar--caregiver">{initials(event.authorName)}</span>
                          {event.authorName ?? 'Unknown'} · {new Date(event.occurredAt).toLocaleString()}
                        </div>

                        {EDITABLE_STATUSES.includes(event.status) && !isEditing && (
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={(clickEvent) => openEditor(event.id, clickEvent.currentTarget)}
                              disabled={isBusy}
                              aria-label={`Fix this entry — ${meta.label}`}
                              className="cc-btn cc-btn--secondary"
                            >
                              Fix this entry
                            </button>
                          </div>
                        )}

                        {isEditing && (
                          <EventEditForm
                            event={event}
                            saving={isBusy}
                            error={actionErrors[event.id] ?? null}
                            onSave={(values) => saveEdit(event, values)}
                            onCancel={cancelEdit}
                          />
                        )}
                      </article>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
