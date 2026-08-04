import { localDb, getClientId, isOnline, type OutboxItem, type LocalEvent } from './localDb';

export const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;

let drainPromise: Promise<void> | null = null;
let drainTimeout: ReturnType<typeof setTimeout> | null = null;

export async function queueOutbox(item: Omit<OutboxItem, 'retries' | 'error' | 'createdAt'>): Promise<void> {
  await localDb.outbox.put({
    ...item,
    retries: 0,
    error: null,
    createdAt: new Date().toISOString(),
  });
  scheduleDrain();
}

export async function drainOutbox(options?: { signal?: AbortSignal }): Promise<void> {
  if (drainPromise) return drainPromise;
  if (!isOnline()) return;

  drainPromise = (async () => {
    const items = await localDb.outbox.orderBy('createdAt').toArray();

    for (const item of items) {
      if (options?.signal?.aborted) break;
      if (item.retries >= MAX_RETRIES) continue;

      try {
        await processOutboxItem(item);
        await localDb.outbox.delete(item.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const networkFailure = isNetworkFailure(error);
        const retries = networkFailure ? item.retries : item.retries + 1;
        await localDb.outbox.update(item.id, {
          retries,
          error: message,
        });
        if (retries >= MAX_RETRIES) {
          console.error(`Outbox item ${item.id} exceeded max retries`, message);
        }
        if (networkFailure && !isOnline()) break;
      }
    }
  })();

  try {
    await drainPromise;
  } finally {
    drainPromise = null;
  }
}

// A request that never reached the server says nothing about whether the write
// is acceptable, so it must not spend part of the item's retry budget.
function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || !isOnline();
}

export function isOutboxItemFailed(item: OutboxItem): boolean {
  return item.retries >= MAX_RETRIES;
}

export async function listFailedOutboxItems(): Promise<OutboxItem[]> {
  const items = await localDb.outbox.orderBy('createdAt').toArray();
  return items.filter(isOutboxItemFailed);
}

export async function retryOutboxItem(id: string): Promise<void> {
  await localDb.outbox.update(id, { retries: 0, error: null });
  scheduleDrain();
}

// Items that failed part-way through get their budget back on a fresh
// connection; exhausted ones stay put so a rejected write is not replayed at
// the server forever without someone asking for it.
export async function resetOutboxRetries(): Promise<void> {
  const items = await localDb.outbox.toArray();
  const stalled = items.filter((item) => item.retries > 0 && item.retries < MAX_RETRIES);
  await Promise.all(
    stalled.map((item) => localDb.outbox.update(item.id, { retries: 0, error: null }))
  );
}

async function processOutboxItem(item: OutboxItem): Promise<void> {
  switch (item.type) {
    case 'event:create':
      await processEventCreate(item);
      break;
    case 'event:update':
      await processEventUpdate(item);
      break;
    case 'attachment:upload':
      await processAttachmentUpload(item);
      break;
    default:
      throw new Error(`Unknown outbox type: ${item.type}`);
  }
}

async function processEventCreate(item: OutboxItem): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    const existing = await fetchExistingEvent(item.idempotencyKey);
    if (existing) {
      await mergeServerEvent(existing);
      return;
    }
    throw new Error('Conflict but existing event not found');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error?.formErrors?.join('\n') || `Create failed: ${res.status}`);
  }

  const data = (await res.json()) as { event: Record<string, unknown>; uploads: Array<{ attachmentId: string; url: string; method: string }> };
  await mergeServerEvent(data.event);

  const attachmentUploads = data.uploads ?? [];
  const pendingUploads = (payload.attachments as Array<{ id: string; kind: string; mimeType: string }> | undefined) ?? [];

  for (const upload of attachmentUploads) {
    const draft = pendingUploads.find((a) => a.id === upload.attachmentId);
    if (!draft) continue;
    await queueOutbox({
      id: `${item.id}:upload:${upload.attachmentId}`,
      type: 'attachment:upload',
      payload: {
        eventId: data.event.id,
        attachmentId: upload.attachmentId,
        url: upload.url,
        method: upload.method,
        blobId: `${item.id}:blob:${upload.attachmentId}`,
      },
      idempotencyKey: `${item.idempotencyKey}:upload:${upload.attachmentId}`,
      clientId: item.clientId,
    });
  }

  // Uploaded events may still need their attachments drained immediately in tests.
  if (attachmentUploads.length > 0) {
    scheduleDrain();
  }
}

