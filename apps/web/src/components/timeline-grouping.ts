import type { LocalEvent, OutboxItem, OutboxType } from '@/lib/localDb';
import { isOutboxItemFailed } from '@/lib/outbox';

export type DayGroup = {
  key: string;
  label: string;
  events: LocalEvent[];
};

export type FailedSync = {
  itemId: string;
  type: OutboxType;
  error: string | null;
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dayLabel(key: string, now: Date): string {
  const todayKey = dayKey(now);
  if (key === todayKey) return 'Today';

  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === dayKey(yesterday)) return 'Yesterday';

  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function groupEventsByDay(events: LocalEvent[], now: Date): DayGroup[] {
  return events.reduce<DayGroup[]>((groups, event) => {
    const key = dayKey(new Date(event.occurredAt));
    const last = groups[groups.length - 1];

    if (last && last.key === key) {
      return [...groups.slice(0, -1), { ...last, events: [...last.events, event] }];
    }

    return [...groups, { key, label: dayLabel(key, now), events: [event] }];
  }, []);
}

export function eventIdForOutboxItem(item: OutboxItem): string | null {
  const payload = item.payload as { id?: unknown; eventId?: unknown };
  if (typeof payload.eventId === 'string') return payload.eventId;
  if (typeof payload.id === 'string') return payload.id;
  return null;
}

export function failedSyncByEvent(items: OutboxItem[]): Record<string, FailedSync> {
  return items
    .filter(isOutboxItemFailed)
    .reduce<Record<string, FailedSync>>((byEvent, item) => {
      const eventId = eventIdForOutboxItem(item);
      if (!eventId) return byEvent;

      const existing = byEvent[eventId];
      if (existing && existing.type !== 'attachment:upload') return byEvent;

      return {
        ...byEvent,
        [eventId]: { itemId: item.id, type: item.type, error: item.error },
      };
    }, {});
}

export function failedSyncMessage(failure: FailedSync): string {
  if (failure.type === 'attachment:upload') {
    return "The photo or voice memo didn't upload — tap to try again";
  }
  return "Couldn't save to the shared log — tap to try again";
}
