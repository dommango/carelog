import { prisma } from '@carelog/db';

export const HEARTBEAT_ID = 'singleton';

/**
 * Stamp the worker's cron loop as alive. Called after each notification tick.
 *
 * Web and worker share a container, so `/api/health` cannot observe the worker
 * process directly — and a worker that died leaves every reminder unfired while
 * the container still answers HTTP perfectly happily. The database is the only
 * thing both processes can see.
 *
 * Deliberately never throws: failing to record liveness must not fail the tick
 * that actually delivers reminders.
 */
export async function recordTick(now: Date = new Date()): Promise<void> {
  try {
    await prisma.workerHeartbeat.upsert({
      where: { id: HEARTBEAT_ID },
      update: { tickedAt: now },
      create: { id: HEARTBEAT_ID, tickedAt: now },
    });
  } catch (error) {
    console.error('[worker] Failed to record heartbeat:', error);
  }
}
