// GET /api/health — liveness for the whole container.
//
// Web and worker share one container, so "the web server answers HTTP" is not
// evidence the app works: the worker can die and leave every reminder unfired
// while this process keeps serving pages perfectly. Railway's healthcheck points
// here so that failure restarts the container instead of going unnoticed.
//
// Deliberately unauthenticated, and deliberately says nothing an attacker could
// use — no versions, no counts, no error text.

import { prisma } from '@/lib/prisma';
import { AI_PROCESS_EVENT } from '@carelog/queue';

export const dynamic = 'force-dynamic';

/** A worker missing three of its one-minute ticks is not merely slow. */
const HEARTBEAT_STALE_MS = 3 * 60_000;

type Check = 'ok' | 'degraded' | 'down';

export async function GET() {
  const now = Date.now();

  const [database, worker, queue] = await Promise.all([
    checkDatabase(),
    checkWorker(now),
    checkQueueDepth(),
  ]);

  // The database is the only hard dependency: without it nothing works. A
  // stalled worker is degraded — reads still serve, writes still persist, and
  // enrichment catches up once it restarts.
  const status: Check = database !== 'ok' ? 'down' : worker.status !== 'ok' ? 'degraded' : 'ok';

  return Response.json(
    {
      status,
      checks: {
        database,
        worker: worker.status,
        lastWorkerTickAgeSeconds: worker.ageSeconds,
        aiQueueDepth: queue,
      },
    },
    {
      status: status === 'down' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}

async function checkDatabase(): Promise<Check> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (error) {
    console.error('[health] Database check failed:', error);
    return 'down';
  }
}

async function checkWorker(now: number): Promise<{ status: Check; ageSeconds: number | null }> {
  try {
    const heartbeat = await prisma.workerHeartbeat.findUnique({ where: { id: 'singleton' } });
    if (!heartbeat) {
      // No worker has ever ticked — a fresh deployment, or one that has never
      // come up. Either way enrichment and reminders are not running.
      return { status: 'degraded', ageSeconds: null };
    }

    const ageMs = now - heartbeat.tickedAt.getTime();
    return {
      status: ageMs > HEARTBEAT_STALE_MS ? 'degraded' : 'ok',
      ageSeconds: Math.max(0, Math.round(ageMs / 1000)),
    };
  } catch (error) {
    console.error('[health] Worker heartbeat check failed:', error);
    return { status: 'degraded', ageSeconds: null };
  }
}

/**
 * Backlog of AI enrichment jobs waiting to be picked up.
 *
 * Read straight from pg-boss's own table rather than through `boss.getQueueSize`:
 * that needs a started pg-boss instance, and the web process only starts one
 * lazily when it first enqueues something — so on a freshly booted container the
 * number a healthcheck most wants would always have been null. Returns null if
 * the pgboss schema does not exist yet (nothing has ever been queued).
 */
async function checkQueueDepth(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pgboss.job
      WHERE name = ${AI_PROCESS_EVENT}
        AND state < 'active'
    `;
    const count = rows[0]?.count;
    return count === undefined ? null : Number(count);
  } catch (error) {
    console.error('[health] Queue depth check failed:', error);
    return null;
  }
}
