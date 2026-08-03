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
import { recordTick } from './health/heartbeat.js';

function eventIdFrom(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const { eventId } = data as { eventId?: unknown };
  return typeof eventId === 'string' && eventId.length > 0 ? eventId : null;
}

async function main() {
  await start();
  console.log('[worker] Started pg-boss');

  // Each handler iterates the whole batch. They previously took jobs[0] and
  // dropped the rest, which is invisible at the default batch size of 1 and
  // silently loses work the moment it is raised.
  await boss.work(AI_PROCESS_EVENT, async (jobs) => {
    for (const job of jobs) {
      const eventId = eventIdFrom(job.data);
      if (!eventId) {
        // Not thrown: a malformed payload is not transient, so retrying it
        // three times and dead-lettering it only adds noise.
        console.error(`[worker] ${AI_PROCESS_EVENT} job ${job.id} has no eventId; discarding`);
        continue;
      }
      await processEvent(eventId);
    }
  });

  await boss.work(NOTIFICATION_TICK, async (jobs) => {
    for (const _job of jobs) {
      await runNotificationTick(new Date());
      await recordTick();
    }
  });

  await boss.work(FEEDBACK_RECONCILE_TICK, async (jobs) => {
    for (const _job of jobs) {
      await runFeedbackReconcileTick();
    }
  });

  // No payload, deliberately. This used to send `{ now: new Date().toISOString() }`.
  // A schedule's payload is evaluated once, when the schedule is registered at
  // boot, and then replayed verbatim on every tick — so every minute for the
  // life of the process the handler re-evaluated the same frozen instant, and
  // reminders stopped firing shortly after startup. The handler now reads the
  // real current time.
  await boss.schedule(NOTIFICATION_TICK, '* * * * *');
  await boss.schedule(FEEDBACK_RECONCILE_TICK, '*/30 * * * *');

  console.log(
    `[worker] Subscribed to ${AI_PROCESS_EVENT}, ${NOTIFICATION_TICK} and ${FEEDBACK_RECONCILE_TICK}`,
  );
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] Received ${signal}, shutting down...`);

  try {
    // Awaited so in-flight jobs finish and pg-boss releases their locks.
    // Exiting underneath them leaves jobs stuck 'active' until they expire.
    await stop();
  } catch (error) {
    console.error('[worker] Error during shutdown:', error);
    process.exit(1);
  }

  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

// Without this, a rejected promise nobody awaited terminates the process under
// Node's default policy, with no indication of which one.
process.on('unhandledRejection', (reason) => {
  console.error('[worker] Unhandled promise rejection:', reason);
});

main().catch((error) => {
  console.error('[worker] Failed to start:', error);
  process.exit(1);
});
