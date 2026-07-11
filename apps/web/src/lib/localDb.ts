import Dexie, { type EntityTable } from 'dexie';
import type { EventCategory, EventStatus } from '@carelog/db';

export interface LocalEvent {
  id: string;
  patientId: string;
  authorId: string;
  authorName?: string | null;
  category: EventCategory | null;
  status: EventStatus;
  occurredAt: string;
  capturedAt: string;
  rawInput: string | null;
  structuredData: Record<string, unknown> | null;
  aiConfidence: number | null;
  aiFlags: string[];
  aiModelVersion: string | null;
  scheduleId: string | null;
  templateId: string | null;
  hasConflict: boolean;
  version: number;
  clientId: string;
  idempotencyKey: string;
  updatedAt: string;
  createdAt: string;
  deletedAt: string | null;
  attachments: LocalAttachment[];
  synced: boolean;
}

export interface LocalAttachment {
  id: string;
  kind: 'photo' | 'audio';
  mimeType: string;
  storageKey: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  transcript: string | null;
  visionSummary: string | null;
  createdAt: string;
}

export type OutboxType = 'event:create' | 'event:update' | 'attachment:upload';

export interface OutboxItem {
  id: string;
  type: OutboxType;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  clientId: string;
  createdAt: string;
  retries: number;
  error: string | null;
}

export interface LocalBlob {
  id: string;
  blob: Blob;
  mimeType: string;
  eventId: string;
}

export interface Meta {
  key: string;
  value: unknown;
}

export interface LocalTemplate {
  id: string;
  patientId: string;
  name: string;
  category: EventCategory;
  defaults: Record<string, unknown>;
  icon: string | null;
  createdBy: string;
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface LocalSchedule {
  id: string;
  patientId: string;
  templateId: string | null;
  name: string;
  rrule: string;
  windowMinutes: number;
  remindOffsets: number[];
  escalation: Record<string, unknown> | null;
  status: 'active' | 'paused';
  updatedAt: string;
  createdAt: string;
}

export class CareLogDb extends Dexie {
  events!: EntityTable<LocalEvent, 'id'>;
  outbox!: EntityTable<OutboxItem, 'id'>;
  blobs!: EntityTable<LocalBlob, 'id'>;
  meta!: EntityTable<Meta, 'key'>;
  templates!: EntityTable<LocalTemplate, 'id'>;
  schedules!: EntityTable<LocalSchedule, 'id'>;

  constructor() {
    super('carelog-db');
    this.version(1).stores({
      events: 'id, patientId, occurredAt, updatedAt, category, status, [patientId+occurredAt]',
      outbox: 'id, createdAt, retries',
      blobs: 'id, eventId',
      meta: 'key',
      templates: 'id, patientId, updatedAt',
      schedules: 'id, patientId, updatedAt',
    });
  }
}

export const localDb = new CareLogDb();

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export function getClientId(): string {
  if (typeof window === 'undefined') return 'web';
  let clientId = window.localStorage.getItem('carelog:clientId');
  if (!clientId) {
    clientId = `${navigator.userAgent.slice(0, 20)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem('carelog:clientId', clientId);
  }
  return clientId;
}

export async function getMeta<T>(key: string, fallback?: T): Promise<T | undefined> {
  const row = await localDb.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await localDb.meta.put({ key, value });
}

export function eventToLocal(event: Record<string, unknown>, synced = true): LocalEvent {
  return {
    id: event.id as string,
    patientId: event.patientId as string,
    authorId: event.authorId as string,
    authorName: (event.author as { name?: string | null } | undefined)?.name ?? null,
    category: (event.category as EventCategory | null) ?? null,
    status: event.status as EventStatus,
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
    version: (event.version as number | undefined) ?? 1,
    clientId: event.clientId as string,
    idempotencyKey: event.idempotencyKey as string,
    updatedAt: event.updatedAt as string,
    createdAt: event.createdAt as string,
    deletedAt: (event.deletedAt as string | null) ?? null,
    attachments: (((event.attachments as unknown[]) ?? []) as Record<string, unknown>[]).map(
      attachmentToLocal
    ),
    synced,
  };
}

export function attachmentToLocal(attachment: Record<string, unknown>): LocalAttachment {
  return {
    id: attachment.id as string,
    kind: attachment.kind as 'photo' | 'audio',
    mimeType: attachment.mimeType as string,
    storageKey: (attachment.storageKey as string | null) ?? null,
    sizeBytes: (attachment.sizeBytes as number | null) ?? null,
    uploadedAt: (attachment.uploadedAt as string | null) ?? null,
    transcript: (attachment.transcript as string | null) ?? null,
    visionSummary: (attachment.visionSummary as string | null) ?? null,
    createdAt: attachment.createdAt as string,
  };
}

export function templateToLocal(template: Record<string, unknown>): LocalTemplate {
  return {
    id: template.id as string,
    patientId: template.patientId as string,
    name: template.name as string,
    category: template.category as EventCategory,
    defaults: (template.defaults as Record<string, unknown>) ?? {},
    icon: (template.icon as string | null) ?? null,
    createdBy: template.createdBy as string,
    isActive: (template.isActive as boolean | undefined) ?? true,
    updatedAt: template.updatedAt as string,
    createdAt: template.createdAt as string,
  };
}

export function scheduleToLocal(schedule: Record<string, unknown>): LocalSchedule {
  return {
    id: schedule.id as string,
    patientId: schedule.patientId as string,
    templateId: (schedule.templateId as string | null) ?? null,
    name: schedule.name as string,
    rrule: schedule.rrule as string,
    windowMinutes: (schedule.windowMinutes as number | undefined) ?? 90,
    remindOffsets: (schedule.remindOffsets as number[] | undefined) ?? [0],
    escalation: (schedule.escalation as Record<string, unknown> | null) ?? null,
    status: schedule.status as 'active' | 'paused',
    updatedAt: schedule.updatedAt as string,
    createdAt: schedule.createdAt as string,
  };
}
