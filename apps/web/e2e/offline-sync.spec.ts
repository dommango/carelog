import { test, expect, type Page } from '@playwright/test';

const ADMIN_EMAIL = 'admin@carelog.local';
const ADMIN_NAME = 'Admin User';

async function signIn(page: Page) {
  const res = await page.request.post('/api/auth/test-login', {
    data: { email: ADMIN_EMAIL, name: ADMIN_NAME },
  });
  expect(res.ok()).toBe(true);
  await page.goto('/');
}

test('airplane-mode capture syncs exactly one non-duplicated event', async ({ page, context }) => {
  await signIn(page);

  // Wait for initial sync to populate local data.
  await page.waitForSelector('text=No events yet.', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  // Go offline before capture.
  await context.setOffline(true);

  // Create an event while offline using the same localDb/outbox code the UI uses.
  const offlineEventId = await page.evaluate(async () => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');

    const eventId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    const clientId = test.getClientId();
    const now = new Date().toISOString();

    const payload = {
      id: eventId,
      rawInput: 'Offline test breakfast',
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
  });

  expect(offlineEventId).toBeTruthy();

  // Verify the event is in local IndexedDB while still offline.
  const offlineEvent = await page.evaluate(async (id: string) => {
    const test = window.__CARELOG_TEST__;
    if (!test) throw new Error('Test helpers not exposed');
    return await test.localDb.events.get(id);
  }, offlineEventId);
  expect(offlineEvent).toBeTruthy();
  expect(offlineEvent!.rawInput).toBe('Offline test breakfast');

  // Go online and let the outbox drain. Poll instead of sleeping a fixed
  // interval: drain time tracks runner speed, and a hardcoded 3s wait is what
  // made this test fail on its first attempt in CI and pass on retry.
  await context.setOffline(false);

  let syncedEventId: string | undefined;
  await expect
    .poll(
      async () => {
        const found = await page.evaluate(async () => {
          const test = window.__CARELOG_TEST__;
          if (!test) throw new Error('Test helpers not exposed');
          const cursor = await test.getSyncCursor();
          const data = await test.pullDelta(cursor);
          return data.events.find((e) => e.rawInput === 'Offline test breakfast')?.id;
        });
        syncedEventId = found as string | undefined;
        return syncedEventId;
      },
      { timeout: 20_000, intervals: [250, 500, 1000, 1000, 2000] }
    )
    .toBeTruthy();

  expect(syncedEventId).toBe(offlineEventId);

  // Open a fresh browser context and verify the event appears exactly once.
  const newContext = await context.browser()!.newContext();
  const newPage = await newContext.newPage();
  await signIn(newPage);
  await expect(newPage.getByText('Offline test breakfast')).toBeVisible();
  const serverCount = await newPage.locator('[data-testid="event-card"]').count();
  expect(serverCount).toBe(1);
  await newContext.close();
});
