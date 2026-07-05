import { localDb, eventToLocal, templateToLocal, scheduleToLocal, setMeta, getMeta } from './localDb';

export interface DeltaResult {
  events: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
  schedules: Array<Record<string, unknown>>;
  cursor: string;
}

export async function pullDelta(since?: string): Promise<DeltaResult> {
  const url = new URL('/api/sync', window.location.origin);
  if (since) url.searchParams.set('since', since);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Delta sync failed: ${res.status}`);
  }

  const data = (await res.json()) as DeltaResult;
  await mergeDelta(data);
  return data;
}

export async function mergeDelta(data: DeltaResult): Promise<void> {
  await localDb.transaction('rw', localDb.events, localDb.templates, localDb.schedules, localDb.meta, async () => {
    for (const event of data.events) {
      if (event.deletedAt) {
        await localDb.events.delete(event.id as string);
      } else {
        await localDb.events.put(eventToLocal(event, true));
      }
    }

    for (const template of data.templates) {
      if (template.isActive === false) {
        await localDb.templates.delete(template.id as string);
      } else {
        await localDb.templates.put(templateToLocal(template));
      }
    }

    for (const schedule of data.schedules) {
      if (schedule.status === 'paused') {
        await localDb.schedules.delete(schedule.id as string);
      } else {
        await localDb.schedules.put(scheduleToLocal(schedule));
      }
    }

    await setMeta('syncCursor', data.cursor);
  });
}

export async function getSyncCursor(): Promise<string | undefined> {
  return getMeta<string>('syncCursor');
}

export function startDeltaSync(): () => void {
  const abort = new AbortController();

  const pull = async () => {
    try {
      const cursor = await getSyncCursor();
      await pullDelta(cursor);
    } catch (err) {
      console.error('Delta sync error', err);
    }
  };

  pull();
  window.addEventListener('focus', pull);

  return () => {
    abort.abort();
    window.removeEventListener('focus', pull);
  };
}
