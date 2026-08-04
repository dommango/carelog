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

// pg-boss reports background failures — connection drops, maintenance errors —
// on this emitter. An EventEmitter with no 'error' listener rethrows, so
// without this a transient database blip takes the whole worker down.
boss.on('error', (error) => {
  console.error('[queue] pg-boss error:', error);
});

export function deadLetterQueue(name: string): string {
  return `${name}.dead_letter`;
}

type QueueSpec = {
  name: string;
  retryLimit: number;
  retryBackoff: boolean;
};

/**
 * Every queue retries a bounded number of times and then parks the job in a
 * dead-letter queue. These were previously created with pg-boss defaults, so a
 * job that threw was simply gone: an AI enrichment that failed on a transient
 * error left its event stuck at pending_ai forever, with nothing left to inspect.
 */
export const QUEUE_SPECS: readonly QueueSpec[] = [
  { name: AI_PROCESS_EVENT, retryLimit: 3, retryBackoff: true },
  { name: NOTIFICATION_TICK, retryLimit: 2, retryBackoff: true },
  { name: FEEDBACK_RECONCILE_TICK, retryLimit: 2, retryBackoff: true },
];

export const QUEUES: string[] = QUEUE_SPECS.map((spec) => spec.name);

export async function ensureQueues(specs: readonly QueueSpec[] = QUEUE_SPECS): Promise<void> {
  for (const spec of specs) {
    const deadLetter = deadLetterQueue(spec.name);
    // The dead-letter target must exist before a queue can reference it.
    await boss.createQueue(deadLetter, { name: deadLetter });

    const options = {
      name: spec.name,
      retryLimit: spec.retryLimit,
      retryBackoff: spec.retryBackoff,
      deadLetter,
    };

    await boss.createQueue(spec.name, options);
    // createQueue is a no-op on a queue that already exists, so one created by
    // an earlier deploy would otherwise keep the old defaults forever.
    await boss.updateQueue(spec.name, options);
  }
}

// Memoised so a process starts pg-boss once for its whole lifetime. enqueue()
// used to call boss.start() on every call, re-running schema maintenance and
// opening a fresh pool each time a care event was created from the web app.
let startPromise: Promise<void> | null = null;

export async function start(): Promise<void> {
  if (!startPromise) {
    startPromise = (async () => {
      await boss.start();
      await ensureQueues();
    })();
  }

  try {
    await startPromise;
  } catch (error) {
    // Let the next caller retry rather than caching a failed start forever.
    startPromise = null;
    throw error;
  }
}

export async function stop(): Promise<void> {
  startPromise = null;
  await boss.stop({ graceful: true });
}

export async function enqueue(
  jobType: JobType,
  payload: object,
  options: PgBoss.SendOptions = {}
): Promise<string | null> {
  await start();
  return boss.send(jobType, payload, options);
}
