'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { liveQuery } from 'dexie';
import { localDb, type LocalEvent, type LocalTemplate } from '@/lib/localDb';
import { pullDelta, getSyncCursor } from '@/lib/sync';
import { EventStatus } from '@carelog/db';

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

  const statusBadge = (status: EventStatus) => {
    const map: Record<EventStatus, string> = {
      pending_ai: 'bg-yellow-100 text-yellow-800',
      needs_review: 'bg-orange-100 text-orange-800',
      confirmed: 'bg-green-100 text-green-800',
      ai_failed: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded ${map[status]}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center text-gray-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-2">
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/events/new?templateId=${template.id}`}
            className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200"
          >
            {template.name}
          </Link>
        ))}
        <Link
          href="/events/new"
          className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-full text-sm hover:bg-gray-300"
        >
          + Note
        </Link>
      </div>

      {needsReview.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-orange-900">Needs review</h2>
            <span className="text-xs text-orange-700">{needsReview.length} awaiting confirmation</span>
          </div>
          <div className="space-y-2">
            {needsReview.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between gap-2 text-sm text-orange-800"
              >
                <span className="truncate">
                  {event.category ?? 'note'} — {event.rawInput?.slice(0, 60) ?? ''}
                  {event.rawInput && event.rawInput.length > 60 && '…'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => confirmEvent(event.id)}
                    className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => fixEvent(event.id, event.rawInput)}
                    className="px-2 py-1 bg-white text-orange-800 border border-orange-200 rounded text-xs hover:bg-orange-100"
                  >
                    Fix
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Timeline</h1>
      </div>

      <div className="space-y-3">
        {events.length === 0 && (
          <div className="text-center text-gray-500 py-12">No events yet.</div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            data-testid="event-card"
            className="bg-white rounded-lg border p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {event.category ?? 'note'}
              </span>
              <div className="flex items-center gap-2">
                {event.hasConflict && (
                  <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700" title="Another caregiver edited this entry">
                    Conflict
                  </span>
                )}
                {statusBadge(event.status)}
              </div>
            </div>
            <p className="mt-2 text-gray-900 whitespace-pre-wrap">{event.rawInput}</p>

            {event.structuredData && event.status !== 'pending_ai' && (
              <div className="mt-2 text-sm bg-gray-50 rounded p-2">
                <pre className="whitespace-pre-wrap">{JSON.stringify(event.structuredData, null, 2)}</pre>
              </div>
            )}

            {event.attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {event.attachments.map((attachment) => (
                  <div key={attachment.id} className="text-sm">
                    {attachment.kind === 'photo' && (
                      <div className="space-y-1">
                        <span className="text-gray-500">📷 Photo</span>
                        {attachment.visionSummary && (
                          <p className="text-gray-700 italic">{attachment.visionSummary}</p>
                        )}
                      </div>
                    )}
                    {attachment.kind === 'audio' && (
                      <div className="space-y-1">
                        <span className="text-gray-500">🔊 Audio</span>
                        {attachment.transcript && (
                          <p className="text-gray-700 italic">“{attachment.transcript}”</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-2 text-sm text-gray-500">
              {event.authorName ?? 'Unknown'} · {new Date(event.occurredAt).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
