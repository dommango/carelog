import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@carelog.local';
const ADMIN_NAME = 'Admin User';

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/test-login', {
    // Ignored by the dev server these specs normally run against; required when
    // pointed at a non-development deployment via PLAYWRIGHT_BASE_URL.
    headers: { 'x-test-login-secret': process.env.TEST_LOGIN_SECRET ?? '' },
    data: { email: ADMIN_EMAIL, name: ADMIN_NAME },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
}

test('airplane-mode capture syncs exactly one non-duplicated event', async ({ page, context }) => {
  // Unique per attempt. The note used to be a fixed string and the final
  // assertion counted every event card on the page, so the moment one attempt
  // failed *after* its event reached the server, every retry was doomed: the
  // leftover row made getByText resolve to 2 then 3 elements. Retries exist to
  // absorb a flake, and they cannot if the test is not idempotent.
  const note = `Offline test breakfast ${crypto.randomUUID()}`;

  await signIn(page);

  // Wait for initial sync to populate local data.
  await page.waitForSelector('text=No events yet.', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Go offline before capture.
  await context.setOffline(true);

  // Create an event while offline using the same localDb/outbox code the UI uses.
  const offlineEventId = await page.evaluate(async (rawInput: string) => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');

    const eventId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const clientId = test.getClientId();
    const now = new Date().toISOString();

    const payload = {
      id: eventId,
      rawInput,
      category: 'meal',
      occurredAt: now,
      clientId,
      idempotencyKey,
      attachments: [],
    };

    const localEvent = test.eventToLocal({
      ...payload,
      patientId: '',
      authorId: '',
      status: 'pending_ai',
      capturedAt: now,
      hasConflict: false,
      version: 1,
      updatedAt: now,
      createdAt: now,
      deletedAt: null,
      attachments: [],
    }, false);

    await test.localDb.events.put(localEvent);
    await test.queueOutbox({
      id: eventId,
      type: 'event:create',
      payload,
      idempotencyKey,
      clientId,
    });

    return eventId;
  }, note);

  expect(offlineEventId).toBeTruthy();

  // Verify the event is in local IndexedDB while still offline.
  const offlineEvent = await page.evaluate(async (id: string) => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');
    return await test.localDb.events.get(id);
  }, offlineEventId);
  expect(offlineEvent).toBeTruthy();
  expect(offlineEvent!.rawInput).toBe(note);

  // Go online and let the outbox drain. Poll instead of sleeping a fixed
  // interval: drain time tracks runner speed, and a hardcoded 3s wait is what
  // made this test fail on its first attempt in CI and pass on retry.
  await context.setOffline(false);

  let syncedEventId: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await page.evaluate(async (rawInput: string) => {
          const test = window.__CARELOG_TEST__;
          if (!test) throw new Error('Test helpers not exposed');
          const cursor = await test.getSyncCursor();
          const data = await test.pullDelta(cursor);
          return data.events.find((e) => e.rawInput === rawInput)?.id;
        }, note);
        syncedEventId = found as string | undefined;
        return syncedEventId;
      },
      // 45s, not 20s. The drain normally fires off the browser's `online`
      // event and lands in well under a second. But startOutboxDrain's backstop
      // is a 30s interval, so a missed `online` event used to blow a 20s budget
      // by design — and this runs against `next dev`, which compiles each API
      // route on first request, so the first POST /api/events on a cold CI
      // runner is slow on top of that. The budget now covers the app's own
      // recovery path instead of racing it.
      { timeout: 45_000, intervals: [250, 500, 1000, 1000, 2000] }
    )
    .toBeTruthy();

  expect(syncedEventId).toBe(offlineEventId);

  // Open a fresh browser context and verify the event appears exactly once.
  const newContext = await context.browser()!.newContext();
  const newPage = await newContext.newPage();
  await signIn(newPage);
  await expect(newPage.getByText(note)).toBeVisible();
  // Cards carrying *this* note, not every card on the page. The duplication
  // this guards against is one capture becoming two rows, which is what the
  // idempotency key exists to prevent; unrelated events are not evidence of it.
  const serverCount = await newPage.locator('[data-testid="event-card"]', { hasText: note }).count();
  expect(serverCount).toBe(1);
  await newContext.close();
});
