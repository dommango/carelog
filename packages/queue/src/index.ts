import PgBoss from 'pg-boss';

export const AI_PROCESS_EVENT = 'ai.process_event';
export const NOTIFICATION_TICK = 'notification.tick';

export type JobType = typeof AI_PROCESS_EVENT | typeof NOTIFICATION_TICK | string;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for pg-boss');
}

export const boss = new PgBoss(databaseUrl);

export async function start(): Promise<void> {
  await boss.start();
}

export async function stop(): Promise<void> {
  await boss.stop();
}

export async function enqueue(jobType: JobType, payload: object): Promise<string | null> {
  await boss.start();
  return boss.send(jobType, payload);
}
