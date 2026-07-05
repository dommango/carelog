import { boss, AI_PROCESS_EVENT, start, stop } from '@carelog/queue';
import { processEvent } from './pipeline/processEvent.js';

async function main() {
  await start();
  console.log('[worker] Started pg-boss');

  await boss.work(AI_PROCESS_EVENT, async (jobs) => {
    const job = jobs[0];
    const { eventId } = job.data as { eventId: string };
    await processEvent(eventId);
  });

  console.log(`[worker] Subscribed to ${AI_PROCESS_EVENT}`);
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
