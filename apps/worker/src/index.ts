import {
  boss,
  AI_PROCESS_EVENT,
  NOTIFICATION_TICK,
  FEEDBACK_RECONCILE_TICK,
  start,
  stop,
} from '@carelog/queue';
import { processEvent } from './pipeline/processEvent.js';
import { runNotificationTick } from './cron/notifications.js';
import { runFeedbackReconcileTick } from './cron/feedbackReconcile.js';

async function main() {
  await start();
  console.log('[worker] Started pg-boss');

  await boss.work(AI_PROCESS_EVENT, async (jobs) => {
    const job = jobs[0];
    const { eventId } = job.data as { eventId: string };
    await processEvent(eventId);
  });

  await boss.work(NOTIFICATION_TICK, async (jobs) => {
    const job = jobs[0];
    const { now } = job.data as { now?: string };
    await runNotificationTick(now ? new Date(now) : new Date());
  });

  await boss.work(FEEDBACK_RECONCILE_TICK, async () => {
    await runFeedbackReconcileTick();
  });

  await boss.schedule(NOTIFICATION_TICK, '* * * * *', { now: new Date().toISOString() });
  await boss.schedule(FEEDBACK_RECONCILE_TICK, '*/30 * * * *', {});

  console.log(
    `[worker] Subscribed to ${AI_PROCESS_EVENT}, ${NOTIFICATION_TICK} and ${FEEDBACK_RECONCILE_TICK}`,
  );
}

async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}, shutting down...`);
  await stop();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((error) => {
  console.error('[worker] Failed to start:', error);
  process.exit(1);
});
