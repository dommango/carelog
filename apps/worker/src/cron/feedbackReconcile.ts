// Pokes the web app's guarded reconciler route so unsynced feedback rows get
// mirrored to the central Notion DB. The reconciler itself lives in the web app
// (it needs the Prisma client and the screenshot-URL builder); the worker only
// owns the schedule, since it is the always-on process.
//
// No-ops when APP_BASE_URL or CRON_SECRET is unset, so a dev worker without the
// feedback env configured stays quiet instead of erroring every tick.

const TIMEOUT_MS = 30_000;

export async function runFeedbackReconcileTick(): Promise<void> {
  const baseUrl = (process.env.APP_BASE_URL ?? '').replace(/\/+$/, '');
  const secret = process.env.CRON_SECRET ?? '';
  if (!baseUrl || !secret) return;

  try {
    const res = await fetch(`${baseUrl}/api/cron/reconcile-feedback`, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.warn(`[worker] feedback reconcile returned ${res.status}`);
      return;
    }
    const summary = await res.json();
    console.log('[worker] feedback reconcile', summary);
  } catch (error) {
    console.warn(`[worker] feedback reconcile failed: ${String(error)}`);
  }
}