async function processEventUpdate(item: OutboxItem): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const res = await fetch(`/api/events/${payload.eventId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rawInput: payload.rawInput,
      category: payload.category,
      occurredAt: payload.occurredAt,
      version: payload.version,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error?.formErrors?.join('\n') || `Update failed: ${res.status}`);
  }

  const updated = (await res.json()) as Record<string, unknown>;
  await mergeServerEvent(updated);
}

async function processAttachmentUpload(item: OutboxItem): Promise<void> {
  const payload = item.payload as Record<string, unknown>;
  const blobId = payload.blobId as string;
  const blobRow = await localDb.blobs.get(blobId);
  if (!blobRow) {
    // Already uploaded or missing; still try to complete on server side.
    await completeAttachment(payload.attachmentId as string);
    return;
  }

  const res = await fetch(payload.url as string, {
    method: payload.method as string,
    headers: { 'content-type': blobRow.mimeType },
    body: blobRow.blob,
  });

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`);
  }

  await completeAttachment(payload.attachmentId as string);
  await localDb.blobs.delete(blobId);
}

async function completeAttachment(attachmentId: string): Promise<void> {
  const res = await fetch(`/api/attachments/${attachmentId}/complete`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Complete failed: ${res.status}`);
  }
}

async function fetchExistingEvent(idempotencyKey: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`/api/events?idempotencyKey=${encodeURIComponent(idempotencyKey)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { event?: Record<string, unknown> };
  return data.event ?? null;
}

export async function mergeServerEvent(event: Record<string, unknown>): Promise<void> {
  const local = await localDb.events.get(event.id as string);
  const localEvent: LocalEvent = {
    id: event.id as string,
    patientId: event.patientId as string,
    authorId: event.authorId as string,
    authorName: (event.author as { name?: string | null } | undefined)?.name ?? local?.authorName ?? null,
    category: event.category as LocalEvent['category'],
    status: event.status as LocalEvent['status'],
    occurredAt: event.occurredAt as string,
    capturedAt: event.capturedAt as string,
    rawInput: (event.rawInput as string | null) ?? null,
    structuredData: (event.structuredData as Record<string, unknown> | null) ?? null,
    aiConfidence: (event.aiConfidence as number | null) ?? null,
    aiFlags: (event.aiFlags as string[] | undefined) ?? [],
    aiModelVersion: (event.aiModelVersion as string | null) ?? null,
    scheduleId: (event.scheduleId as string | null) ?? null,
    templateId: (event.templateId as string | null) ?? null,
    hasConflict: (event.hasConflict as boolean | undefined) ?? false,
    version: (event.version as number | undefined) ?? (local?.version ?? 1),
    clientId: (event.clientId as string | undefined) ?? local?.clientId ?? getClientId(),
    idempotencyKey: (event.idempotencyKey as string | undefined) ?? local?.idempotencyKey ?? '',
    updatedAt: event.updatedAt as string,
    createdAt: event.createdAt as string,
    deletedAt: (event.deletedAt as string | null) ?? null,
    attachments: ((event.attachments as unknown[]) ?? local?.attachments ?? []).map((a) =>
      mapAttachment(a as Record<string, unknown>)
    ),
    synced: true,
  };

  await localDb.events.put(localEvent);
}

function mapAttachment(a: Record<string, unknown>) {
  return {
    id: a.id as string,
    kind: a.kind as 'photo' | 'audio',
    mimeType: a.mimeType as string,
    storageKey: (a.storageKey as string | null) ?? null,
    sizeBytes: (a.sizeBytes as number | null) ?? null,
    uploadedAt: (a.uploadedAt as string | null) ?? null,
    transcript: (a.transcript as string | null) ?? null,
    visionSummary: (a.visionSummary as string | null) ?? null,
    createdAt: a.createdAt as string,
  };
}

export function scheduleDrain(): void {
  if (drainTimeout) clearTimeout(drainTimeout);
  if (!isOnline()) return;
  drainTimeout = setTimeout(() => {
    drainOutbox().catch((err) => console.error('Scheduled drain failed', err));
  }, 100);
}

export function startOutboxDrain(): () => void {
  const abort = new AbortController();

  const handleOnline = () => {
    resetOutboxRetries()
      .then(() => drainOutbox({ signal: abort.signal }))
      .catch((err) => console.error('Reconnect drain failed', err));
  };
  const handleFocus = () => drainOutbox({ signal: abort.signal });

  window.addEventListener('online', handleOnline);
  window.addEventListener('focus', handleFocus);

  const interval = setInterval(() => {
    if (isOnline()) drainOutbox({ signal: abort.signal });
  }, 30_000);

  drainOutbox({ signal: abort.signal });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      if ('sync' in registration) {
        registration.sync
          .register('carelog-drain')
          .catch((err) => console.error('Sync registration failed', err));
      }
    });
  }

  return () => {
    abort.abort();
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('focus', handleFocus);
    clearInterval(interval);
  };
}
