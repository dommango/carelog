import PgBoss from 'pg-boss';

export * from './notifications.js';
export * from './schedules.js';

export const AI_PROCESS_EVENT = 'ai.process_event';
export const NOTIFICATION_TICK = 'notification.tick';
export const FEEDBACK_RECONCILE_TICK = 'feedback.reconcile_tick';

export type JobType =
  | typeof AI_PROCESS_EVENT
  | typeof NOTIFICATION_TICK
  | typeof FEEDBACK_RECONCILE_TICK
  | string;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for pg-boss');
}

export const boss = new PgBoss(databaseUrl);

// Queues that must exist before any work/send/schedule. pg-boss v10 no longer
// auto-creates queues, so we register them explicitly (createQueue is idempotent).
export const QUEUES: string[] = [AI_PROCESS_EVENT, NOTIFICATION_TICK, FEEDBACK_RECONCILE_TICK];

export async function ensureQueues(names: string[] = QUEUES): Promise<void> {
  for (const name of names) {
    await boss.createQueue(name);
  }
}

export async function start(): Promise<void> {
  await boss.start();
  await ensureQueues();
}

export async function stop(): Promise<void> {
  await boss.stop();
}

export async function enqueue(jobType: JobType, payload: object): Promise<string | null> {
  await boss.start();
  await boss.createQueue(jobType);
  return boss.send(jobType, payload);
}
